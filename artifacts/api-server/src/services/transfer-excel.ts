import ExcelJS from "exceljs";
import { inflateRawSync } from "node:zlib";
import {
  emptyBundle,
  validateBundle,
  TransferError,
  type TransferBundle,
} from "./transfer-validation";

const MAX_FILE = 5 * 1024 * 1024;
const MAX_EXPANDED = 40 * 1024 * 1024;

/** Check central-directory sizes before ExcelJS inflates an untrusted ZIP. */
export function checkXlsxArchive(buffer: Buffer): void {
  if (buffer.length > MAX_FILE) throw new TransferError("Файл больше 5 МБ.");
  let end = -1;
  for (
    let p = buffer.length - 22;
    p >= Math.max(0, buffer.length - 65557);
    p--
  ) {
    if (buffer.readUInt32LE(p) === 0x06054b50) {
      end = p;
      break;
    }
  }
  if (end < 0) throw new TransferError("Некорректный XLSX-архив.");
  const entries = buffer.readUInt16LE(end + 10);
  let offset = buffer.readUInt32LE(end + 16);
  if (entries > 1500 || entries === 65535)
    throw new TransferError("Слишком сложный XLSX-архив.");
  let size = 0;
  for (let i = 0; i < entries; i++) {
    if (
      offset + 46 > buffer.length ||
      buffer.readUInt32LE(offset) !== 0x02014b50
    ) {
      throw new TransferError("Повреждённый XLSX-архив.");
    }
    const expanded = buffer.readUInt32LE(offset + 24);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.toString("utf8", offset + 46, offset + 46 + nameLength);
    if (
      expanded === 0xffffffff ||
      name.includes("..") ||
      name.startsWith("/") ||
      (buffer.readUInt16LE(offset + 8) & 1) !== 0
    ) {
      throw new TransferError("Неподдерживаемый XLSX-архив.");
    }
    size += expanded;
    if (size > MAX_EXPANDED)
      throw new TransferError("Распакованный XLSX превышает 40 МБ.");
    const local = buffer.readUInt32LE(offset + 42);
    const compressed = buffer.readUInt32LE(offset + 20);
    const method = buffer.readUInt16LE(offset + 10);
    if (
      local + 30 > buffer.length ||
      buffer.readUInt32LE(local) !== 0x04034b50
    ) {
      throw new TransferError("Повреждённый XLSX-архив.");
    }
    const start =
      local +
      30 +
      buffer.readUInt16LE(local + 26) +
      buffer.readUInt16LE(local + 28);
    if (start + compressed > buffer.length || ![0, 8].includes(method)) {
      throw new TransferError("Неподдерживаемое сжатие XLSX.");
    }
    try {
      const payload = buffer.subarray(start, start + compressed);
      const actual =
        method === 8
          ? inflateRawSync(payload, { maxOutputLength: Math.max(1, expanded) })
              .length
          : payload.length;
      if (actual !== expanded) throw new Error("size mismatch");
    } catch {
      throw new TransferError(
        "Повреждённый XLSX или недопустимый размер распаковки.",
      );
    }
    offset +=
      46 +
      nameLength +
      buffer.readUInt16LE(offset + 30) +
      buffer.readUInt16LE(offset + 32);
  }
}

function text(cell: ExcelJS.Cell): string {
  const value = cell.value;
  if (value == null) return "";
  if (typeof value === "object") {
    if ("formula" in value || "sharedFormula" in value) {
      throw new TransferError(
        `Формулы не поддерживаются (${cell.address}). Сохраните значения вместо формул.`,
      );
    }
    if ("richText" in value) return value.richText.map((t) => t.text).join("");
    if ("text" in value) return value.text;
    throw new TransferError(`Неподдерживаемое значение в ${cell.address}.`);
  }
  return String(value).trim();
}

function number(value: string, label: string, integer = false): number | null {
  if (!value) return null;
  const n = Number(value.replace(/\s/g, "").replace(",", "."));
  if (
    !Number.isFinite(n) ||
    n < 0 ||
    (integer && !Number.isInteger(n)) ||
    (integer && n > 2147483647)
  ) {
    throw new TransferError(
      `Некорректное число «${value.slice(0, 80)}»: ${label}.`,
    );
  }
  // Excel often stores e.g. 9.3699999999999992 for a displayed 9.37.
  if (!integer && Math.abs(n - Math.round(n * 100) / 100) > 1e-10) {
    throw new TransferError(
      `Цена содержит больше двух знаков после запятой: ${label}.`,
    );
  }
  return integer ? n : Math.round(n * 100) / 100;
}

export async function readExcel(
  buffer: Buffer,
): Promise<{ data: TransferBundle; warnings: string[] }> {
  checkXlsxArchive(buffer);
  const workbook = new ExcelJS.Workbook();
  try {
    await workbook.xlsx.load(
      buffer as unknown as Parameters<typeof workbook.xlsx.load>[0],
    );
  } catch {
    throw new TransferError(
      "Не удалось прочитать XLSX. Проверьте формат файла.",
    );
  }
  if (workbook.worksheets.length > 100)
    throw new TransferError("Максимум 100 листов.");
  const data = emptyBundle();
  const warnings: string[] = [];
  const categories = new Map<string, number>();
  const locations = new Map<string, number>();
  const units = new Map<string, number>();
  const category = (name: string): number | null => {
    if (!name) return null;
    let parentId: number | null = null;
    let path = "";
    for (const part of name.split(" / ").filter(Boolean)) {
      path = path ? `${path} / ${part}` : part;
      let id = categories.get(path);
      if (!id) {
        id = data.categories.length + 1;
        data.categories.push({ id, name: part, parentId });
        categories.set(path, id);
      }
      parentId = id;
    }
    return parentId;
  };
  const location = (name: string): number | null => {
    if (!name) return null;
    let id = locations.get(name);
    if (!id) {
      id = data.locations.length + 1;
      data.locations.push({ id, name });
      locations.set(name, id);
    }
    return id;
  };
  const unit = (symbol: string, name = symbol): number => {
    const key = JSON.stringify([name, symbol]);
    let id = units.get(key);
    if (!id) {
      id = data.units.length + 1;
      data.units.push({ id, name, symbol });
      units.set(key, id);
    }
    return id;
  };
  let sourceRows = 0;
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > 10001 || sheet.columnCount > 100) {
      throw new TransferError(`Лист ${sheet.name} слишком большой.`);
    }
    if (sheet.rowCount < 2) continue;
    const columns = new Map<string, number>();
    sheet
      .getRow(1)
      .eachCell((cell, col) =>
        columns.set(text(cell).toLocaleLowerCase("ru"), col),
      );
    const col = (...names: string[]) =>
      names.map((n) => columns.get(n)).find((n) => n != null);
    const isShops = sheet.name === "Магазины" && col("магазин id") != null;
    const isPrices = sheet.name === "Цены" && col("цена id") != null;
    if (isShops || isPrices) {
      for (let index = 2; index <= sheet.rowCount; index++) {
        const row = sheet.getRow(index);
        if (!row.hasValues) continue;
        if (
          !row.values ||
          (Array.isArray(row.values) &&
            row.values.every((v) => v == null || v === ""))
        )
          continue;
        const get = (name: string) => {
          const column = col(name);
          return column ? text(row.getCell(column)) : "";
        };
        const calendar = (name: string, timestamp = false) => {
          const column = col(name);
          const value = column ? row.getCell(column).value : null;
          return value instanceof Date
            ? timestamp
              ? value.toISOString()
              : value.toISOString().slice(0, 10)
            : get(name);
        };
        const id = (name: string) =>
          number(get(name), `${sheet.name}!${index}`, true) ?? 0;
        if (isShops)
          (data.shops ??= []).push({
            id: id("магазин id"),
            name: get("магазин"),
          });
        else
          (data.prices ??= []).push({
            id: id("цена id"),
            itemId: id("товар id"),
            shopId: id("магазин id"),
            price: number(get("цена"), `${sheet.name}!${index}`) ?? NaN,
            priceDate: calendar("дата цены"),
            ...(calendar("создано", true)
              ? { createdAt: calendar("создано", true) }
              : {}),
          });
      }
      continue;
    }
    const nameCol = col("наименование", "название", "name");
    if (!nameCol) {
      warnings.push(
        `Лист «${sheet.name}» пропущен: нет столбца «Наименование».`,
      );
      continue;
    }
    for (let index = 2; index <= sheet.rowCount; index++) {
      const row = sheet.getRow(index);
      const get = (...names: string[]) => {
        const column = col(...names);
        return column ? text(row.getCell(column)) : "";
      };
      const idValue = (header: string) =>
        number(get(header), `${sheet.name}!${index}, ${header}`, true);
      const name = text(row.getCell(nameCol));
      if (!row.hasValues) continue;
      if (!name) {
        // Formatting-only rows are harmless; real data with no name must not vanish.
        let hasData = false;
        row.eachCell((cell) => {
          if (text(cell)) hasData = true;
        });
        if (hasData)
          throw new TransferError(
            `Лист «${sheet.name}», строка ${index}: отсутствует наименование.`,
          );
        continue;
      }
      if (++sourceRows > 10000)
        throw new TransferError("Максимум 10 000 строк Excel.");
      const sku = get("артикул", "sku") || null;
      const standard = get("стандарт");
      const material = get("материал");
      const tags =
        Array.from(
          new Set([get("теги"), standard, material].filter(Boolean)),
        ).join(", ") || null;
      const length = get("длина");
      const description =
        [get("описание"), length ? `Длина: ${length} мм` : ""]
          .filter(Boolean)
          .join("\n") || null;
      const price = number(get("цена", "price"), `${sheet.name}!${index}`);
      const native = col("единица id") != null && col("место id") != null;
      const unitName =
        get("единица", "единица измерения", "unit") || (native ? "" : "шт");
      const shopping = ["купить", "список покупок"].includes(
        sheet.name.toLocaleLowerCase("ru"),
      );
      if (shopping) {
        const details = [
          get("заметка", "заметки"),
          sku ? `Артикул: ${sku}` : "",
          tags,
          description,
          price != null ? `Цена: ${price.toFixed(2)}` : "",
        ]
          .filter(Boolean)
          .join("\n");
        const checked = get("куплено", "checked").toLocaleLowerCase("ru");
        data.shoppingList.push({
          id: data.shoppingList.length + 1,
          name,
          quantity:
            number(
              get("количество", "кол-во", "quantity"),
              `${sheet.name}!${index}`,
              true,
            ) ?? 1,
          unit:
            col("единица", "единица измерения", "unit") != null
              ? get("единица", "единица измерения", "unit") || null
              : unitName,
          itemId: idValue("товар id"),
          note: details || null,
          checked: ["true", "да", "1"].includes(checked),
        });
        continue;
      }
      const categoryId = category(
        get("категория") || (sheet.name === "Товары" ? "" : sheet.name),
      );
      const common = {
        name,
        sku,
        price,
        tags,
        description,
        categoryId,
        unitId:
          native && idValue("единица id") == null
            ? null
            : unit(unitName, get("единица (название)") || unitName),
        unit: native ? get("единица (текст)") || null : null,
        location: native ? get("место (текст)") || null : null,
        barcode: get("штрихкод") || null,
        notes: get("заметки") || null,
        photoUrl: get("фото") || null,
      };
      const hasHome = col("кол-во дома") != null;
      const hasGarage = col("кол-во гараж") != null;
      if (hasHome || hasGarage) {
        let added = false;
        for (const [header, place] of [
          ["кол-во дома", "Дом"],
          ["кол-во гараж", "Гараж"],
        ]) {
          const q = number(
            get(header),
            `${sheet.name}!${index}, ${header}`,
            true,
          );
          if (q == null) continue;
          data.items.push({
            ...common,
            id: data.items.length + 1,
            quantity: q,
            locationId: location(place),
          });
          added = true;
        }
        if (!added)
          data.items.push({
            ...common,
            id: data.items.length + 1,
            quantity: 0,
            locationId: null,
          });
      } else {
        data.items.push({
          ...common,
          id: idValue("id") ?? data.items.length + 1,
          quantity:
            number(
              get("количество", "кол-во", "quantity"),
              `${sheet.name}!${index}`,
              true,
            ) ?? 0,
          locationId:
            native && idValue("место id") == null
              ? null
              : location(get("место хранения", "место")),
        });
      }
    }
  }
  if (!data.items.length && !data.shoppingList.length && !data.shops?.length) {
    throw new TransferError("В файле нет товаров или позиций списка покупок.");
  }
  warnings.push(
    "Материал и стандарт сохранены в тегах; длина — в описании. Цена — за одну единицу, без указания валюты.",
  );
  warnings.push(
    "Совпадающие записи не обновляются. Режим «Пропускать совпадения» сохраняет существующие количества и цены.",
  );
  return { data: validateBundle(data), warnings };
}

export async function writeExcel(data: TransferBundle): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "StockKeeper";
  const cats = new Map(data.categories.map((c) => [c.id, c]));
  const categoryPath = (id: number | null | undefined): string => {
    const parts: string[] = [];
    const seen = new Set<number>();
    while (id != null && cats.has(id) && !seen.has(id)) {
      seen.add(id);
      const cat = cats.get(id)!;
      parts.unshift(cat.name);
      id = cat.parentId;
    }
    return parts.join(" / ");
  };
  const locs = new Map(data.locations.map((l) => [l.id, l.name]));
  const units = new Map(data.units.map((u) => [u.id, u]));
  const sheet = workbook.addWorksheet("Товары");
  sheet.addRow([
    "Наименование",
    "Артикул",
    "Количество",
    "Цена",
    "Категория",
    "Место хранения",
    "Единица",
    "Описание",
    "Штрихкод",
    "Теги",
    "Заметки",
    "Фото",
    "ID",
    "Единица (название)",
    "Единица ID",
    "Место ID",
    "Единица (текст)",
    "Место (текст)",
  ]);
  for (const i of data.items)
    sheet.addRow([
      i.name,
      i.sku ?? "",
      i.quantity,
      i.price ?? null,
      categoryPath(i.categoryId),
      locs.get(i.locationId ?? 0) ?? i.location ?? "",
      units.get(i.unitId ?? 0)?.symbol ?? i.unit ?? "",
      i.description ?? "",
      i.barcode ?? "",
      i.tags ?? "",
      i.notes ?? "",
      i.photoUrl ?? "",
      i.id,
      units.get(i.unitId ?? 0)?.name ?? "",
      i.unitId ?? null,
      i.locationId ?? null,
      i.unit ?? "",
      i.location ?? "",
    ]);
  sheet.getColumn(4).numFmt = "0.00";
  const shopping = workbook.addWorksheet("Список покупок");
  shopping.addRow([
    "Наименование",
    "Количество",
    "Единица",
    "Заметка",
    "Куплено",
    "Товар ID",
  ]);
  for (const i of data.shoppingList)
    shopping.addRow([
      i.name,
      i.quantity,
      i.unit ?? "",
      i.note ?? "",
      i.checked ? "да" : "нет",
      i.itemId ?? null,
    ]);
  const shops = workbook.addWorksheet("Магазины");
  shops.addRow(["Магазин ID", "Магазин"]);
  for (const s of data.shops ?? []) shops.addRow([s.id, s.name]);
  const prices = workbook.addWorksheet("Цены");
  prices.addRow([
    "Цена ID",
    "Товар ID",
    "Магазин ID",
    "Цена",
    "Дата цены",
    "Создано",
  ]);
  for (const p of data.prices ?? [])
    prices.addRow([
      p.id,
      p.itemId,
      p.shopId,
      p.price,
      p.priceDate,
      p.createdAt ?? "",
    ]);
  prices.getColumn(4).numFmt = "0.00";
  for (const s of workbook.worksheets) {
    s.getRow(1).font = { bold: true };
    s.views = [{ state: "frozen", ySplit: 1 }];
    s.columns.forEach((c, index) => {
      c.width = index === 0 ? 45 : 22;
      if ((s === sheet && index >= 12) || (s === shopping && index >= 5))
        c.hidden = true;
    });
    s.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: s.columnCount },
    };
  }
  // String cells stay strings: untrusted "=..." names are never Excel formulas.
  return Buffer.from(await workbook.xlsx.writeBuffer());
}
