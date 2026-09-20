import { db } from "../client";
import { vaults } from "../schema/vaults";
import { vaultMembers } from "../schema/vaultMembers";
import { eq, inArray } from "drizzle-orm";
import { Vault, CreateVaultDto } from "../types";

export class VaultRepository
{
    public async create(data: CreateVaultDto): Promise<Vault>
    {
        const [created] = await db.insert(vaults).values(data).returning();
        // Also add owner as admin member
        await db.insert(vaultMembers).values({
            vaultId: created.id,
            userId: created.ownerId,
            role: "admin",
        });
        return created;
    }

    public async list(): Promise<Vault[]>
    {
        return db.select().from(vaults).orderBy(vaults.createdAt);
    }

    public async listForUser(userId: string): Promise<Vault[]>
    {
        const memberships = await db
            .select({ vaultId: vaultMembers.vaultId })
            .from(vaultMembers)
            .where(eq(vaultMembers.userId, userId));

        const vaultIds = memberships.map((m) => m.vaultId);
        if (vaultIds.length === 0) return [];

        return db
            .select()
            .from(vaults)
            .where(inArray(vaults.id, vaultIds))
            .orderBy(vaults.createdAt);
    }

    public async findById(id: string): Promise<Vault | undefined>
    {
        const [row] = await db.select().from(vaults).where(eq(vaults.id, id));
        return row;
    }

    public async delete(id: string): Promise<void>
    {
        await db.delete(vaults).where(eq(vaults.id, id));
    }
}
