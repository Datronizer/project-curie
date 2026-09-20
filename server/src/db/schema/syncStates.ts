import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { baseId } from "./base";
import { devices } from "./devices";
import { files } from "./files";

export const syncStates = sqliteTable("sync_states", {
    ...baseId,
    deviceId: text("device_id")
        .notNull()
        .references(() => devices.id, { onDelete: "cascade" }),
    fileId: text("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),
    lastKnownHash: text("last_known_hash").notNull(),
    lastSyncedAt: integer("last_synced_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
});
