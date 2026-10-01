import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseId, timestamps } from "./base";
import { vaults } from "./vaults";
import { users } from "./users";

export const aiConversations = sqliteTable("ai_conversations", {
    ...baseId,
    vaultId: text("vault_id")
        .notNull()
        .references(() => vaults.id, { onDelete: "cascade" }),
    userId: text("user_id")
        .references(() => users.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    model: text("model").notNull(),
    ...timestamps,
});

export type AiConversation = typeof aiConversations.$inferSelect;
export type NewAiConversation = typeof aiConversations.$inferInsert;
