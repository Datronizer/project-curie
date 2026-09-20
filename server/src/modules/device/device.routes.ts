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

    app.get("/", async (req, reply) =>
    {
        const userId = req.authenticatedUser?.id;
        if (!userId)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Authenticated user required to list devices",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const devices = await service.list(userId);
        return reply.status(200).send(devices);
    });

    app.delete("/:deviceId", async (req, reply) =>
    {
        const { deviceId } = req.params as { deviceId: string };
        const userId = req.authenticatedUser?.id;

        if (!userId)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Authenticated user required to revoke devices",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        try
        {
            await service.revoke(deviceId, userId);
            return reply.status(200).send({ success: true });
        }
        catch (err: any)
        {
            const isNotFound = err.message?.includes("not found");
            const status = isNotFound ? 404 : 403;
            return reply.status(status).send({
                success: false,
                error: {
                    message: err.message,
                    code: isNotFound ? "NOT_FOUND" : "FORBIDDEN",
                    status,
                },
            });
        }
    });
}
