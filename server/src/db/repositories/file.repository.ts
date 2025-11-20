import { db } from "../client";
import { files } from "../schema/files";
import { eq, and } from "drizzle-orm";
import { File, CreateFileDto } from "../types";

export class FileRepository
{
    public async create(data: CreateFileDto): Promise<File>
    {
        const [created] = await db.insert(files).values(data).returning();
        return created;
    }

    public async updateHash(fileId: string, newHash: string): Promise<File>
    {
        const [updated] = await db
            .update(files)
            .set({ hash: newHash, updatedAt: new Date() })
            .where(eq(files.id, fileId))
            .returning();

        return updated;
    }

    public async findById(fileId: string): Promise<File>
    {
        const [row] = await db
            .select()
            .from(files)
            .where(eq(files.id, fileId));

        if (!row)
        {
            throw new Error(`File with id ${fileId} not found`);
        }

        return row;
    }

    public async findByVaultAndPath(
        vaultId: string,
        path: string
    ): Promise<File | undefined>
    {
        const [row] = await db
            .select()
            .from(files)
            .where(
                and(eq(files.vaultId, vaultId), eq(files.path, path))
            );

        if (!row) return undefined;
        return row
    }

    public async listFilesInVault(vaultId: string): Promise<File[]>
    {
        return db
            .select()
            .from(files)
            .where(eq(files.vaultId, vaultId));
    }
}
