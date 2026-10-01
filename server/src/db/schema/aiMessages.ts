import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { baseId } from "./base";
import { aiConversations } from "./aiConversations";

export type AiMessageRole = "user" | "assistant" | "system";

export const aiMessages = sqliteTable("ai_messages", {
    ...baseId,
    conversationId: text("conversation_id")
        .notNull()
        .references(() => aiConversations.id, { onDelete: "cascade" }),
    role: text("role").$type<AiMessageRole>().notNull(),
    content: text("content").notNull(),
    thought: text("thought"),
    metadata: text("metadata"),
    createdAt: integer("created_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
});

export type AiMessage = typeof aiMessages.$inferSelect;
export type NewAiMessage = typeof aiMessages.$inferInsert;
