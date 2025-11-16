import { pgTable, uuid, varchar, timestamp } from "drizzle-orm/pg-core";
import { baseId } from "./base";
import { devices } from "./devices";
import { files } from "./files";

export const syncStates = pgTable("sync_states", {
  ...baseId,

  deviceId: uuid("device_id")
    .notNull()
    .references(() => devices.id, { onDelete: "cascade" }),

  fileId: uuid("file_id")
    .notNull()
    .references(() => files.id, { onDelete: "cascade" }),

  lastKnownHash: varchar("last_known_hash", { length: 64 }).notNull(),
  lastSyncedAt: timestamp("last_synced_at").defaultNow().notNull(),
});
