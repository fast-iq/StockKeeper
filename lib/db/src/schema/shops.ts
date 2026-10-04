import {
  pgTable,
  serial,
  integer,
  text,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { usersTable } from "./users";

export const shopsTable = pgTable(
  "shops",
  {
    id: serial("id").primaryKey(),
    userId: integer("user_id")
      .notNull()
      .references(() => usersTable.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    nameKey: text("name_key").notNull(),
  },
  (t) => [uniqueIndex("shops_owner_name_key").on(t.userId, t.nameKey)],
);
export const insertShopSchema = createInsertSchema(shopsTable).omit({
  id: true,
});
export type Shop = typeof shopsTable.$inferSelect;
