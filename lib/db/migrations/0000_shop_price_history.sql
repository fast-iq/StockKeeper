-- Complete baseline plus additive adoption delta under the original journal
-- tag `0000_shop_price_history`. The journal entry (`when` timestamp) must
-- never change: the runner decides whether to apply a migration by comparing
-- that timestamp with the last recorded row, not by SQL content, so
-- databases that already recorded this entry are skipped entirely.
--
-- Fresh database (empty schema): every CREATE TABLE IF NOT EXISTS below
-- builds the full application schema from scratch — 11 tables, 15 inline
-- foreign keys and all indexes matching meta/0000_snapshot.json. Foreign
-- keys are declared inline so that they are created together with their
-- table and skipped together with it when the table already exists.
--
-- Legacy database (created with `drizzle-kit push` before tracked migrations
-- existed): every CREATE above is a no-op for existing tables; only the
-- adoption statements at the bottom can apply their additive delta
-- (items.price and the price-history tables). Re-running is always safe:
-- every statement is idempotent.
CREATE TABLE IF NOT EXISTS "users" (
  "id" serial PRIMARY KEY NOT NULL,
  "email" text NOT NULL,
  "password_hash" text NOT NULL,
  "name" text NOT NULL,
  "language" text DEFAULT 'auto' NOT NULL,
  "is_admin" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "categories" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "parent_id" integer,
  "user_id" integer NOT NULL,
  "color" text,
  "icon" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "units" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "symbol" text NOT NULL,
  "user_id" integer,
  CONSTRAINT "units_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "locations" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "icon" text DEFAULT 'warehouse',
  "user_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "locations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "items" (
  "id" serial PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "description" text,
  "photo_url" text,
  "quantity" integer DEFAULT 0 NOT NULL,
  "price" numeric(14, 2),
  "unit_id" integer,
  "unit" text,
  "location_id" integer,
  "location" text,
  "sku" text,
  "barcode" text,
  "tags" text,
  "notes" text,
  "category_id" integer,
  "user_id" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "items_unit_id_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "items_location_id_locations_id_fk" FOREIGN KEY ("location_id") REFERENCES "locations"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "items_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE set null ON UPDATE no action,
  CONSTRAINT "items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shopping_list" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "item_id" integer,
  "name" text NOT NULL,
  "quantity" integer DEFAULT 1 NOT NULL,
  "unit" text,
  "note" text,
  "checked" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "shopping_list_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "shopping_list_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE set null ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "password_reset_tokens" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "token" text NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "used_at" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "password_reset_tokens_token_unique" UNIQUE("token"),
  CONSTRAINT "password_reset_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "session" (
  "sid" varchar(255) PRIMARY KEY NOT NULL,
  "sess" json NOT NULL,
  "expire" timestamp (6) NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "shops" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "name" text NOT NULL,
  "name_key" text NOT NULL,
  CONSTRAINT "shops_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "item_prices" (
  "id" serial PRIMARY KEY NOT NULL,
  "user_id" integer NOT NULL,
  "item_id" integer NOT NULL,
  "shop_id" integer NOT NULL,
  "price" numeric(14, 2) NOT NULL,
  "price_date" date NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  CONSTRAINT "item_prices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "item_prices_item_id_items_id_fk" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "item_prices_shop_id_shops_id_fk" FOREIGN KEY ("shop_id") REFERENCES "shops"("id") ON DELETE restrict ON UPDATE no action
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "price_settings" (
  "user_id" integer PRIMARY KEY NOT NULL,
  "mode" text DEFAULT 'lowest' NOT NULL,
  CONSTRAINT "price_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "session_expire_idx" ON "session" USING btree ("expire");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "shops_owner_name_key" ON "shops" USING btree ("user_id", "name_key");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "item_prices_owner_item_shop_date" ON "item_prices" USING btree ("user_id", "item_id", "shop_id", "price_date");
--> statement-breakpoint
-- Adoption delta for databases that predate tracked migrations: the tables
-- above were already created by `drizzle-kit push`, so they are skipped and
-- only missing additive objects are created here.
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
