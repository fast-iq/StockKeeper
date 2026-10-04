import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";
import { transferHarness } from "./helpers/transfer-test-database.mjs";

let h;
before(async () => {
  h = await transferHarness();
});
after(async () => {
  if (h) await h.close();
});

const zero = {
  categories: 0,
  locations: 0,
  units: 0,
  items: 0,
  shoppingList: 0,
};

function fixture() {
  return {
    format: "stockkeeper",
    version: 1,
    // Child first exercises topological insertion rather than array order.
    categories: [
      { id: 910002, name: "М4", parentId: 910001, description: "Метрический" },
      { id: 910001, name: "Крепёж", parentId: null },
    ],
    locations: [{ id: 920001, name: "Дом" }],
    units: [{ id: 930001, name: "Штуки тестовые", symbol: "шт-тест" }],
    items: [
      {
        id: 940001,
        name: "Винт",
        quantity: 15,
        price: 9.37,
        sku: "00125",
        barcode: "0012345678905",
        categoryId: 910002,
        unitId: 930001,
        locationId: 920001,
        tags: "DIN 933, А2",
        description: "Длина: 20 мм\nРезьба: М4",
        notes: "Для сборки",
        createdAt: "2025-01-02T03:04:05.000Z",
        updatedAt: "2025-02-03T04:05:06.000Z",
      },
      {
        id: 940002,
        name: "Без справочников",
        quantity: 0,
        price: null,
        categoryId: null,
        unitId: null,
        locationId: null,
        unit: "пара",
        location: "Ящик",
      },
    ],
    shoppingList: [
      {
        id: 950001,
        name: "Докупить винт",
        quantity: 3,
        checked: true,
        itemId: 940001,
        unit: "шт",
        note: "В выходные",
      },
      {
        id: 950002,
        name: "Перчатки",
        quantity: 1,
        checked: false,
        itemId: null,
      },
    ],
  };
}

const importData = (account, data, mode = "skip", expected = 200) =>
  h.json(account.cookie, "/data/import", { data, mode }, expected);

async function exportFile(account, format) {
  const response = await h.request(
    account.cookie,
    `/data/export?format=${format}`,
  );
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-disposition"), /attachment/);
  return Buffer.from(await response.arrayBuffer());
}

async function preview(account, file, format, expected = 200) {
  return h.json(
    account.cookie,
    "/data/preview",
    { fileName: `backup.${format}`, content: file.toString("base64") },
    expected,
  );
}

function portable(data) {
  const { exportedAt: _exportedAt, ...rest } = data;
  return rest;
}

function assertRelations(data) {
  const root = data.categories.find((c) => c.name === "Крепёж");
  const child = data.categories.find((c) => c.name === "М4");
  const item = data.items.find((i) => i.name === "Винт");
  assert.equal(child.parentId, root.id);
  assert.equal(item.categoryId, child.id);
  assert.equal(
    item.locationId,
    data.locations.find((l) => l.name === "Дом").id,
  );
  assert.equal(item.unitId, data.units.find((u) => u.symbol === "шт-тест").id);
  assert.equal(item.price, 9.37);
  assert.equal(item.quantity, 15);
  assert.equal(item.sku, "00125");
  assert.equal(item.barcode, "0012345678905");
  assert.equal(item.description, "Длина: 20 мм\nРезьба: М4");
  assert.equal(item.tags, "DIN 933, А2");
  assert.equal(
    data.shoppingList.find((s) => s.name === "Докупить винт").itemId,
    item.id,
  );
  const shopping = data.shoppingList.find((s) => s.name === "Докупить винт");
  assert.equal(shopping.note, "В выходные");
  assert.equal(shopping.checked, true);
  assert.equal(shopping.quantity, 3);
  assert.equal(
    data.shoppingList.find((s) => s.name === "Перчатки").itemId,
    null,
  );
  const legacy = data.items.find((i) => i.name === "Без справочников");
  assert.equal(legacy.categoryId, null);
  assert.equal(legacy.unitId, null);
  assert.equal(legacy.locationId, null);
  assert.equal(legacy.price, null);
  assert.equal(legacy.unit, "пара");
  assert.equal(legacy.location, "Ящик");
}

for (const format of ["json", "xlsx"]) {
  test(`${format}: real export/preview/import remaps IDs and preserves account-owned relations`, async () => {
    const source = await h.account();
    const target = await h.account();
    const stranger = await h.account();
    await importData(source, fixture());
    await importData(stranger, fixture());
    const sourceBefore = await h.snapshot(source.id);
    const strangerBefore = await h.snapshot(stranger.id);
    const file = await exportFile(source, format);
    const targetBefore = await h.snapshot(target.id);
    const checked = await preview(target, file, format);
    assert.deepEqual(checked.counts, {
      categories: 2,
      locations: 1,
      units: 1,
      items: 2,
      shoppingList: 2,
    });
    assert.deepEqual(
      await h.snapshot(target.id),
      targetBefore,
      "Preview must not write",
    );
    const result = await importData(target, checked.data);
    assert.deepEqual(result.created, checked.counts);
    assert.equal(result.skipped, 0);
    const restored = await h.snapshot(target.id);
    assertRelations(restored);
    for (const name of Object.keys(zero)) {
      assert.equal(restored[name].length, sourceBefore[name].length);
      const oldIds = new Set(sourceBefore[name].map((r) => r.id));
      for (const row of restored[name]) {
        assert.equal(row.userId, target.id);
        assert.equal(oldIds.has(row.id), false, `${name} must have new IDs`);
      }
    }
    const reexport = JSON.parse(await exportFile(target, "json"));
    assertRelations(reexport);
    for (const name of Object.keys(zero))
      assert.ok(reexport[name].every((r) => !("userId" in r)));
    for (const key of ["users", "sessions", "passwordResetTokens"])
      assert.equal(key in reexport, false);
    if (format === "json") {
      const savedItem = restored.items.find((i) => i.name === "Винт");
      assert.equal(
        savedItem.createdAt.toISOString(),
        fixture().items[0].createdAt,
      );
      assert.equal(
        savedItem.updatedAt.toISOString(),
        fixture().items[0].updatedAt,
      );
    }
    assert.deepEqual(await h.snapshot(source.id), sourceBefore);
    assert.deepEqual(await h.snapshot(stranger.id), strangerBefore);

    // The real editor changes tag spacing/order, not the semantic tag set.
    const item = restored.items.find((i) => i.name === "Винт");
    await h.json(
      target.cookie,
      `/items/${item.id}`,
      {
        price: 19.99,
        quantity: 42,
        tags: "А2,DIN 933,А2",
      },
      200,
      "PATCH",
    );
    const edited = await h.snapshot(target.id);
    assert.equal(edited.items.find((i) => i.id === item.id).price, 19.99);
    assert.equal(edited.items.find((i) => i.id === item.id).quantity, 42);
    const repeat = await importData(
      target,
      (await preview(target, file, format)).data,
    );
    assert.deepEqual(repeat, { created: zero, skipped: 4 });
    assert.deepEqual(
      await h.snapshot(target.id),
      edited,
      "Skip must not rewrite any row",
    );
  });
}

test("barcode search preserves leading zeros and returns only the current account's items", async () => {
  const owner = await h.account();
  const stranger = await h.account();
  await importData(owner, fixture());
  await importData(stranger, fixture());
  const response = await h.request(owner.cookie, "/items?search=0012345678905");
  assert.equal(response.status, 200);
  const items = await response.json();
  assert.equal(items.length, 1);
  assert.equal(items[0].barcode, "0012345678905");
  assert.equal(items[0].userId, owner.id);
  const absent = await h.request(owner.cookie, "/items?search=9999999999999");
  assert.deepEqual(await absent.json(), []);
});

test("global units are available but private units of another account are never reused", async () => {
  const source = await h.account();
  const target = await h.account();
  const [global] = await h.db
    .insert(h.unitsTable)
    .values({
      name: "Глобальная",
      symbol: "global",
      userId: null,
    })
    .returning();
  const data = fixture();
  data.units.push({ id: 930002, name: global.name, symbol: global.symbol });
  data.items[1].unitId = 930002;
  await importData(source, data);
  const backup = JSON.parse(await exportFile(source, "json"));
  const result = await importData(target, backup);
  assert.equal(result.created.units, 1);
  const rows = await h.snapshot(target.id);
  assert.equal(
    rows.items.find((i) => i.name === "Без справочников").unitId,
    global.id,
  );
  const sourceRows = await h.snapshot(source.id);
  assert.notEqual(rows.units[0].id, sourceRows.units[0].id);
  const exported = JSON.parse(await exportFile(target, "json"));
  assert.equal(exported.units.filter((u) => u.id === global.id).length, 1);
});

test("invalid links, cycles and duplicate source IDs fail without partial writes", async () => {
  const target = await h.account();
  await importData(target, fixture());
  const before = await h.snapshot(target.id);
  const mutations = [
    (d) => {
      d.items[1].categoryId = 2147483647;
    },
    (d) => {
      d.items[1].locationId = 2147483647;
    },
    (d) => {
      d.items[1].unitId = 2147483647;
    },
    (d) => {
      d.shoppingList[1].itemId = 2147483647;
    },
    (d) => {
      d.categories[1].parentId = 2147483647;
    },
    (d) => {
      d.categories[1].parentId = 910002;
    },
    (d) => {
      d.items.push({ ...d.items[0] });
    },
  ];
  for (const mutate of mutations) {
    const data = fixture();
    mutate(data);
    await importData(target, data, "add", 400);
    assert.deepEqual(await h.snapshot(target.id), before);
  }
  // Preview is not a trusted authorization/validation token.
  const checked = await preview(
    target,
    Buffer.from(JSON.stringify(fixture())),
    "json",
  );
  checked.data.shoppingList[1].itemId = 2147483647;
  await importData(target, checked.data, "add", 400);
  assert.deepEqual(await h.snapshot(target.id), before);
});

test("a late PostgreSQL failure rolls back reference tables, items and purchases together", async () => {
  const target = await h.account();
  const before = await h.snapshot(target.id);
  // Fail on the second purchase, after the first one and all items have been written.
  await h.pool.query(`
    CREATE FUNCTION fail_transfer_purchase() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN
      IF NEW.name = 'Перчатки' THEN
        RAISE EXCEPTION 'synthetic transfer integration failure';
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER fail_transfer_purchase BEFORE INSERT ON shopping_list
    FOR EACH ROW EXECUTE FUNCTION fail_transfer_purchase();
  `);
  try {
    await importData(target, fixture(), "add", 500);
    assert.deepEqual(await h.snapshot(target.id), before);
  } finally {
    await h.pool.query(`
      DROP TRIGGER fail_transfer_purchase ON shopping_list;
      DROP FUNCTION fail_transfer_purchase();
    `);
  }
});

test("unauthenticated transfer requests cannot read, preview or write data", async () => {
  const response = await h.request(null, "/data/export?format=json");
  assert.equal(response.status, 401);
  await h.json(
    null,
    "/data/preview",
    {
      fileName: "backup.json",
      content: Buffer.from(JSON.stringify(fixture())).toString("base64"),
    },
    401,
  );
  await h.json(null, "/data/import", { data: fixture(), mode: "add" }, 401);
});

test("foreign database IDs are not resolvable links and injected ownership is ignored", async () => {
  const owner = await h.account();
  const attacker = await h.account();
  await importData(owner, fixture());
  const before = await h.snapshot(owner.id);
  const attackBefore = await h.snapshot(attacker.id);
  for (const [field, table] of [
    ["categoryId", "categories"],
    ["locationId", "locations"],
    ["unitId", "units"],
  ]) {
    const data = fixture();
    data.items[0][field] = before[table][0].id;
    await importData(attacker, data, "add", 400);
    assert.deepEqual(await h.snapshot(attacker.id), attackBefore);
  }
  const purchase = fixture();
  purchase.shoppingList[0].itemId = before.items[0].id;
  await importData(attacker, purchase, "add", 400);
  const parent = fixture();
  parent.categories[1].parentId = before.categories[0].id;
  await importData(attacker, parent, "add", 400);
  const data = fixture();
  // Fully supplied records may collide numerically with foreign DB IDs:
  // they are portable source IDs, not permission to attach to those DB rows.
  data.items[0].id = before.items[0].id;
  data.shoppingList[0].itemId = data.items[0].id;
  for (const name of Object.keys(zero))
    for (const row of data[name]) row.userId = owner.id;
  data.users = [{ id: owner.id, passwordHash: "must-not-import" }];
  await importData(attacker, data);
  const own = await h.snapshot(attacker.id);
  assertRelations(own);
  assert.ok(own.items.every((i) => i.userId === attacker.id));
  assert.notEqual(
    own.items.find((i) => i.name === "Винт").id,
    data.items[0].id,
  );
  const exported = JSON.parse(await exportFile(attacker, "json"));
  const ownerIds = new Set(before.items.map((i) => i.id));
  assert.ok(exported.items.every((i) => !ownerIds.has(i.id)));
  const foreignRead = await h.request(
    attacker.cookie,
    `/items/${before.items[0].id}`,
  );
  assert.equal(foreignRead.status, 404);
  assert.deepEqual(await h.snapshot(owner.id), before);
});

test("add explicitly appends duplicates but reuses own reference records", async () => {
  const target = await h.account();
  await importData(target, fixture());
  const result = await importData(target, fixture(), "add");
  assert.deepEqual(result, {
    created: { ...zero, items: 2, shoppingList: 2 },
    skipped: 0,
  });
  const rows = await h.snapshot(target.id);
  assert.equal(rows.items.length, 4);
  assert.equal(rows.categories.length, 2);
  assert.equal(rows.locations.length, 1);
  assert.equal(rows.units.length, 1);
  const links = rows.shoppingList
    .filter((s) => s.name === "Докупить винт")
    .map((s) => s.itemId);
  assert.equal(new Set(links).size, 2);
});

test("concurrent skip imports for one account do not race into duplicates", async () => {
  const target = await h.account();
  const results = await Promise.all([
    importData(target, fixture()),
    importData(target, fixture()),
  ]);
  assert.deepEqual(results.map((r) => r.created.items).sort(), [0, 2]);
  assert.deepEqual(results.map((r) => r.skipped).sort(), [0, 4]);
  const rows = await h.snapshot(target.id);
  assertRelations(rows);
  assert.equal(rows.items.length, 2);
  assert.equal(rows.shoppingList.length, 2);
});

test("metric XLSX imported again after price/tag editing retains separate home/garage stocks", async () => {
  const target = await h.account();
  const wb = new ExcelJS.Workbook();
  wb.addWorksheet("М4").addRows([
    [
      "Артикул",
      "Стандарт",
      "Наименование",
      "Длина",
      "Материал",
      "Кол-во дома",
      "Кол-во гараж",
      "Цена",
    ],
    ["0012", "DIN 912", "Винт", 20, "А2", 4, 7, 9.37],
  ]);
  wb.addWorksheet("Купить").addRows([
    ["Наименование", "Кол-во"],
    ["Гайка", 3],
  ]);
  const file = Buffer.from(await wb.xlsx.writeBuffer());
  await importData(target, (await preview(target, file, "xlsx")).data);
  const rows = await h.snapshot(target.id);
  assert.deepEqual(rows.items.map((i) => i.quantity).sort(), [4, 7]);
  assert.equal(new Set(rows.items.map((i) => i.locationId)).size, 2);
  assert.equal(rows.shoppingList.length, 1);
  for (const item of rows.items)
    await h.json(
      target.cookie,
      `/items/${item.id}`,
      {
        price: 22.5,
        tags: "А2,DIN 912",
      },
      200,
      "PATCH",
    );
  const edited = await h.snapshot(target.id);
  const result = await importData(
    target,
    (await preview(target, file, "xlsx")).data,
  );
  assert.deepEqual(result, { created: zero, skipped: 3 });
  assert.deepEqual(await h.snapshot(target.id), edited);
  const before = portable(JSON.parse(await exportFile(target, "json")));
  await preview(target, Buffer.from('{"invalid":true}'), "json", 400);
  assert.deepEqual(
    portable(JSON.parse(await exportFile(target, "json"))),
    before,
  );
});
