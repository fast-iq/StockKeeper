import { fileURLToPath } from "node:url";
import {
  getDevelopmentMigrationUrl,
  runDatabaseMigrations,
} from "../src/migrations.ts";

const migrationsFolder = fileURLToPath(
  new URL("../migrations/", import.meta.url),
);

await runDatabaseMigrations({
  databaseUrl: getDevelopmentMigrationUrl(),
  migrationsFolder,
});
