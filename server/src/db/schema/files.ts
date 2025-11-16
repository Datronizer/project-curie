import { pgTable, varchar } from "drizzle-orm/pg-core";
import { baseId, timestamps } from "./base";
import { vaults } from "./vaults";

export const files = pgTable("files", {
    ...baseId,

    vaultId: varchar("vault_id")
        .notNull()
        .references(() => vaults.id, { onDelete: "cascade" }),

    path: varchar("path").notNull(),
    hash: varchar("hash", { length: 64 }).notNull(),

    ...timestamps,
});