import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { baseId } from "./base";
import { users } from "./users";

export const devices = sqliteTable("devices", {
    ...baseId,
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    lastSeenAt: integer("last_seen_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
    createdAt: integer("created_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
});
