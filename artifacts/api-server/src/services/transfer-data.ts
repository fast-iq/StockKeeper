import {
  db,
  itemsTable,
  categoriesTable,
  locationsTable,
  unitsTable,
  shoppingListTable,
  shopsTable,
  itemPricesTable,
} from "@workspace/db";
import { eq, or, isNull, sql, and } from "drizzle-orm";
import { shopKey, shopName } from "./price-selection";
import {
  counts,
  itemIdentity,
  validateBundle,
  availableMatches,
  type TransferBundle,
  type TransferCounts,
} from "./transfer-validation";

export async function exportAccount(userId: number): Promise<TransferBundle> {
  return db.transaction(
    async (tx) => {
      const categories = await tx
        .select()
        .from(categoriesTable)
        .where(eq(categoriesTable.userId, userId));
      const locations = await tx
        .select()
        .from(locationsTable)
        .where(eq(locationsTable.userId, userId));
      const units = await tx
        .select()
        .from(unitsTable)
        .where(or(eq(unitsTable.userId, userId), isNull(unitsTable.userId)));
      const items = await tx
        .select()
        .from(itemsTable)
        .where(eq(itemsTable.userId, userId))
        .orderBy(itemsTable.id);
      const shoppingList = await tx
        .select()
        .from(shoppingListTable)
        .where(eq(shoppingListTable.userId, userId));
      const shops = await tx
        .select({ id: shopsTable.id, name: shopsTable.name })
        .from(shopsTable)
        .where(eq(shopsTable.userId, userId));
      const prices = await tx
        .select()
        .from(itemPricesTable)
        .where(eq(itemPricesTable.userId, userId))
        .orderBy(itemPricesTable.id);
      // Export only the portable fields, never account IDs, password hashes or sessions.
      const data: TransferBundle = {
        format: "stockkeeper",
        version: 2,
        exportedAt: new Date().toISOString(),
        shops,
        prices: prices.map(({ userId: _owner, createdAt, ...row }) => ({
          ...row,
          createdAt: createdAt.toISOString(),
        })),
        categories: categories.map(({ userId: _owner, createdAt, ...row }) => ({
          ...row,
          createdAt: createdAt.toISOString(),
        })),
        locations: locations.map(({ userId: _owner, createdAt, ...row }) => ({
          ...row,
          createdAt: createdAt.toISOString(),
        })),
        units: units.map(({ userId: _owner, ...row }) => row),
        items: items.map(
          ({ userId: _owner, createdAt, updatedAt, ...row }) => ({
            ...row,
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
          }),
        ),
        shoppingList: shoppingList.map(
          ({ userId: _owner, createdAt, ...row }) => ({
            ...row,
            createdAt: createdAt.toISOString(),
          }),
        ),
      };
      return validateBundle(data);
    },
    { isolationLevel: "repeatable read", accessMode: "read only" },
  );
}

function date(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

export async function importAccount(
  userId: number,
  input: unknown,
  mode: "skip" | "add",
): Promise<{ created: TransferCounts; skipped: number }> {
  // Revalidate on commit: the browser's preview is not trusted.
  const data = validateBundle(input);
  return db.transaction(async (tx) => {
    // Serialize concurrent imports for this account; unrelated accounts are independent.
    await tx.execute(sql`select pg_advisory_xact_lock(831721, ${userId})`);
    const created = counts({
      ...data,
      items: [],
      categories: [],
      locations: [],
      units: [],
      shoppingList: [],
      shops: [],
      prices: [],
    });
    let skipped = 0;
    const existingCats = await tx
      .select()
      .from(categoriesTable)
      .where(eq(categoriesTable.userId, userId));
    const catMap = new Map<number, number>();
    const catKeys = new Map(
      existingCats.map((c) => [JSON.stringify([c.parentId, c.name]), c.id]),
    );
    const pending = [...data.categories];
    while (pending.length) {
      const index = pending.findIndex(
        (c) => c.parentId == null || catMap.has(c.parentId),
      );
      // validateBundle has already rejected cycles and missing references.
      if (index < 0) throw new Error("Invalid category graph");
      const c = pending.splice(index, 1)[0]!;
      const parentId = c.parentId == null ? null : catMap.get(c.parentId)!;
      const key = JSON.stringify([parentId, c.name]);
      let id = catKeys.get(key);
      if (id == null) {
        const [row] = await tx
          .insert(categoriesTable)
          .values({
            name: c.name,
            description: c.description,
            color: c.color,
            icon: c.icon,
            userId,
            parentId,
            createdAt: date(c.createdAt),
          })
          .returning({ id: categoriesTable.id });
        id = row!.id;
        catKeys.set(key, id);
        created.categories++;
      }
      catMap.set(c.id, id);
    }

    const existingLocs = await tx
      .select()
      .from(locationsTable)
      .where(eq(locationsTable.userId, userId));
    const locMap = new Map<number, number>();
    const locKeys = new Map(existingLocs.map((l) => [l.name, l.id]));
    for (const l of data.locations) {
      let id = locKeys.get(l.name);
      if (id == null) {
        const [row] = await tx
          .insert(locationsTable)
          .values({
            userId,
            name: l.name,
            description: l.description,
            icon: l.icon,
            createdAt: date(l.createdAt),
          })
          .returning({ id: locationsTable.id });
        id = row!.id;
        locKeys.set(l.name, id);
        created.locations++;
      }
      locMap.set(l.id, id);
    }

    const existingUnits = await tx
      .select()
      .from(unitsTable)
      .where(or(eq(unitsTable.userId, userId), isNull(unitsTable.userId)));
    const unitMap = new Map<number, number>();
    const unitKey = (u: { name: string; symbol: string }) =>
      JSON.stringify([u.name, u.symbol]);
    const unitKeys = new Map(existingUnits.map((u) => [unitKey(u), u.id]));
    for (const u of data.units) {
      let id = unitKeys.get(unitKey(u));
      if (id == null) {
        const [row] = await tx
          .insert(unitsTable)
          .values({
            userId,
            name: u.name,
            symbol: u.symbol,
          })
          .returning({ id: unitsTable.id });
        id = row!.id;
        unitKeys.set(unitKey(u), id);
        created.units++;
      }
      unitMap.set(u.id, id);
    }

    const existingItems = await tx
      .select()
      .from(itemsTable)
      .where(eq(itemsTable.userId, userId))
      .orderBy(itemsTable.id);
    const matchItem = availableMatches(existingItems, (row) =>
      itemIdentity(row),
    );
    const itemMap = new Map<number, number>();
    for (const i of data.items) {
      const record = {
        name: i.name,
        quantity: i.quantity,
        price: i.price ?? null,
        description: i.description ?? null,
        photoUrl: i.photoUrl ?? null,
        sku: i.sku ?? null,
        barcode: i.barcode ?? null,
        tags: i.tags ?? null,
        notes: i.notes ?? null,
        unit: i.unit ?? null,
        location: i.location ?? null,
        categoryId: i.categoryId == null ? null : catMap.get(i.categoryId)!,
        unitId: i.unitId == null ? null : unitMap.get(i.unitId)!,
        locationId: i.locationId == null ? null : locMap.get(i.locationId)!,
        userId,
        createdAt: date(i.createdAt),
        updatedAt: date(i.updatedAt),
      };
      const key = itemIdentity(record);
      let id = mode === "skip" ? matchItem(key)?.id : undefined;
      if (id == null) {
        const [row] = await tx
          .insert(itemsTable)
          .values(record)
          .returning({ id: itemsTable.id });
        id = row!.id;
        created.items++;
      } else skipped++;
      itemMap.set(i.id, id);
    }

    const shopMap = new Map<number, number>();
    for (const shop of data.shops ?? []) {
      const nameKey = shopKey(shop.name);
      const added = await tx
        .insert(shopsTable)
        .values({ userId, name: shopName(shop.name), nameKey })
        .onConflictDoNothing({
          target: [shopsTable.userId, shopsTable.nameKey],
        })
        .returning({ id: shopsTable.id });
      const [saved] = added.length
        ? added
        : await tx
            .select({ id: shopsTable.id })
            .from(shopsTable)
            .where(
              and(
                eq(shopsTable.userId, userId),
                eq(shopsTable.nameKey, nameKey),
              ),
            );
      shopMap.set(shop.id, saved!.id);
      if (added.length) created.shops = (created.shops ?? 0) + 1;
    }
    const existingPrices = await tx
      .select()
      .from(itemPricesTable)
      .where(eq(itemPricesTable.userId, userId))
      .orderBy(itemPricesTable.id);
    const priceKey = (p: {
      itemId: number;
      shopId: number;
      price: number;
      priceDate: string;
    }) => JSON.stringify([p.itemId, p.shopId, p.price, p.priceDate]);
    const matchPrice = availableMatches(existingPrices, priceKey);
    for (const p of data.prices ?? []) {
      const record = {
        userId,
        itemId: itemMap.get(p.itemId)!,
        shopId: shopMap.get(p.shopId)!,
        price: p.price,
        priceDate: p.priceDate,
        createdAt: date(p.createdAt),
      };
      const key = priceKey(record);
      if (mode === "skip" && matchPrice(key)) {
        skipped++;
        continue;
      }
      await tx.insert(itemPricesTable).values(record);
      created.prices = (created.prices ?? 0) + 1;
    }

    const existingShopping = await tx
      .select()
      .from(shoppingListTable)
      .where(eq(shoppingListTable.userId, userId));
    const shoppingKey = (s: {
      name: string;
      itemId: number | null;
      unit: string | null;
      note: string | null;
    }) => JSON.stringify([s.name, s.itemId, s.unit, s.note]);
    const shoppingKeys = new Set(existingShopping.map(shoppingKey));
    for (const s of data.shoppingList) {
      const record = {
        userId,
        name: s.name,
        quantity: s.quantity,
        checked: s.checked,
        itemId: s.itemId == null ? null : itemMap.get(s.itemId)!,
        unit: s.unit ?? null,
        note: s.note ?? null,
        createdAt: date(s.createdAt),
      };
      const key = shoppingKey(record);
      if (mode === "skip" && shoppingKeys.has(key)) {
        skipped++;
        continue;
      }
      await tx.insert(shoppingListTable).values(record);
      shoppingKeys.add(key);
      created.shoppingList++;
    }
    return { created, skipped };
  });
}
