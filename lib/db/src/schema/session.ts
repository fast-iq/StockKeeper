import { index, json, pgTable, timestamp, varchar } from "drizzle-orm/pg-core";

export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid", { length: 255 }).primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6, mode: "date" }).notNull(),
  },
  (table) => [index("session_expire_idx").on(table.expire)],
);
