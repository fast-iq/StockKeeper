import { pgTable, integer, text } from "drizzle-orm/pg-core";
import { usersTable } from "./users";

export const priceSettingsTable = pgTable("price_settings", {
  userId: integer("user_id")
    .primaryKey()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  mode: text("mode").notNull().default("lowest"),
});
