import { FastifyInstance } from "fastify";
import { VaultService } from "./vault.service";

export default async function vaultRoutes(app: FastifyInstance)
{
    const vaultService = new VaultService(app.vaultRepo, app.vaultMemberRepo, app.fileRepo);

    app.post("/", async (req, reply) =>
    {
        const { name } = req.body as { name: string };
        const userId = req.authenticatedUser?.id;

        if (!userId)
        {
            return reply.status(401).send({
                success: false,
                error: { message: "Authenticated user required to create a vault", code: "UNAUTHORIZED", status: 401 },
            });
        }

        const vault = await vaultService.create(name, userId);
        return reply.status(201).send(vault);
    });

    app.get("/", async (req) =>
    {
        const userId = req.authenticatedUser?.id;
        return vaultService.list(userId);
    });

    app.get("/:id", async (req, reply) =>
    {
        const { id } = req.params as { id: string };
        const userId = req.authenticatedUser?.id;

        try
        {
            return await vaultService.findOne(id, userId);
        }
        catch (err: any)
        {
            return reply.status(403).send({
                success: false,
                error: { message: err.message, code: "FORBIDDEN", status: 403 },
            });
        }
    });

    app.delete("/:id", async (req, reply) =>
    {
        const { id } = req.params as { id: string };
        const userId = req.authenticatedUser?.id;

        try
        {
            await vaultService.delete(id, userId);
            return { success: true };
        }
        catch (err: any)
        {
            return reply.status(403).send({
                success: false,
                error: { message: err.message, code: "FORBIDDEN", status: 403 },
            });
        }
    });
}
