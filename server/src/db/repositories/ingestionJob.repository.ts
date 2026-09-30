import { db } from "../client";
import { ingestionJobs, IngestionJobStatus } from "../schema/ingestionJobs";
import { eq, desc, and } from "drizzle-orm";
import { IngestionJob, CreateIngestionJobDto } from "../types";

export class IngestionJobRepository
{
    public async create(data: CreateIngestionJobDto): Promise<IngestionJob>
    {
        const [created] = await db.insert(ingestionJobs).values(data).returning();
        return created;
    }

    public async findById(jobId: string): Promise<IngestionJob | undefined>
    {
        const [row] = await db
            .select()
            .from(ingestionJobs)
            .where(eq(ingestionJobs.id, jobId));
        return row;
    }

    public async findByIdAndVault(jobId: string, vaultId: string): Promise<IngestionJob | undefined>
    {
        const [row] = await db
            .select()
            .from(ingestionJobs)
            .where(and(eq(ingestionJobs.id, jobId), eq(ingestionJobs.vaultId, vaultId)));
        return row;
    }

    public async listByVault(vaultId: string, limit: number = 50): Promise<IngestionJob[]>
    {
        return db
            .select()
            .from(ingestionJobs)
            .where(eq(ingestionJobs.vaultId, vaultId))
            .orderBy(desc(ingestionJobs.createdAt))
            .limit(limit);
    }

    public async getPendingJobs(limit: number = 10): Promise<IngestionJob[]>
    {
        return db
            .select()
            .from(ingestionJobs)
            .where(eq(ingestionJobs.status, "queued"))
            .orderBy(ingestionJobs.createdAt)
            .limit(limit);
    }

    public async updateProgress(jobId: string, progress: number, stage?: string): Promise<IngestionJob | undefined>
    {
        const [updated] = await db
            .update(ingestionJobs)
            .set({
                progress,
                ...(stage ? { stage } : {}),
                updatedAt: new Date(),
            })
            .where(eq(ingestionJobs.id, jobId))
            .returning();
        return updated;
    }

    public async updateStatus(
        jobId: string,
        status: IngestionJobStatus,
        extra?: {
            progress?: number;
            stage?: string;
            sourceFilePath?: string;
            sourceFileHash?: string;
            targetNotePath?: string;
            error?: string;
            metadata?: string;
        }
    ): Promise<IngestionJob | undefined>
    {
        const [updated] = await db
            .update(ingestionJobs)
            .set({
                status,
                ...(extra ?? {}),
                updatedAt: new Date(),
            })
            .where(eq(ingestionJobs.id, jobId))
            .returning();
        return updated;
    }

    public async delete(jobId: string): Promise<void>
    {
        await db.delete(ingestionJobs).where(eq(ingestionJobs.id, jobId));
    }
}
