import {
  pgTable,
  serial,
  integer,
  numeric,
  date,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";
import { itemsTable } from "./items";
import { shopsTable } from "./shops";

export const itemPricesTable = pgTable(
  "item_prices",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    itemId: integer("item_id")
      .notNull()
      .references(() => itemsTable.id, { onDelete: "cascade" }),
    shopId: integer("shop_id")
      .notNull()
      .references(() => shopsTable.id, { onDelete: "restrict" }),
    price: numeric("price", {
      precision: 14,
      scale: 2,
      mode: "number",
    }).notNull(),
    priceDate: date("price_date", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("item_prices_owner_item_shop_date").on(
      t.userId,
      t.itemId,
      t.shopId,
      t.priceDate,
    ),
  ],
);
export const insertItemPriceSchema = createInsertSchema(itemPricesTable).omit({
  id: true,
  createdAt: true,
});
export type ItemPriceRecord = typeof itemPricesTable.$inferSelect;
