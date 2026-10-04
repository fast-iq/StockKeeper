import assert from "node:assert/strict";
import test from "node:test";
import {
  getDevelopmentMigrationUrl,
  getProductionMigrationUrl,
  runDatabaseMigrations,
} from "../../../lib/db/src/migrations.ts";

test("Development migrations use DATABASE_URL, not EXTERNAL_DB_URL", () => {
  assert.equal(
    getDevelopmentMigrationUrl({
      DATABASE_URL: "postgresql://development.invalid/db",
      EXTERNAL_DB_URL: "postgresql://production.invalid/db",
    }),
    "postgresql://development.invalid/db",
  );
});

test("Production migrations require EXTERNAL_DB_URL and never fall back", () => {
  assert.throws(
    () =>
      getProductionMigrationUrl({
        DATABASE_URL: "postgresql://development.invalid/db",
      }),
    /refusing to use DATABASE_URL/,
  );

  assert.equal(
    getProductionMigrationUrl({
      DATABASE_URL: "postgresql://development.invalid/db",
      EXTERNAL_DB_URL: "postgresql://production.invalid/db",
    }),
    "postgresql://production.invalid/db",
  );
});

test("migration tracking schema rejects SQL fragments before connecting", async () => {
  await assert.rejects(
    runDatabaseMigrations({
      databaseUrl: "postgresql://unused.invalid/db",
      migrationsFolder: "/unused",
      migrationsSchema: 'public"; DROP SCHEMA public CASCADE; --',
    }),
    /Invalid PostgreSQL schema name/,
  );
});
