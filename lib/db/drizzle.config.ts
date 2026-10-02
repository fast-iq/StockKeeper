import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.EXTERNAL_DB_URL ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    "EXTERNAL_DB_URL or DATABASE_URL must be set. Configure a PostgreSQL connection.",
  );
}

export default defineConfig({
  schema: path
    .join(__dirname, "./src/schema/index.ts")
    .split(path.sep)
    .join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
