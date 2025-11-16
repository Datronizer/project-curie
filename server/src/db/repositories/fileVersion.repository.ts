import { db } from "../client";
import { fileVersions } from "../schema/fileVersions";
import { eq } from "drizzle-orm";
import { FileVersion, CreateFileVersionDto } from "../types";

export class FileVersionRepository
{
    public async create(data: CreateFileVersionDto): Promise<FileVersion>
    {
        const [created] = await db
            .insert(fileVersions)
            .values(data)
            .returning();

        return created;
    }

    public async getVersions(fileId: string): Promise<FileVersion[]>
    {
        return db
            .select()
            .from(fileVersions)
            .where(eq(fileVersions.fileId, fileId))
            .orderBy(fileVersions.createdAt);
    }

    public async getLatestVersion(fileId: string): Promise<FileVersion>
    {
        const versions = await this.getVersions(fileId);
        if (versions.length === 0)
        {
            throw new Error(`No versions found for file with id ${fileId}`);
        }
        return versions[versions.length - 1];
    }
}
