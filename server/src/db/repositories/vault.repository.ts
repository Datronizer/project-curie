import { db } from "../client";
import { vaults } from "../schema/vaults";
import { eq } from "drizzle-orm";
import { Vault, CreateVaultDto } from "../types";

export class VaultRepository
{
    public async create(data: CreateVaultDto): Promise<Vault>
    {
        const [created] = await db.insert(vaults).values(data).returning();
        return created;
    }

    public async list(): Promise<Vault[]>
    {
        return db.select().from(vaults).orderBy(vaults.createdAt);
    }

    public async findById(id: string): Promise<Vault>
    {
        const [row] = await db.select().from(vaults).where(eq(vaults.id, id));

        if (!row)
        {
            throw new Error(`Vault with id ${id} not found`);
        }

        return row;
    }

    public async delete(id: string): Promise<void>
    {
        await db.delete(vaults).where(eq(vaults.id, id));
    }
}
