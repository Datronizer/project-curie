import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { baseId, timestamps } from "./base";
import { vaults } from "./vaults";

export const files = sqliteTable("files", {
    ...baseId,
    vaultId: text("vault_id")
        .notNull()
        .references(() => vaults.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    hash: text("hash").notNull(),
    size: integer("size").default(0),
    mtime: integer("mtime", { mode: "timestamp" }),
    ...timestamps,
});