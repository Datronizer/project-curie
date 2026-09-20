import { FastifyInstance } from "fastify";
import { DeviceService } from "./device.service";

export default async function deviceRoutes(app: FastifyInstance)
{
    const service = new DeviceService(app.deviceRepo, app.userRepo);

    app.post("/register", async (req, reply) =>
    {
        const expectedSetupKey = process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret";
        const incomingSetupKey = req.headers["x-setup-key"];

        if (!incomingSetupKey || incomingSetupKey !== expectedSetupKey)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Invalid or missing setup key in x-setup-key header",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const { name, email } = (req.body as any) || {};
        const deviceName = name || "Obsidian Client";
        const result = await service.register(deviceName, email);

        return reply.status(201).send(result);
    });

    app.post("/heartbeat", async (req, reply) =>
    {
        const deviceId = (req.body as any)?.deviceId || req.authenticatedDevice?.id;
        if (!deviceId)
        {
            return reply.status(400).send({
                success: false,
                error: {
                    message: "deviceId is required",
                    code: "BAD_REQUEST",
                    status: 400,
                },
            });
        }

        const device = await service.heartbeat(deviceId);
        return reply.status(200).send(device);
    });
}
