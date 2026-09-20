import fp from "fastify-plugin";
import crypto from "node:crypto";
import { FastifyRequest, FastifyReply } from "fastify";

export default fp(async function authPlugin(app)
{
    app.addHook("onRequest", async (req: FastifyRequest, reply: FastifyReply) =>
    {
        const url = req.raw.url || "";
        const method = req.method;

        // Public endpoints
        if (
            url === "/health" ||
            url.startsWith("/health?") ||
            (url === "/devices/register" && method === "POST") ||
            (url.startsWith("/auth/") && method === "POST")
        )
        {
            return;
        }

        // Only enforce Bearer authentication on Curie API routes
        const isApiRoute =
            url.startsWith("/sync") ||
            url.startsWith("/devices") ||
            url.startsWith("/vaults") ||
            url.startsWith("/auth");

        if (!isApiRoute)
        {
            // Non-API routes are served by static file handler or SPA fallback
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith("Bearer "))
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Missing or malformed Authorization header. Expected Bearer <token>",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const rawToken = authHeader.slice(7).trim();
        if (!rawToken)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Bearer token is empty",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
        const device = await app.deviceRepo.findByTokenHash(tokenHash);

        if (!device)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Invalid or revoked device token",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const user = await app.userRepo.findById(device.userId);
        if (!user)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Device owner not found",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        req.authenticatedDevice = device;
        req.authenticatedUser = user;
    });
});
