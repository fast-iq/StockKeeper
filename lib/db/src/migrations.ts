import { Client } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

// All API replicas share this lock so only one can apply migrations at a time.
const migrationLockKey = [1398035027, 1];
const migrationsTable = "__drizzle_migrations";

export type MigrationEnvironment = {
  DATABASE_URL?: string;
  EXTERNAL_DB_URL?: string;
};

export function getDevelopmentMigrationUrl(
  env: MigrationEnvironment = process.env,
): string {
  const databaseUrl = env.DATABASE_URL?.trim();

  if (!databaseUrl) {
    throw new Error(
      "DATABASE_URL is required to apply Development database migrations.",
    );
  }

  return databaseUrl;
}

export function getProductionMigrationUrl(
  env: MigrationEnvironment = process.env,
): string {
  const externalDatabaseUrl = env.EXTERNAL_DB_URL?.trim();

  if (!externalDatabaseUrl) {
    throw new Error(
      "EXTERNAL_DB_URL is required for Production migrations; refusing to use DATABASE_URL.",
    );
  }

  return externalDatabaseUrl;
}

export async function runDatabaseMigrations(options: {
  databaseUrl: string;
  migrationsFolder: string;
  migrationsSchema?: string;
}): Promise<void> {
  const migrationsSchema = options.migrationsSchema ?? "public";

  if (!/^[a-z_][a-z0-9_]*$/.test(migrationsSchema)) {
    throw new Error("Invalid PostgreSQL schema name for migration tracking.");
  }

  const client = new Client({
    connectionString: options.databaseUrl,
    connectionTimeoutMillis: 15_000,
  });
  let lockAcquired = false;

  try {
    await client.connect();
    await client.query(
      "SELECT pg_advisory_lock($1::integer, $2::integer)",
      migrationLockKey,
    );
    lockAcquired = true;
    await client.query(`SET search_path TO "${migrationsSchema}"`);

    await migrate(drizzle(client), {
      migrationsFolder: options.migrationsFolder,
      migrationsSchema,
      migrationsTable,
    });
  } finally {
    try {
      if (lockAcquired) {
        await client.query(
          "SELECT pg_advisory_unlock($1::integer, $2::integer)",
          migrationLockKey,
        );
      }
    } finally {
      await client.end();
    }
  }
}
