import { db } from "../client";
import { devices } from "../schema/devices";
import { eq } from "drizzle-orm";
import { Device, CreateDeviceDto } from "../types";

export class DeviceRepository
{
    public async registerDevice(data: CreateDeviceDto): Promise<Device>
    {
        const [created] = await db
            .insert(devices)
            .values(data)
            .returning();

        return created;
    }

    public async updateHeartbeat(deviceId: string): Promise<Device | undefined>
    {
        const [updated] = await db
            .update(devices)
            .set({ lastSeenAt: new Date() })
            .where(eq(devices.id, deviceId))
            .returning();

        return updated;
    }

    public async findById(deviceId: string): Promise<Device | undefined>
    {
        const [row] = await db
            .select()
            .from(devices)
            .where(eq(devices.id, deviceId));

        return row;
    }

    public async findByTokenHash(tokenHash: string): Promise<Device | undefined>
    {
        const [row] = await db
            .select()
            .from(devices)
            .where(eq(devices.tokenHash, tokenHash));

        return row;
    }

    public async listForUser(userId: string): Promise<Device[]>
    {
        return db
            .select()
            .from(devices)
            .where(eq(devices.userId, userId));
    }

    public async delete(deviceId: string): Promise<void>
    {
        await db.delete(devices).where(eq(devices.id, deviceId));
    }
}
