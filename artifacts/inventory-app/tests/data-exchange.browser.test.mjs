import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { expect } from "@playwright/test";
import { browserHarness } from "./helpers/browser-harness.mjs";

// Keep localized assertions tied to the application's shipped Russian copy.
const ru = JSON.parse(
  await readFile(
    new URL("../src/i18n/locales/ru.json", import.meta.url),
    "utf8",
  ),
);

let h;
let browser;
let origin;
let harness;

before(async () => {
  harness = await browserHarness();
  ({ h, browser, origin } = harness);
});

after(async () => {
  if (harness) await harness.close();
});

function fixture(format) {
  return {
    format: "stockkeeper",
    version: 1,
    categories: [
      { id: 1, name: `Browser parent ${format}`, parentId: null },
      { id: 2, name: `Browser child ${format}`, parentId: 1 },
    ],
    locations: [{ id: 1, name: `Browser shelf ${format}` }],
    units: [{ id: 1, name: `Browser unit ${format}`, symbol: "bt" }],
    items: [
      {
        id: 1,
        name: `Browser bolt ${format}`,
        quantity: 7,
        price: 12.5,
        categoryId: 2,
        locationId: 1,
        unitId: 1,
      },
      { id: 2, name: `Browser nut ${format}`, quantity: 4 },
    ],
    shoppingList: [
      {
        id: 1,
        name: `Browser purchase ${format}`,
        quantity: 3,
        checked: false,
        itemId: 1,
      },
    ],
  };
}

function gate() {
  let release;
  const promise = new Promise((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

async function navigate(page, name, path) {
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page).toHaveURL(`${origin}${path}`);
}

async function navigateMobile(page, name, path, menu = false) {
  // Scope to the actual mobile controls, never the hidden desktop sidebar.
  if (menu) {
    await page.getByRole("button", { name: "Navigation", exact: true }).click();
    const drawer = page.getByRole("dialog", {
      name: "Navigation",
      exact: true,
    });
    await expect(drawer).toBeVisible();
    await drawer.getByRole("link", { name, exact: true }).click();
    await expect(drawer).toHaveCount(0);
  } else {
    const bar = page.locator("nav.fixed");
    await expect(bar).toBeVisible();
    await bar.getByRole("link", { name, exact: true }).click();
  }
  await expect(page).toHaveURL(`${origin}${path}`);
}

async function mobileLists(page, data, copies) {
  await navigateMobile(page, "Inventory", "/inventory");
  await expect(page.getByRole("table")).toBeHidden();
  // Count the cards themselves, not hidden table links or just matching names.
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(data.items.length * copies);
  for (const item of data.items) {
    const matches = cards.filter({
      has: page.getByRole("link", { name: item.name, exact: true }),
    });
    await expect(matches).toHaveCount(copies);
    for (const card of await matches.all()) await expect(card).toBeVisible();
  }

  await navigateMobile(page, "Shopping List", "/shopping-list");
  // Each purchase row owns one checkbox. Count all rows to catch extra cards.
  const purchases = page.locator("main div.group").filter({
    has: page.getByRole("checkbox"),
  });
  await expect(purchases).toHaveCount(data.shoppingList.length * copies);
  for (const item of data.shoppingList) {
    const matches = purchases.filter({ hasText: item.name });
    await expect(matches).toHaveCount(copies);
    for (const card of await matches.all()) await expect(card).toBeVisible();
  }
}

async function upload(page, buffer, name) {
  const response = page.waitForResponse(
    (r) => r.url().endsWith("/api/data/preview") && r.status() === 200,
  );
  await page.getByTestId("input-import-file").setInputFiles({
    name,
    mimeType: name.endsWith(".json")
      ? "application/json"
      : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer,
  });
  await response;
  await expect(page.getByTestId("panel-import-preview")).toBeVisible();
}

for (const format of ["json", "xlsx"]) {
  test(
    `${format}: Russian interface, preview, required consent, skip/add counters and navigation`,
    { timeout: 90_000 },
    async () => {
      const source = await h.account();
      const target = await h.account();
      const other = await h.account();
      const data = fixture(`ru ${format}`);
      data.categories[0].name = `Крепёж ${format}`;
      data.categories[1].name = `Болты и гайки ${format}`;
      data.locations[0].name = `Полка ${format}`;
      data.units[0].name = `Штука ${format}`;
      data.items[0].name = `Болт ${format}`;
      data.items[1].name = `Гайка ${format}`;
      data.shoppingList[0].name = `Купить болты ${format}`;
      await h.json(source.cookie, "/data/import", { data, mode: "skip" });
      const sourceBefore = await h.snapshot(source.id);
      const otherBefore = await h.snapshot(other.id);
      const exported = await h.request(
        source.cookie,
        `/data/export?format=${format}`,
      );
      assert.equal(exported.status, 200);
      const buffer = Buffer.from(await exported.arrayBuffer());

      // No i18n mock or forced localStorage language: use normal detection for
      // an auto-language synthetic account and a fresh Russian browser.
      const context = await browser.newContext({
        locale: "ru-RU",
        viewport: { width: 1280, height: 900 },
      });
      try {
        const [name, ...value] = target.cookie.split("=");
        await context.addCookies([
          {
            name,
            value: value.join("="),
            url: origin,
            httpOnly: true,
            sameSite: "Lax",
          },
        ]);
        await context.route("**/*", (route) =>
          new URL(route.request().url()).origin === origin
            ? route.continue()
            : route.abort(),
        );
        const page = await context.newPage();
        const errors = [];
        const imports = [];
        let documents = 0;
        page.on("pageerror", (error) => errors.push(error.message));
        page.on("request", (request) => {
          if (
            request.isNavigationRequest() &&
            request.frame() === page.mainFrame()
          )
            documents++;
          if (request.url().endsWith("/api/data/import"))
            imports.push(request.postDataJSON());
        });
        await page.goto(`${origin}/inventory`);
        await expect(
          page.getByText(ru.inventory.noItemsFound, { exact: true }),
        ).toBeVisible();
        await navigate(page, ru.nav.shopping, "/shopping-list");
        await expect(
          page.getByText(ru.shopping.emptyList, { exact: true }),
        ).toBeVisible();
        const preview = page.getByTestId("panel-import-preview");
        const confirm = page.getByRole("checkbox", {
          name: ru.exchange.confirm,
          exact: true,
        });
        const commit = page.getByRole("button", {
          name: ru.exchange.importNow,
          exact: true,
        });
        const result = page.getByTestId("text-import-result");
        const labels = {
          categories: ru.exchange.categories,
          locations: ru.exchange.locations,
          units: ru.exchange.units,
          items: ru.exchange.items,
          shoppingList: ru.exchange.shopping,
        };
        let saved;
        for (const [index, mode] of ["skip", "skip", "add"].entries()) {
          const first = index === 0;
          await navigate(page, ru.nav.settings, "/settings");
          await expect(
            page.getByRole("heading", {
              name: ru.exchange.title,
              exact: true,
            }),
          ).toBeVisible();
          await expect(
            page.getByRole("button", {
              name: ru.exchange.chooseFile,
              exact: true,
            }),
          ).toBeVisible();
          const beforeImport = await h.snapshot(target.id);
          await upload(page, buffer, `russian.${format}`);
          await expect(
            preview.getByRole("heading", {
              name: ru.exchange.previewTitle,
              exact: true,
            }),
          ).toBeVisible();
          for (const [key, label] of Object.entries(labels)) {
            const counter = preview
              .locator("div.grid > div")
              .filter({ has: page.getByText(label, { exact: true }) });
            await expect(counter).toHaveCount(1);
            await expect(counter.locator(".font-mono")).toHaveText(
              String(data[key].length),
            );
          }
          for (const item of data.items)
            await expect(preview).toContainText(item.name);
          await expect(preview).toContainText(data.shoppingList[0].name);
          await expect(preview).toContainText(
            ru.exchange.sample
              .replace("{{shown}}", "2")
              .replace("{{total}}", "2"),
          );
          await expect(result).toHaveCount(0);
          await expect(confirm).toBeVisible();
          await expect(confirm).not.toBeChecked();
          await expect(commit).toBeDisabled();
          const radios = {};
          for (const choice of ["skip", "add"]) {
            // Each radio is wrapped by a label containing both title and hint.
            radios[choice] = page.getByRole("radio", {
              name: `${ru.exchange[`mode_${choice}`]} ${ru.exchange[`mode_${choice}_hint`]}`,
              exact: true,
            });
            await expect(radios[choice]).toBeVisible();
          }
          await expect(radios.skip).toBeChecked();
          await radios.add.check();
          await radios.skip.check();
          await radios[mode].check();
          await expect(radios[mode]).toBeChecked();
          await expect(commit).toBeDisabled();
          await confirm.check();
          await expect(commit).toBeEnabled();
          await confirm.uncheck();
          await expect(commit).toBeDisabled();
          assert.equal(imports.length, index, "Russian preview never imports");
          assert.deepEqual(await h.snapshot(target.id), beforeImport);
          await confirm.check();
          const success = page.waitForResponse(
            (r) => r.url().endsWith("/api/data/import") && r.status() === 200,
          );
          const refreshed = page.waitForResponse(
            (r) => r.url().endsWith("/api/auth/me") && r.status() === 200,
          );
          await commit.click();
          const counts = await (await success).json();
          const expected = {
            created: {
              categories: first ? 2 : 0,
              locations: first ? 1 : 0,
              units: first ? 1 : 0,
              items: first || mode === "add" ? 2 : 0,
              shoppingList: first || mode === "add" ? 1 : 0,
            },
            skipped: !first && mode === "skip" ? 3 : 0,
          };
          assert.deepEqual(counts, expected);
          await refreshed;
          assert.equal(imports.length, index + 1);
          assert.equal(imports.at(-1).mode, mode);
          assert.deepEqual(imports.at(-1).data, imports[0].data);
          await expect(result).toBeVisible();
          await expect(result.getByText(ru.exchange.imported)).toBeVisible();
          for (const [key, label] of Object.entries(labels))
            await expect(result).toContainText(
              `${label}: ${expected.created[key]}`,
            );
          await expect(result).toContainText(
            ru.exchange.skipped.replace("{{count}}", String(expected.skipped)),
          );
          await expect(preview).toHaveCount(0);
          await expect(page.getByTestId("text-import-error")).toHaveCount(0);
          const afterImport = await h.snapshot(target.id);
          if (first) saved = afterImport;
          else if (mode === "skip") assert.deepEqual(afterImport, saved);
          else {
            for (const key of ["categories", "locations", "units"])
              assert.deepEqual(afterImport[key], saved[key]);
            for (const key of ["items", "shoppingList"])
              assert.deepEqual(
                afterImport[key].slice(0, saved[key].length),
                saved[key],
                "Russian add preserves originals",
              );
          }
          const copies = mode === "add" ? 2 : 1;
          for (const key of Object.keys(labels))
            assert.equal(
              afterImport[key].length,
              data[key].length *
                (["items", "shoppingList"].includes(key) ? copies : 1),
            );
          await navigate(page, ru.nav.inventory, "/inventory");
          const rows = page.getByRole("table").getByRole("row");
          await expect(rows).toHaveCount(data.items.length * copies + 1);
          for (const item of data.items) {
            const links = rows.getByRole("link", {
              name: item.name,
              exact: true,
            });
            await expect(links).toHaveCount(copies);
            for (const link of await links.all())
              await expect(link).toBeVisible();
          }
          await navigate(page, ru.nav.shopping, "/shopping-list");
          const purchases = page.locator("main div.group").filter({
            has: page.getByRole("checkbox"),
          });
          await expect(purchases).toHaveCount(copies);
          const matches = purchases.filter({
            hasText: data.shoppingList[0].name,
          });
          await expect(matches).toHaveCount(copies);
          for (const row of await matches.all())
            await expect(row).toBeVisible();
        }
        assert.equal(documents, 1, "Russian navigation never reloads the page");
        assert.deepEqual(await h.snapshot(source.id), sourceBefore);
        assert.deepEqual(await h.snapshot(other.id), otherBefore);
        assert.deepEqual(errors, [], "No uncaught Russian browser errors");
      } finally {
        await context.close();
      }
    },
  );

  test(
    `${format}: preview, consent, replacement, DB failure, retry, repeat skip/add and refresh`,
    { timeout: 90_000 },
    async () => {
      const source = await h.account();
      const target = await h.account();
      const other = await h.account();
      const data = fixture(format);
      await h.json(source.cookie, "/data/import", { data, mode: "skip" });
      const initialSource = await h.snapshot(source.id);
      const otherBefore = await h.snapshot(other.id);
      const empty = await h.snapshot(target.id);
      const exported = await h.request(
        source.cookie,
        `/data/export?format=${format}`,
      );
      assert.equal(exported.status, 200);
      const buffer = Buffer.from(await exported.arrayBuffer());
      const firstItemName = data.items[0].name;
      data.items[0].name = `Replacement bolt ${format}`;
      await h.json(
        source.cookie,
        `/items/${initialSource.items[0].id}`,
        { name: data.items[0].name },
        200,
        "PATCH",
      );
      const replacementExport = await h.request(
        source.cookie,
        `/data/export?format=${format}`,
      );
      assert.equal(replacementExport.status, 200);
      const replacementBuffer = Buffer.from(
        await replacementExport.arrayBuffer(),
      );
      const sourceBefore = await h.snapshot(source.id);

      const context = await browser.newContext({
        locale: "en-US",
        viewport: { width: 1280, height: 900 },
      });
      const [name, ...value] = target.cookie.split("=");
      await context.addCookies([
        {
          name,
          value: value.join("="),
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      const page = await context.newPage();
      const errors = [];
      const imports = [];
      let documents = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          documents++;
        if (request.url().endsWith("/api/data/import"))
          imports.push(request.postDataJSON());
      });
      // No external network is needed: block fonts and any OAuth/external host.
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      let replacementGate;
      let importGate;
      try {
        await page.goto(`${origin}/inventory`);
        await expect(
          page.getByText("No items found", { exact: true }),
        ).toBeVisible();
        await navigate(page, "Shopping List", "/shopping-list");
        await expect(
          page.getByText("Shopping list is empty.", { exact: true }),
        ).toBeVisible();
        await navigate(page, "Settings", "/settings");
        const preview = page.getByTestId("panel-import-preview");
        const confirm = page.getByTestId("checkbox-import-confirm");
        const commit = page.getByTestId("button-confirm-import");
        const result = page.getByTestId("text-import-result");

        await upload(page, buffer, `first.${format}`);
        await expect(preview).toContainText(firstItemName);
        await expect(confirm).not.toBeChecked();
        await expect(commit).toBeDisabled();
        assert.equal(imports.length, 0, "Preview must never call import");
        assert.deepEqual(
          await h.snapshot(target.id),
          empty,
          "Preview must not write",
        );
        await confirm.check();
        await expect(commit).toBeEnabled();
        await page.getByTestId("radio-mode-add").check();

        // Hold the actual preview request so reset is observable before completion.
        replacementGate = gate();
        const replacementArrived = gate();
        await page.route("**/api/data/preview", async (route) => {
          replacementArrived.release();
          await replacementGate.promise;
          await route.continue();
        });
        const replacementResponse = page.waitForResponse((r) =>
          r.url().endsWith("/api/data/preview"),
        );
        await page.getByTestId("input-import-file").setInputFiles({
          name: `replacement.${format}`,
          mimeType: "application/octet-stream",
          buffer: replacementBuffer,
        });
        await replacementArrived.promise;
        await expect(preview).toHaveCount(0);
        await expect(commit).toHaveCount(0);
        await expect(page.getByTestId("button-choose-file")).toBeDisabled();
        replacementGate.release();
        await replacementResponse;
        await page.unroute("**/api/data/preview");
        await expect(preview).toBeVisible();
        await expect(preview).toContainText(data.items[0].name);
        await expect(preview).not.toContainText(firstItemName);
        await expect(confirm).not.toBeChecked();
        await expect(commit).toBeDisabled();
        await expect(page.getByTestId("radio-mode-skip")).toBeChecked();
        assert.equal(imports.length, 0);
        assert.deepEqual(await h.snapshot(target.id), empty);

        // A real late SQL error, not a mocked import response; transaction rolls
        // back and the UI must retain the same preview for an explicit retry.
        await h.pool.query(`
        CREATE FUNCTION browser_import_failure() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN RAISE EXCEPTION 'browser test late import failure'; END $$;
        CREATE TRIGGER browser_import_failure BEFORE INSERT ON shopping_list
        FOR EACH ROW EXECUTE FUNCTION browser_import_failure();
      `);
        await confirm.check();
        importGate = gate();
        const importArrived = gate();
        await page.route("**/api/data/import", async (route) => {
          importArrived.release();
          await importGate.promise;
          await route.continue();
        });
        const failed = page.waitForResponse(
          (r) => r.url().endsWith("/api/data/import") && r.status() === 500,
        );
        await commit.click();
        await importArrived.promise;
        await expect(commit).toBeDisabled();
        await expect(confirm).toBeDisabled();
        await expect(page.getByTestId("input-import-file")).toBeDisabled();
        await expect(page.getByTestId("radio-mode-add")).toBeDisabled();
        assert.equal(imports.length, 1, "One click must issue one import");
        importGate.release();
        await failed;
        await page.unroute("**/api/data/import");
        await expect(page.getByTestId("text-import-error")).toBeVisible();
        await expect(preview).toContainText(data.items[0].name);
        await expect(confirm).toBeChecked();
        await expect(commit).toBeEnabled();
        await expect(result).toHaveCount(0);
        assert.deepEqual(await h.snapshot(target.id), empty);
        await h.pool.query(`
        DROP TRIGGER browser_import_failure ON shopping_list;
        DROP FUNCTION browser_import_failure();
      `);

        const success = page.waitForResponse(
          (r) => r.url().endsWith("/api/data/import") && r.status() === 200,
        );
        // /auth/me is active on Settings; this proves success invalidates cached
        // queries immediately rather than only showing a successful toast.
        const refreshed = page.waitForResponse(
          (r) => r.url().endsWith("/api/auth/me") && r.status() === 200,
        );
        await commit.click();
        const response = await success;
        const counts = await response.json();
        assert.deepEqual(counts, {
          created: {
            categories: 2,
            locations: 1,
            units: 1,
            items: 2,
            shoppingList: 1,
          },
          skipped: 0,
        });
        await refreshed;
        await expect(result).toContainText("Items: 2");
        await expect(result).toContainText("Categories: 2");
        await expect(result).toContainText("Locations: 1");
        await expect(result).toContainText("Units: 1");
        await expect(result).toContainText("Shopping: 1");
        await expect(result).toContainText("Skipped matching records: 0");
        await expect(preview).toHaveCount(0);
        await expect(page.getByTestId("text-import-error")).toHaveCount(0);
        assert.equal(
          imports.length,
          2,
          "Only explicit retry can send a second import",
        );
        assert.deepEqual(
          imports[0],
          imports[1],
          "Retry keeps preview data and mode",
        );
        assert.equal(imports[1].mode, "skip");
        const saved = await h.snapshot(target.id);
        for (const [key, count] of Object.entries(counts.created))
          assert.equal(saved[key].length, count);

        await navigate(page, "Inventory", "/inventory");
        await expect(
          page.getByText(data.items[0].name, { exact: true }).first(),
        ).toBeVisible();
        await expect(
          page.getByText(data.items[1].name, { exact: true }).first(),
        ).toBeVisible();
        await navigate(page, "Shopping List", "/shopping-list");
        await expect(page.getByText(data.shoppingList[0].name)).toBeVisible();

        // Re-upload the exact successfully restored backup, selecting each mode
        // through the real radio controls. Both lists were already cached above.
        for (const mode of ["skip", "add"]) {
          await navigate(page, "Settings", "/settings");
          const beforeRepeat = await h.snapshot(target.id);
          const importCount = imports.length;
          await upload(page, replacementBuffer, `repeat.${format}`);
          await expect(result).toHaveCount(0);
          await expect(confirm).not.toBeChecked();
          await expect(commit).toBeDisabled();
          assert.equal(imports.length, importCount);
          assert.deepEqual(await h.snapshot(target.id), beforeRepeat);
          // Switch away and back for skip too: this exercises onChange rather
          // than only relying on the default selected radio.
          await page.getByTestId("radio-mode-add").check();
          await page.getByTestId(`radio-mode-${mode}`).check();
          await expect(page.getByTestId(`radio-mode-${mode}`)).toBeChecked();
          await confirm.check();
          const repeated = page.waitForResponse(
            (r) => r.url().endsWith("/api/data/import") && r.status() === 200,
          );
          const repeatRefresh = page.waitForResponse(
            (r) => r.url().endsWith("/api/auth/me") && r.status() === 200,
          );
          await commit.click();
          const repeatCounts = await (await repeated).json();
          const expectedCounts = {
            created: {
              categories: 0,
              locations: 0,
              units: 0,
              items: mode === "skip" ? 0 : 2,
              shoppingList: mode === "skip" ? 0 : 1,
            },
            skipped: mode === "skip" ? 3 : 0,
          };
          assert.deepEqual(repeatCounts, expectedCounts);
          await repeatRefresh;
          assert.equal(imports.length, importCount + 1);
          assert.equal(imports.at(-1).mode, mode);
          assert.deepEqual(
            imports.at(-1).data,
            imports[1].data,
            "Repeat must send the same backup data, only the mode changes",
          );
          for (const [key, label] of Object.entries({
            categories: "Categories",
            locations: "Locations",
            units: "Units",
            items: "Items",
            shoppingList: "Shopping",
          }))
            await expect(result).toContainText(
              `${label}: ${expectedCounts.created[key]}`,
            );
          await expect(result).toContainText(
            `Skipped matching records: ${expectedCounts.skipped}`,
          );
          await expect(preview).toHaveCount(0);
          await expect(page.getByTestId("text-import-error")).toHaveCount(0);
          const afterRepeat = await h.snapshot(target.id);
          if (mode === "skip") {
            assert.deepEqual(
              afterRepeat,
              saved,
              "Skip must leave every persisted record unchanged",
            );
          } else {
            for (const key of ["categories", "locations", "units"])
              assert.deepEqual(afterRepeat[key], saved[key]);
            for (const key of ["items", "shoppingList"]) {
              assert.equal(afterRepeat[key].length, saved[key].length * 2);
              assert.deepEqual(
                afterRepeat[key].slice(0, saved[key].length),
                saved[key],
                "Add must preserve the original records",
              );
              for (const row of saved[key]) {
                const matches = afterRepeat[key].filter(
                  (entry) => entry.name === row.name,
                );
                assert.equal(
                  matches.length,
                  2,
                  "Add creates one intentional copy",
                );
                assert.notEqual(matches[0].id, matches[1].id);
              }
            }
          }

          const copies = mode === "skip" ? 1 : 2;
          await navigate(page, "Inventory", "/inventory");
          for (const item of data.items) {
            const entries = page.getByRole("link", {
              name: item.name,
              exact: true,
            });
            await expect(entries).toHaveCount(copies);
            await expect(entries.first()).toBeVisible();
            await expect(entries.last()).toBeVisible();
          }
          await navigate(page, "Shopping List", "/shopping-list");
          // The name container also includes a quantity/unit badge, so its
          // complete text is not exactly the purchase name.
          const purchases = page.getByText(data.shoppingList[0].name);
          await expect(purchases).toHaveCount(copies);
          await expect(purchases.first()).toBeVisible();
          await expect(purchases.last()).toBeVisible();
        }
        assert.equal(
          documents,
          1,
          "Refresh must work through SPA navigation without a reload",
        );
        assert.deepEqual(await h.snapshot(source.id), sourceBefore);
        assert.deepEqual(await h.snapshot(other.id), otherBefore);
        assert.deepEqual(errors, [], "No uncaught browser errors");
      } finally {
        replacementGate?.release();
        importGate?.release();
        await context.close();
        // Remove test-only fault injection even after a failed assertion.
        await h.pool.query(`
        DROP TRIGGER IF EXISTS browser_import_failure ON shopping_list;
        DROP FUNCTION IF EXISTS browser_import_failure();
      `);
      }
    },
  );

  test(
    `${format}: mobile 390x844, consent, repeated skip/add counters and cards via mobile navigation`,
    { timeout: 90_000 },
    async () => {
      const source = await h.account();
      const target = await h.account();
      const other = await h.account();
      const data = fixture(`mobile ${format}`);
      await h.json(source.cookie, "/data/import", { data, mode: "skip" });
      const sourceBefore = await h.snapshot(source.id);
      const otherBefore = await h.snapshot(other.id);
      const exported = await h.request(
        source.cookie,
        `/data/export?format=${format}`,
      );
      assert.equal(exported.status, 200);
      const buffer = Buffer.from(await exported.arrayBuffer());

      const context = await browser.newContext({
        locale: "en-US",
        viewport: { width: 390, height: 844 },
        isMobile: true,
        hasTouch: true,
      });
      const [name, ...value] = target.cookie.split("=");
      await context.addCookies([
        {
          name,
          value: value.join("="),
          url: origin,
          httpOnly: true,
          sameSite: "Lax",
        },
      ]);
      await context.route("**/*", (route) =>
        new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort(),
      );
      const page = await context.newPage();
      const errors = [];
      const imports = [];
      let documents = 0;
      page.on("pageerror", (error) => errors.push(error.message));
      page.on("request", (request) => {
        if (
          request.isNavigationRequest() &&
          request.frame() === page.mainFrame()
        )
          documents++;
        if (request.url().endsWith("/api/data/import"))
          imports.push(request.postDataJSON());
      });

      try {
        await page.goto(`${origin}/inventory`);
        await expect(
          page.getByText("No items found", { exact: true }),
        ).toBeVisible();
        await navigateMobile(page, "Shopping List", "/shopping-list");
        await expect(
          page.getByText("Shopping list is empty.", { exact: true }),
        ).toBeVisible();
        const preview = page.getByTestId("panel-import-preview");
        const confirm = page.getByTestId("checkbox-import-confirm");
        const commit = page.getByTestId("button-confirm-import");
        const result = page.getByTestId("text-import-result");
        let saved;

        // First restore through the UI, then re-upload exactly the same bytes.
        // Cached lists are revisited without reload after every successful import.
        for (const [index, mode] of ["skip", "skip", "add"].entries()) {
          const first = index === 0;
          await navigateMobile(page, "Settings", "/settings", true);
          const beforeImport = await h.snapshot(target.id);
          await upload(page, buffer, `mobile.${format}`);
          await expect(preview).toContainText(data.items[0].name);
          await expect(result).toHaveCount(0);
          await expect(confirm).not.toBeChecked();
          await expect(commit).toBeDisabled();
          assert.equal(imports.length, index, "Preview never imports");
          assert.deepEqual(await h.snapshot(target.id), beforeImport);

          // Exercise both radio onChange paths, including explicit skip choice.
          await page.getByTestId("radio-mode-add").check();
          await page.getByTestId("radio-mode-skip").check();
          await page.getByTestId(`radio-mode-${mode}`).check();
          await expect(page.getByTestId(`radio-mode-${mode}`)).toBeChecked();
          await expect(commit).toBeDisabled();
          await confirm.check();
          await expect(confirm).toBeChecked();
          await expect(commit).toBeEnabled();
          const success = page.waitForResponse(
            (r) => r.url().endsWith("/api/data/import") && r.status() === 200,
          );
          const refreshed = page.waitForResponse(
            (r) => r.url().endsWith("/api/auth/me") && r.status() === 200,
          );
          await commit.click();
          const counts = await (await success).json();
          const expected = {
            created: {
              categories: first ? 2 : 0,
              locations: first ? 1 : 0,
              units: first ? 1 : 0,
              items: first || mode === "add" ? 2 : 0,
              shoppingList: first || mode === "add" ? 1 : 0,
            },
            skipped: !first && mode === "skip" ? 3 : 0,
          };
          assert.deepEqual(counts, expected);
          await refreshed;
          assert.equal(imports.length, index + 1, "One confirmed import");
          assert.equal(imports.at(-1).mode, mode);
          assert.deepEqual(imports.at(-1).data, imports[0].data);
          for (const [key, label] of Object.entries({
            categories: "Categories",
            locations: "Locations",
            units: "Units",
            items: "Items",
            shoppingList: "Shopping",
          }))
            await expect(result).toContainText(
              `${label}: ${expected.created[key]}`,
            );
          await expect(result).toContainText(
            `Skipped matching records: ${expected.skipped}`,
          );
          await expect(result).toBeVisible();
          await expect(preview).toHaveCount(0);
          await expect(page.getByTestId("text-import-error")).toHaveCount(0);

          const afterImport = await h.snapshot(target.id);
          if (first) {
            saved = afterImport;
            for (const [key, count] of Object.entries(expected.created))
              assert.equal(saved[key].length, count);
          } else if (mode === "skip") {
            assert.deepEqual(afterImport, saved, "Skip preserves every record");
          } else {
            for (const key of ["categories", "locations", "units"])
              assert.deepEqual(afterImport[key], saved[key]);
            for (const key of ["items", "shoppingList"]) {
              assert.equal(afterImport[key].length, saved[key].length * 2);
              assert.deepEqual(
                afterImport[key].slice(0, saved[key].length),
                saved[key],
                "Add preserves originals",
              );
              for (const row of saved[key]) {
                const matches = afterImport[key].filter(
                  (entry) => entry.name === row.name,
                );
                assert.equal(matches.length, 2);
                assert.notEqual(matches[0].id, matches[1].id);
              }
            }
          }
          await mobileLists(page, data, mode === "add" ? 2 : 1);
        }
        assert.equal(documents, 1, "Mobile navigation never reloads the page");
        assert.deepEqual(await h.snapshot(source.id), sourceBefore);
        assert.deepEqual(await h.snapshot(other.id), otherBefore);
        assert.deepEqual(errors, [], "No uncaught mobile browser errors");
      } finally {
        await context.close();
      }
    },
  );
}
