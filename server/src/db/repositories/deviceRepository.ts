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

    public async updateHeartbeat(deviceId: string): Promise<Device>
    {
        const [updated] = await db
            .update(devices)
            .set({ lastSeenAt: new Date() })
            .where(eq(devices.id, deviceId))
            .returning();

        return updated;
    }

    public async findById(deviceId: string): Promise<Device>
    {
        const [row] = await db
            .select()
            .from(devices)
            .where(eq(devices.id, deviceId));

        if (!row)
        {
            throw new Error(`Device with id ${deviceId} not found`);
        }

        return row;
    }
}
