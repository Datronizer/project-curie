import { db } from "../client";
import { vaultMembers } from "../schema/vaultMembers";
import { eq, and } from "drizzle-orm";
import { VaultMember, CreateVaultMemberDto } from "../types";

export type VaultRole = "read" | "write" | "admin";

const ROLE_HIERARCHY: Record<VaultRole, number> = {
    read: 1,
    write: 2,
    admin: 3,
};

export class VaultMemberRepository
{
    public async addMember(data: CreateVaultMemberDto): Promise<VaultMember>
    {
        const [created] = await db.insert(vaultMembers).values(data).returning();
        return created;
    }

    public async findMembership(vaultId: string, userId: string): Promise<VaultMember | undefined>
    {
        const [row] = await db
            .select()
            .from(vaultMembers)
            .where(
                and(
                    eq(vaultMembers.vaultId, vaultId),
                    eq(vaultMembers.userId, userId)
                )
            );
        return row;
    }

    public async hasAccess(vaultId: string, userId: string, requiredRole: VaultRole = "read"): Promise<boolean>
    {
        const membership = await this.findMembership(vaultId, userId);
        if (!membership) return false;

        const currentLevel = ROLE_HIERARCHY[membership.role as VaultRole] || 0;
        const requiredLevel = ROLE_HIERARCHY[requiredRole];

        return currentLevel >= requiredLevel;
    }

    public async listMembers(vaultId: string): Promise<VaultMember[]>
    {
        return db
            .select()
            .from(vaultMembers)
            .where(eq(vaultMembers.vaultId, vaultId));
    }

    public async listVaultsForUser(userId: string): Promise<VaultMember[]>
    {
        return db
            .select()
            .from(vaultMembers)
            .where(eq(vaultMembers.userId, userId));
    }

    public async removeMember(vaultId: string, userId: string): Promise<void>
    {
        await db
            .delete(vaultMembers)
            .where(
                and(
                    eq(vaultMembers.vaultId, vaultId),
                    eq(vaultMembers.userId, userId)
                )
            );
    }
}
