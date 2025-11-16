import { DeviceRepository } from "../../db/repositories/device.repository";
import { Device } from "../../db/types";

export class DeviceService
{
    constructor(private repo: DeviceRepository) { }

    public register(name: string): Promise<Device>
    {
        return this.repo.registerDevice({ name });
    }

    public heartbeat(deviceId: string): Promise<Device>
    {
        return this.repo.updateHeartbeat(deviceId);
    }
}
