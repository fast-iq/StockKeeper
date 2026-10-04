import app from "./app";
import { logger } from "./lib/logger";
import {
  getProductionMigrationUrl,
  runDatabaseMigrations,
} from "@workspace/db/migrations";
import { fileURLToPath } from "node:url";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer() {
  if (process.env.NODE_ENV === "production") {
    await runDatabaseMigrations({
      databaseUrl: getProductionMigrationUrl(),
      migrationsFolder: fileURLToPath(
        new URL("./migrations/", import.meta.url),
      ),
    });
    logger.info("Production database migrations are up to date");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer().catch((error: unknown) => {
  logger.error(
    { message: error instanceof Error ? error.message : "Unknown error" },
    "API server startup failed",
  );
  process.exit(1);
});
