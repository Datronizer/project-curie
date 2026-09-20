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

    public async updateHash(fileId: string, newHash: string, size?: number, mtime?: Date): Promise<File>
    {
        const [updated] = await db
            .update(files)
            .set({
                hash: newHash,
                size: size ?? 0,
                mtime: mtime ?? new Date(),
                updatedAt: new Date(),
            })
            .where(eq(files.id, fileId))
            .returning();

        return updated;
    }

    public async upsertFile(vaultId: string, path: string, hash: string, size?: number, mtime?: Date): Promise<File>
    {
        const existing = await this.findByVaultAndPath(vaultId, path);
        if (!existing)
        {
            return this.create({
                vaultId,
                path,
                hash,
                size: size ?? 0,
                mtime: mtime ?? new Date(),
            });
        }

        return this.updateHash(existing.id, hash, size, mtime);
    }

    public async findById(fileId: string): Promise<File | undefined>
    {
        const [row] = await db
            .select()
            .from(files)
            .where(eq(files.id, fileId));

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

        return row;
    }

    public async listFilesInVault(vaultId: string): Promise<File[]>
    {
        return db
            .select()
            .from(files)
            .where(eq(files.vaultId, vaultId));
    }

    public async delete(fileId: string): Promise<void>
    {
        await db.delete(files).where(eq(files.id, fileId));
    }

    public async deleteByVaultAndPath(vaultId: string, path: string): Promise<void>
    {
        await db
            .delete(files)
            .where(
                and(eq(files.vaultId, vaultId), eq(files.path, path))
            );
    }
}
