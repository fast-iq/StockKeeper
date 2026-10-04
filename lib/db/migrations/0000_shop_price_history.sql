-- Idempotent adoption migration for existing Development and Production databases.
-- The snapshot beside this file records the complete current Drizzle schema;
-- this SQL applies the known additive schema delta without recreating legacy tables.
ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "price" numeric(14, 2);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shops" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "name" text NOT NULL,
  "name_key" text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shops_owner_name_key"
  ON "shops" ("user_id", "name_key");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_prices" (
  "id" serial PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "item_id" integer NOT NULL REFERENCES "items"("id") ON DELETE CASCADE,
  "shop_id" integer NOT NULL REFERENCES "shops"("id") ON DELETE RESTRICT,
  "price" numeric(14, 2) NOT NULL,
  "price_date" date NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_prices_owner_item_shop_date"
  ON "item_prices" ("user_id", "item_id", "shop_id", "price_date");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_settings" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "mode" text NOT NULL DEFAULT 'lowest'
);