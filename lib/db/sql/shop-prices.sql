-- Historical reference only; this change is now tracked in
-- ../migrations/0000_shop_price_history.sql and applied by the migration runner.
-- Additive migration: existing items.price and all existing records are preserved.
BEGIN;
CREATE TABLE IF NOT EXISTS public.shops (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  name text NOT NULL,
  name_key text NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS shops_owner_name_key ON public.shops(user_id, name_key);
CREATE TABLE IF NOT EXISTS public.item_prices (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  item_id integer NOT NULL REFERENCES public.items(id) ON DELETE CASCADE,
  shop_id integer NOT NULL REFERENCES public.shops(id) ON DELETE RESTRICT,
  price numeric(14,2) NOT NULL,
  price_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS item_prices_owner_item_shop_date
  ON public.item_prices(user_id, item_id, shop_id, price_date);
CREATE TABLE IF NOT EXISTS public.price_settings (
  user_id integer PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  mode text NOT NULL DEFAULT 'lowest'
);
COMMIT;