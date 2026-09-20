import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseId, timestamps } from "./base";
import { users } from "./users";
import { vaults } from "./vaults";

export const vaultMembers = sqliteTable("vault_members", {
    ...baseId,
    vaultId: text("vault_id")
        .notNull()
        .references(() => vaults.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .notNull()
        .references(() => users.id, { onDelete: "cascade" }),
    role: text("role", { enum: ["read", "write", "admin"] })
        .notNull()
        .default("read"),
    ...timestamps,
});
