import { FastifyInstance } from "fastify";
import { VaultRepository, FileRepository } from "../../db/repositories";
import { VaultService } from "./vault.service";

export default async function vaultRoutes(app: FastifyInstance)
{
    const vaultRepo = new VaultRepository();
    const fileRepo = new FileRepository();
    const service = new VaultService(vaultRepo, fileRepo);

    app.post("/", async (req, reply) =>
    {
        const { name } = req.body as { name: string };
        return service.create(name);
    });

    app.get("/", async () =>
    {
        return service.list();
    });

    app.get("/:id", async (req) =>
    {
        const { id } = req.params as { id: string };
        return service.findOne(id);
    });

    app.delete("/:id", async (req) =>
    {
        const { id } = req.params as { id: string };
        await service.delete(id);
        return { success: true };
    });
}
