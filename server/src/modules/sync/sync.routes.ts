import { FastifyInstance } from "fastify";
import { SyncService } from "./sync.service";

export default async function syncRoutes(app: FastifyInstance)
{
    const service = new SyncService(app.fileRepo, app.syncStateRepo);

    app.post("/diff", async (req, reply) =>
    {
        const { deviceId, vaultId, path, clientHash } = (req.body as any) || {};
        const effectiveDeviceId = deviceId || req.authenticatedDevice?.id;

        if (!effectiveDeviceId || !vaultId || !path || !clientHash)
        {
            return reply.status(400).send({
                success: false,
                error: {
                    message: "deviceId, vaultId, path, and clientHash are all required",
                    code: "BAD_REQUEST",
                    status: 400,
                },
            });
        }

        const userId = req.authenticatedUser?.id;
        if (userId)
        {
            const hasAccess = await app.vaultMemberRepo.hasAccess(vaultId, userId, "read");
            if (!hasAccess)
            {
                return reply.status(403).send({
                    success: false,
                    error: { message: "Access denied to vault", code: "FORBIDDEN", status: 403 },
                });
            }
        }

        const diffResult = await service.diff(effectiveDeviceId, vaultId, path, clientHash);
        return reply.status(200).send(diffResult);
    });
}
