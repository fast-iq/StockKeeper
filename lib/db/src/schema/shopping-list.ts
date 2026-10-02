import { pgTable, text, serial, timestamp, integer, boolean } from "drizzle-orm/pg-core";
import { usersTable } from "./users";
import { itemsTable } from "./items";

export const shoppingListTable = pgTable("shopping_list", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull().references(() => usersTable.id, { onDelete: "cascade" }),
  itemId: integer("item_id").references(() => itemsTable.id, { onDelete: "set null" }),
  name: text("name").notNull(),
  quantity: integer("quantity").notNull().default(1),
  unit: text("unit"),
  note: text("note"),
  checked: boolean("checked").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ShoppingListEntry = typeof shoppingListTable.$inferSelect;
