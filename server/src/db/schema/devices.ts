import { pgTable, varchar, timestamp } from "drizzle-orm/pg-core";
import { baseId } from "./base";

export const devices = pgTable("devices", {
  ...baseId,

  name: varchar("name", { length: 255 }).notNull(),

  lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});
