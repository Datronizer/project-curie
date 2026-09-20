import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseId, timestamps } from "./base";
import { users } from "./users";

export const vaults = sqliteTable("vaults", {
    ...baseId,
    name: text("name").notNull(),
    ownerId: text("owner_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    ...timestamps,
});