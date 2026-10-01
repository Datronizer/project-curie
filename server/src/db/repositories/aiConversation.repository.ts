import { db } from "../client";
import { aiConversations } from "../schema/aiConversations";
import { aiMessages } from "../schema/aiMessages";
import { eq, desc, asc, and } from "drizzle-orm";
import {
    AiConversation,
    AiMessage,
    CreateAiConversationDto,
    CreateAiMessageDto
} from "../types";

export interface ConversationWithMessages {
    conversation: AiConversation;
    messages: AiMessage[];
}

export class AiConversationRepository {
    public async createConversation(data: CreateAiConversationDto): Promise<AiConversation> {
        const [created] = await db
            .insert(aiConversations)
            .values({
                ...data,
                createdAt: data.createdAt || new Date(),
                updatedAt: data.updatedAt || new Date(),
            })
            .returning();
        return created;
    }

    public async findById(id: string): Promise<AiConversation | undefined> {
        const [row] = await db
            .select()
            .from(aiConversations)
            .where(eq(aiConversations.id, id));
        return row;
    }

    public async findByIdAndVault(id: string, vaultId: string): Promise<AiConversation | undefined> {
        const [row] = await db
            .select()
            .from(aiConversations)
            .where(and(eq(aiConversations.id, id), eq(aiConversations.vaultId, vaultId)));
        return row;
    }

    public async listByVault(vaultId: string, limit: number = 100): Promise<AiConversation[]> {
        return db
            .select()
            .from(aiConversations)
            .where(eq(aiConversations.vaultId, vaultId))
            .orderBy(desc(aiConversations.updatedAt))
            .limit(limit);
    }

    public async updateTitle(id: string, title: string): Promise<AiConversation | undefined> {
        const [updated] = await db
            .update(aiConversations)
            .set({
                title: title.trim(),
                updatedAt: new Date(),
            })
            .where(eq(aiConversations.id, id))
            .returning();
        return updated;
    }

    public async touch(id: string): Promise<void> {
        await db
            .update(aiConversations)
            .set({
                updatedAt: new Date(),
            })
            .where(eq(aiConversations.id, id));
    }

    public async delete(id: string, vaultId?: string): Promise<boolean> {
        const condition = vaultId
            ? and(eq(aiConversations.id, id), eq(aiConversations.vaultId, vaultId))
            : eq(aiConversations.id, id);

        // Delete associated messages first (and foreign key cascade also ensures safety)
        await db.delete(aiMessages).where(eq(aiMessages.conversationId, id));

        const result = await db.delete(aiConversations).where(condition).returning();
        return result.length > 0;
    }

    public async addMessage(data: CreateAiMessageDto): Promise<AiMessage> {
        const [message] = await db
            .insert(aiMessages)
            .values({
                ...data,
                createdAt: data.createdAt || new Date(),
            })
            .returning();

        // Update conversation updated_at timestamp
        await this.touch(data.conversationId);

        return message;
    }

    public async getMessages(conversationId: string): Promise<AiMessage[]> {
        return db
            .select()
            .from(aiMessages)
            .where(eq(aiMessages.conversationId, conversationId))
            .orderBy(asc(aiMessages.createdAt));
    }

    public async getConversationWithMessages(
        id: string,
        vaultId?: string
    ): Promise<ConversationWithMessages | undefined> {
        const conversation = vaultId
            ? await this.findByIdAndVault(id, vaultId)
            : await this.findById(id);

        if (!conversation) return undefined;

        const messages = await this.getMessages(id);
        return { conversation, messages };
    }
}
