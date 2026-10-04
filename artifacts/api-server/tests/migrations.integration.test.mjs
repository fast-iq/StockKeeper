import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { testDatabaseUrl } from "./helpers/transfer-test-database.mjs";
import { runDatabaseMigrations } from "../../../lib/db/src/migrations.ts";

const databaseUrl = testDatabaseUrl(
  process.env.TRANSFER_TEST_DATABASE_URL,
  process.env.NODE_ENV,
);
const schemaName = `migration_test_${randomUUID().replaceAll("-", "")}`;
const dbRequire = createRequire(
  new URL("../../../lib/db/package.json", import.meta.url),
);
const { Pool } = dbRequire("pg");
const migrationsFolder = fileURLToPath(
  new URL("../../../lib/db/migrations/", import.meta.url),
);

test("tracked migrations preserve existing rows and are safe to rerun", async () => {
  const admin = new Pool({ connectionString: databaseUrl.href });
  let schemaCreated = false;

  try {
    const identity = await admin.query(
      "SELECT current_database() AS database, current_user AS role",
    );
    assert.deepEqual(identity.rows[0], {
      database: "stockkeeper_transfer_test",
      role: "transfer_test",
    });

    await admin.query(`CREATE SCHEMA "${schemaName}"`);
    schemaCreated = true;

    const seed = await admin.connect();
    try {
      await seed.query(`SET search_path TO "${schemaName}"`);
      await seed.query(
        "CREATE TABLE users (id serial PRIMARY KEY); CREATE TABLE items (id serial PRIMARY KEY, name text NOT NULL);",
      );
      await seed.query("INSERT INTO items (name) VALUES ($1)", ["saved item"]);
    } finally {
      seed.release();
    }

    await runDatabaseMigrations({
      databaseUrl: databaseUrl.href,
      migrationsFolder,
      migrationsSchema: schemaName,
    });
    await runDatabaseMigrations({
      databaseUrl: databaseUrl.href,
      migrationsFolder,
      migrationsSchema: schemaName,
    });

    const verify = await admin.connect();
    try {
      await verify.query(`SET search_path TO "${schemaName}"`);
      const existingItem = await verify.query(
        "SELECT name, price FROM items WHERE id = 1",
      );
      assert.deepEqual(existingItem.rows, [
        { name: "saved item", price: null },
      ]);

      const priceTables = await verify.query(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = ANY($2::text[])
         ORDER BY table_name`,
        [schemaName, ["item_prices", "price_settings", "shops"]],
      );
      assert.deepEqual(
        priceTables.rows.map((row) => row.table_name),
        ["item_prices", "price_settings", "shops"],
      );

      const migrationCount = await verify.query(
        'SELECT count(*)::integer AS count FROM "__drizzle_migrations"',
      );
      assert.equal(migrationCount.rows[0].count, 1);
    } finally {
      verify.release();
    }
  } finally {
    try {
      if (schemaCreated)
        await admin.query(`DROP SCHEMA "${schemaName}" CASCADE`);
    } finally {
      await admin.end();
    }
  }
});
