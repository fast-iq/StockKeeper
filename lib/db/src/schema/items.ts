import { pgTable, text, serial, timestamp, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { categoriesTable } from "./categories";
import { unitsTable } from "./units";
import { locationsTable } from "./locations";

export const itemsTable = pgTable("items", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description"),
  photoUrl: text("photo_url"),
  quantity: integer("quantity").notNull().default(0),
  unitId: integer("unit_id").references(() => unitsTable.id, {
    onDelete: "set null",
  }),
  unit: text("unit"),
  locationId: integer("location_id").references(() => locationsTable.id, {
    onDelete: "set null",
  }),
  location: text("location"),
  sku: text("sku"),
  barcode: text("barcode"),
  tags: text("tags"),
  notes: text("notes"),
  categoryId: integer("category_id").references(() => categoriesTable.id, {
    onDelete: "set null",
  }),
  userId: integer("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertItemSchema = createInsertSchema(itemsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertItem = z.infer<typeof insertItemSchema>;
export type Item = typeof itemsTable.$inferSelect;
