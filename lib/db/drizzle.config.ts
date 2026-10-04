import { defineConfig } from "drizzle-kit";
import path from "path";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl?.trim()) {
  throw new Error("DATABASE_URL must be set for Development database tooling.");
}

export default defineConfig({
  out: "./migrations",
  schema: path
    .join(__dirname, "./src/schema/index.ts")
    .split(path.sep)
    .join("/"),
  dialect: "postgresql",
  dbCredentials: {
    url: databaseUrl,
  },
});
