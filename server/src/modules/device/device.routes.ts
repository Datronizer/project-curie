import { FastifyInstance } from "fastify";
import { DeviceRepository } from "../../db/repositories";
import { DeviceService } from "./device.service";

export default async function deviceRoutes(app: FastifyInstance)
{
    const repo = new DeviceRepository();
    const service = new DeviceService(repo);

    app.post("/register", async (req) =>
    {
        const { name } = req.body as any;
        return service.register(name);
    });

    app.post("/heartbeat", async (req, res) =>
    {
        const { deviceId } = req.body as any;
        const device = await service.heartbeat(deviceId);

        return res.status(200).send(device);
    });
}
