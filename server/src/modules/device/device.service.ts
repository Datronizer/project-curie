import crypto from "node:crypto";
import { DeviceRepository } from "../../db/repositories/device.repository";
import { UserRepository } from "../../db/repositories/user.repository";
import { Device } from "../../db/types";

export interface RegisterDeviceResult
{
    id: string;
    name: string;
    token: string;
}

export class DeviceService
{
    constructor(
        private deviceRepo: DeviceRepository,
        private userRepo: UserRepository
    ) { }

    public async register(name: string, userEmail: string = "primary@curie.local"): Promise<RegisterDeviceResult>
    {
        // Ensure user exists
        let user = await this.userRepo.findByEmail(userEmail);
        if (!user)
        {
            user = await this.userRepo.create({
                name: "Primary User",
                email: userEmail,
            });
        }

        // Generate high-entropy Bearer token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

        const device = await this.deviceRepo.registerDevice({
            userId: user.id,
            name,
            tokenHash,
        });

        return {
            id: device.id,
            name: device.name,
            token: rawToken,
        };
    }

    public async heartbeat(deviceId: string): Promise<Device>
    {
        const device = await this.deviceRepo.updateHeartbeat(deviceId);
        if (!device)
        {
            throw new Error(`Device ${deviceId} not found`);
        }
        return device;
    }
}
