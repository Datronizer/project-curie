import { db } from "../client";
import { syncStates } from "../schema/syncStates";
import { eq, and } from "drizzle-orm";
import { SyncState, CreateSyncStateDto } from "../types";

export class SyncStateRepository
{
    public async updateState(
        deviceId: string,
        fileId: string,
        hash: string
    ): Promise<SyncState>
    {
        const existing = await this.find(deviceId, fileId);

        if (!existing)
        {
            const [created] = await db
                .insert(syncStates)
                .values({
                    deviceId,
                    fileId,
                    lastKnownHash: hash,
                })
                .returning();

            return created;
        }

        const [updated] = await db
            .update(syncStates)
            .set({
                lastKnownHash: hash,
                lastSyncedAt: new Date(),
            })
            .where(eq(syncStates.id, existing.id))
            .returning();

        return updated;
    }

    public async find(
        deviceId: string,
        fileId: string
    ): Promise<SyncState>
    {
        const [row] = await db
            .select()
            .from(syncStates)
            .where(
                and(
                    eq(syncStates.deviceId, deviceId),
                    eq(syncStates.fileId, fileId)
                )
            );

        if (!row)
        {
            throw new Error(`SyncState for device ${deviceId} and file ${fileId} not found`);
        }

        return row;
    }

    public async listForDevice(deviceId: string): Promise<SyncState[]>
    {
        return db
            .select()
            .from(syncStates)
            .where(eq(syncStates.deviceId, deviceId));
    }
}
