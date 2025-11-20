import { FastifyInstance } from "fastify";
import { FileRepository, FileVersionRepository } from "../../db/repositories";
import { FileService } from "./file.service";

export default async function fileRoutes(app: FastifyInstance)
{
    const fileRepo = new FileRepository();
    const versionRepo = new FileVersionRepository();
    const fileService = new FileService(fileRepo, versionRepo);

    app.put("/", async (req) =>
    {
        const vaultId = (req.params as any).vaultId;
        const { path, content, hash } = req.body as any;

        return fileService.upsert(vaultId, path, content, hash);
    });
}
