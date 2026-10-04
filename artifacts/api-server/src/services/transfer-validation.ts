import { ImportDataBody } from "@workspace/api-zod";
import type { z } from "zod";
import { validPriceDate, shopKey } from "./price-selection";

export type TransferBundle = z.infer<typeof ImportDataBody>["data"];
export type TransferCounts = Record<
  "items" | "categories" | "locations" | "units" | "shoppingList",
  number
> & { shops?: number; prices?: number };
export class TransferError extends Error {}

/** Match existing records one-to-one, never collapsing distinct source IDs in the same backup. */
export function availableMatches<T>(rows: T[], identity: (row: T) => string) {
  const groups = new Map<string, T[]>();
  const offsets = new Map<string, number>();
  for (const row of rows) {
    const key = identity(row);
    const group = groups.get(key) ?? [];
    group.push(row);
    groups.set(key, group);
  }
  return (key: string): T | undefined => {
    const offset = offsets.get(key) ?? 0;
    offsets.set(key, offset + 1);
    return groups.get(key)?.[offset];
  };
}

export function emptyBundle(): TransferBundle {
  return {
    format: "stockkeeper",
    version: 2,
    categories: [],
    locations: [],
    units: [],
    items: [],
    shoppingList: [],
    shops: [],
    prices: [],
  };
}

export function counts(data: TransferBundle): TransferCounts {
  return {
    items: data.items.length,
    categories: data.categories.length,
    locations: data.locations.length,
    units: data.units.length,
    shoppingList: data.shoppingList.length,
    ...((data.shops?.length ?? 0) > 0 ? { shops: data.shops!.length } : {}),
    ...((data.prices?.length ?? 0) > 0 ? { prices: data.prices!.length } : {}),
  };
}

export function validPrice(value: number | null | undefined): boolean {
  return (
    value == null ||
    (Number.isFinite(value) &&
      value >= 0 &&
      value <= 999999999999.99 &&
      Number(value.toFixed(2)) === value)
  );
}

export function validateBundle(input: unknown): TransferBundle {
  const parsed = ImportDataBody.shape.data.safeParse(input);
  if (!parsed.success) {
    throw new TransferError(
      `Некорректный формат данных: ${parsed.error.issues[0]?.path.join(".") ?? "файл"}`,
    );
  }
  const data = parsed.data;
  const tables = [
    data.categories,
    data.locations,
    data.units,
    data.items,
    data.shoppingList,
    data.shops ?? [],
    data.prices ?? [],
  ];
  if (tables.reduce((sum, rows) => sum + rows.length, 0) > 15000) {
    throw new TransferError("Максимум 15 000 записей в одном файле.");
  }
  for (const rows of tables) {
    const ids = new Set<number>();
    for (const row of rows) {
      if (
        !Number.isSafeInteger(row.id) ||
        row.id <= 0 ||
        row.id > 2147483647 ||
        ids.has(row.id)
      ) {
        throw new TransferError(
          "Идентификаторы должны быть уникальными положительными целыми числами.",
        );
      }
      ids.add(row.id);
      if ("name" in row && (!row.name.trim() || row.name.length > 500)) {
        throw new TransferError(
          "Название обязательно и не должно превышать 500 символов.",
        );
      }
      for (const [key, value] of Object.entries(row)) {
        if (
          typeof value === "string" &&
          (value.length > 16000 || value.includes("\0"))
        ) {
          throw new TransferError(
            `Поле ${key} содержит слишком длинный или недопустимый текст.`,
          );
        }
        if (
          (key === "createdAt" || key === "updatedAt") &&
          value != null &&
          (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        ) {
          throw new TransferError(`Некорректная дата ${key}.`);
        }
      }
    }
  }
  const catIds = new Set(data.categories.map((c) => c.id));
  const locIds = new Set(data.locations.map((l) => l.id));
  const unitIds = new Set(data.units.map((u) => u.id));
  const itemIds = new Set(data.items.map((i) => i.id));
  const shopIds = new Set((data.shops ?? []).map((s) => s.id));
  const keys = new Set<string>();
  for (const shop of data.shops ?? []) {
    const key = shopKey(shop.name);
    if (!key || shop.name.length > 120 || keys.has(key))
      throw new TransferError(
        "Магазины должны иметь уникальные непустые названия до 120 символов.",
      );
    keys.add(key);
  }
  const assertRef = (
    value: number | null | undefined,
    ids: Set<number>,
    name: string,
  ) => {
    if (value != null && !ids.has(value))
      throw new TransferError(`Не найдена связанная запись: ${name}.`);
  };
  const parents = new Map(data.categories.map((c) => [c.id, c.parentId]));
  for (const cat of data.categories) {
    assertRef(cat.parentId, catIds, "родительская категория");
    const seen = new Set<number>();
    let current: number | null | undefined = cat.id;
    while (current != null) {
      if (seen.has(current))
        throw new TransferError("Циклическая иерархия категорий.");
      seen.add(current);
      if (seen.size > 64)
        throw new TransferError("Максимальная глубина категорий — 64 уровня.");
      current = parents.get(current);
    }
  }
  const quantity = (n: number) => {
    if (!Number.isInteger(n) || n < 0 || n > 2147483647) {
      throw new TransferError(
        "Количество должно быть целым неотрицательным числом до 2147483647.",
      );
    }
  };
  for (const item of data.items) {
    quantity(item.quantity);
    if (!validPrice(item.price))
      throw new TransferError(
        "Цена должна быть неотрицательной, максимум два знака после запятой.",
      );
    assertRef(item.categoryId, catIds, "категория");
    assertRef(item.locationId, locIds, "место хранения");
    assertRef(item.unitId, unitIds, "единица измерения");
  }
  for (const entry of data.shoppingList) {
    quantity(entry.quantity);
    assertRef(entry.itemId, itemIds, "товар списка покупок");
  }
  for (const price of data.prices ?? []) {
    assertRef(price.itemId, itemIds, "товар цены");
    assertRef(price.shopId, shopIds, "магазин цены");
    if (!validPrice(price.price) || !validPriceDate(price.priceDate))
      throw new TransferError("Некорректная сумма или дата цены.");
  }
  return data;
}

/** Ownership and source IDs are intentionally excluded from record identity. */
export function itemIdentity(item: {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  categoryId?: number | null;
  locationId?: number | null;
  location?: string | null;
  unitId?: number | null;
  unit?: string | null;
  tags?: string | null;
  description?: string | null;
}): string {
  return JSON.stringify([
    item.name,
    item.sku ?? "",
    item.barcode ?? "",
    item.categoryId ?? null,
    item.locationId ?? null,
    item.location ?? "",
    item.unitId ?? null,
    item.unit ?? "",
    [
      ...new Set(
        (item.tags ?? "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean),
      ),
    ].sort(),
    item.description ?? "",
  ]);
}
