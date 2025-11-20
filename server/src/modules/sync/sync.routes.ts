import { FastifyInstance } from "fastify";
import { FileRepository, SyncStateRepository } from "../../db/repositories";
import { SyncService } from "./sync.service";

export default async function syncRoutes(app: FastifyInstance)
{
    const fileRepo = new FileRepository();
    const syncRepo = new SyncStateRepository();
    const service = new SyncService(fileRepo, syncRepo);

    app.post("/diff", async (req) =>
    {
        const { deviceId, vaultId, path, clientHash } = req.body as any;
        return service.diff(deviceId, vaultId, path, clientHash);
    });
}
