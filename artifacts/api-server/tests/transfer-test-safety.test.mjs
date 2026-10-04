import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "./helpers/transfer-test-database.mjs";

const local =
  "postgresql://transfer_test:test-only@127.0.0.1:55439/stockkeeper_transfer_test";

test("test database guard rejects missing, production, remote and overridden connections", () => {
  assert.equal(
    testDatabaseUrl(local, "test").pathname,
    "/stockkeeper_transfer_test",
  );
  for (const [url, env] of [
    [undefined, "test"],
    [local, "production"],
    [local, "development"],
    [local.replace("127.0.0.1", "db.example.invalid"), "test"],
    [local.replace("/stockkeeper_transfer_test", "/stockkeeper"), "test"],
    [local.replace("transfer_test:", "postgres:"), "test"],
    [`${local}?host=db.example.invalid`, "test"],
    [`${local}?options=-c%20search_path=public`, "test"],
    [local.replace("postgresql:", "https:"), "test"],
  ])
    assert.throws(() => testDatabaseUrl(url, env));
});

for (const launcher of [
  "./run-transfer-integration.mjs",
  "../../inventory-app/tests/run-data-exchange.mjs",
])
  test(`${launcher} fails without dedicated URL even with application DB variables`, () => {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL(launcher, import.meta.url))],
      {
        env: {
          NODE_ENV: "test",
          DATABASE_URL: local,
          EXTERNAL_DB_URL:
            "postgresql://fake:fake@db.example.invalid/production",
        },
        encoding: "utf8",
      },
    );
    assert.equal(result.status, 1);
    assert.match(result.stderr, /No application database fallback/);
    assert.equal(result.stderr.includes("db.example.invalid"), false);
  });
