import { test, after } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import ExcelJS from "exceljs";

const directory = await mkdtemp(
  fileURLToPath(new URL("../.transfer-test-", import.meta.url)),
);
after(() => rm(directory, { recursive: true, force: true }));
await build({
  entryPoints: [
    fileURLToPath(
      new URL("../src/services/transfer-excel.ts", import.meta.url),
    ),
    fileURLToPath(
      new URL("../src/services/transfer-validation.ts", import.meta.url),
    ),
  ],
  outdir: directory,
  bundle: true,
  platform: "node",
  format: "esm",
  external: ["exceljs", "zod"],
  logLevel: "silent",
});
const excel = await import(pathToFileURL(`${directory}/transfer-excel.js`));
const validation = await import(
  pathToFileURL(`${directory}/transfer-validation.js`)
);

function fixture() {
  return {
    ...validation.emptyBundle(),
    categories: [
      { id: 91, name: "Крепёж", parentId: null },
      { id: 92, name: "М4", parentId: 91 },
    ],
    units: [{ id: 99, name: "Штуки", symbol: "шт" }],
    locations: [{ id: 93, name: "Дом" }],
    items: [
      {
        id: 101,
        name: "=SUM(1,2)",
        quantity: 15,
        price: 9.37,
        sku: "00125",
        categoryId: 92,
        unitId: 99,
        locationId: 93,
        tags: "DIN 933, А2",
        description: "Длина: 20 мм",
      },
    ],
    shoppingList: [
      {
        id: 5,
        name: "Гайка",
        quantity: 3,
        checked: false,
        note: "Купить в выходные",
        itemId: 101,
      },
    ],
  };
}

test("JSON retains decimal price, relations and strips user ownership", () => {
  const f = fixture();
  f.items[0].userId = 12345;
  f.users = [{ passwordHash: "not-a-real-password" }];
  const value = validation.validateBundle(JSON.parse(JSON.stringify(f)));
  assert.equal(value.items[0].price, 9.37);
  assert.equal(value.items[0].categoryId, 92);
  assert.equal("userId" in value.items[0], false);
  assert.equal("users" in value, false);
});

test("unsupported backup versions rejected", () => {
  assert.throws(() => validation.validateBundle({ ...fixture(), version: 2 }));
});

test("dangling and foreign source references rejected", () => {
  const f = fixture();
  f.items[0].categoryId = 123456;
  assert.throws(() => validation.validateBundle(f));
});

test("duplicate source IDs rejected", () => {
  const f = fixture();
  f.items.push({ ...f.items[0] });
  assert.throws(() => validation.validateBundle(f));
});

test("cyclic category trees rejected", () => {
  const f = fixture();
  f.categories[0].parentId = 92;
  assert.throws(() => validation.validateBundle(f));
});

test("fractional quantities and negative prices rejected", () => {
  const f = fixture();
  f.items[0].quantity = 1.5;
  assert.throws(() => validation.validateBundle(f));
  f.items[0].quantity = 1;
  f.items[0].price = -0.01;
  assert.throws(() => validation.validateBundle(f));
});

test("prices require two decimal places and allow null or zero", () => {
  assert.equal(validation.validPrice(1.001), false);
  assert.equal(validation.validPrice(0.0001), false);
  assert.equal(validation.validPrice(9.37), true);
  assert.equal(validation.validPrice(999999999999.99), true);
  assert.equal(validation.validPrice(null), true);
  assert.equal(validation.validPrice(0), true);
});

test("invalid dates rejected", () => {
  const f = fixture();
  f.items[0].createdAt = "not-a-date";
  assert.throws(() => validation.validateBundle(f));
});

test("XLSX round trip preserves prices, leading-zero SKU, tags and hierarchical categories", async () => {
  const buffer = await excel.writeExcel(fixture());
  const { data } = await excel.readExcel(buffer);
  assert.equal(data.items[0].price, 9.37);
  assert.equal(data.items[0].sku, "00125");
  assert.equal(data.items[0].name, "=SUM(1,2)");
  assert.equal(data.items[0].tags, "DIN 933, А2");
  assert.equal(data.categories[1].parentId, data.categories[0].id);
  assert.equal(data.shoppingList[0].note, "Купить в выходные");
  assert.equal(data.shoppingList[0].quantity, 3);
  assert.equal(data.shoppingList[0].itemId, data.items[0].id);
  assert.equal(data.shoppingList[0].unit, null);
  assert.equal(data.units[0].name, "Штуки");
});

test("native Excel preserves optional legacy location/unit fields and null references", async () => {
  const f = fixture();
  f.items.push({
    id: 202,
    name: "Гайка",
    quantity: 3,
    price: 0,
    unitId: null,
    unit: "пара",
    locationId: null,
    location: "Ящик без справочника",
  });
  const { data } = await excel.readExcel(await excel.writeExcel(f));
  const restored = data.items.find((i) => i.id === 202);
  assert.equal(restored.unitId, null);
  assert.equal(restored.unit, "пара");
  assert.equal(restored.locationId, null);
  assert.equal(restored.location, "Ящик без справочника");
  assert.equal(restored.price, 0);
  assert.equal(data.units.length, 1);
  assert.equal(data.locations.length, 1);
});

test(
  "original workbook flags ambiguous quantity, otherwise maps all sheets and locations",
  {
    skip: !existsSync(
      new URL(
        "../../../attached_assets/Метрика_1790972829699.xlsx",
        import.meta.url,
      ),
    ),
  },
  async () => {
    const buffer = await readFile(
      new URL(
        "../../../attached_assets/Метрика_1790972829699.xlsx",
        import.meta.url,
      ),
    );
    await assert.rejects(() => excel.readExcel(buffer), /М3!13/);
    // Synthetic correction for this test only; the uploaded file is never changed.
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer);
    wb.getWorksheet("М3").getCell("F13").value = 61;
    const { data } = await excel.readExcel(
      Buffer.from(await wb.xlsx.writeBuffer()),
    );
    assert.ok(data.items.length > 50);
    assert.ok(data.shoppingList.length > 0);
    assert.ok(data.locations.some((l) => l.name === "Дом"));
    assert.ok(data.locations.some((l) => l.name === "Гараж"));
    assert.ok(
      data.items.some((i) => i.tags?.includes("DIN") && i.tags?.includes("А2")),
    );
    assert.ok(data.items.some((i) => i.price === 9.37));
    assert.equal(
      data.categories.some((c) => c.name === "Купить"),
      false,
    );
    const unitIds = new Set(data.units.map((u) => u.id));
    assert.ok(data.items.every((i) => unitIds.has(i.unitId)));
  },
);

test("formula cells rejected instead of evaluating or silently using stale results", async () => {
  const wb = new ExcelJS.Workbook();
  const s = wb.addWorksheet("М4");
  s.addRow(["Наименование", "Количество"]);
  s.addRow(["Гайка", { formula: "1+1", result: 2 }]);
  const buffer = Buffer.from(await wb.xlsx.writeBuffer());
  await assert.rejects(() => excel.readExcel(buffer), /Формулы/);
});

test("metric workbook maps separate home and garage quantities and shopping sheet", async () => {
  const wb = new ExcelJS.Workbook();
  const inventory = wb.addWorksheet("М4");
  inventory.addRow([
    "Артикул",
    "Стандарт",
    "Наименование",
    "Длина",
    "Материал",
    "Кол-во дома",
    "Кол-во гараж",
    "Цена",
  ]);
  inventory.addRow(["0012", "DIN 912", "Винт", 20, "А2", 4, 7, 9.37]);
  const shopping = wb.addWorksheet("Купить");
  shopping.addRow(["Наименование", "Кол-во", "Цена"]);
  shopping.addRow(["Гайка", 3, 2.5]);
  const { data } = await excel.readExcel(
    Buffer.from(await wb.xlsx.writeBuffer()),
  );
  assert.equal(data.items.length, 2);
  assert.deepEqual(
    data.items.map((i) => i.quantity),
    [4, 7],
  );
  assert.equal(data.items[0].description, "Длина: 20 мм");
  assert.equal(data.items[0].tags, "DIN 912, А2");
  assert.equal(data.items[0].price, 9.37);
  assert.equal(data.items[0].sku, "0012");
  assert.equal(data.shoppingList.length, 1);
  assert.match(data.shoppingList[0].note, /Цена: 2.50/);
});

test("malformed and over-expanded ZIPs rejected", () => {
  assert.throws(() => excel.checkXlsxArchive(Buffer.from("not-a-zip")));
});

test("lying ZIP directory cannot bypass the decompression size limit", async () => {
  const buffer = await excel.writeExcel(fixture());
  const directory = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.ok(directory >= 0);
  buffer.writeUInt32LE(1, directory + 24);
  assert.throws(() => excel.checkXlsxArchive(buffer), /размер|Повреждённый/);
});

test("skip identity does not depend on quantity and price", () => {
  const f = fixture().items[0];
  assert.equal(
    validation.itemIdentity(f),
    validation.itemIdentity({ ...f, quantity: 999, price: 200 }),
  );
});

test("editing tags cannot make repeat imports duplicate a stock item", () => {
  const f = fixture().items[0];
  assert.equal(
    validation.itemIdentity(f),
    validation.itemIdentity({ ...f, tags: "А2,DIN 933,А2", price: 19.99 }),
  );
  assert.notEqual(
    validation.itemIdentity(f),
    validation.itemIdentity({ ...f, tags: "А4,DIN 933" }),
  );
});
