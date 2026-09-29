import fp from "fastify-plugin";
import { FastifyError } from "fastify";
import { FastifyReply } from "fastify/types/reply";
import { FastifyRequest } from "fastify/types/request";

export default fp(async function errorPlugin(app)
{
    // Handles thrown errors / rejected promises
    app.setErrorHandler((error: FastifyError, req: FastifyRequest, reply: FastifyReply) =>
    {
        // Log details for debugging
        app.log.error(error);

        const status = error.statusCode || 500;

        reply.status(status).send({
            success: false,
            error: {
                message: error.message,
                code: error.code || "INTERNAL_SERVER_ERROR",
                status,
            }
        });
    });

    // Handle unknown routes & SPA fallback
    app.setNotFoundHandler(async (req, reply) =>
    {
        const url = req.raw.url || "";
        const pathname = url.split("?")[0];
        const isApiRoute =
            pathname.startsWith("/sync") ||
            pathname.startsWith("/devices") ||
            pathname.startsWith("/vaults") ||
            pathname.startsWith("/auth") ||
            pathname.startsWith("/health");

        const isStaticAsset =
            pathname.startsWith("/assets/") ||
            /\.[a-zA-Z0-9]+$/.test(pathname);

        if (!isApiRoute && !isStaticAsset && req.method === "GET" && typeof (reply as any).sendFile === "function")
        {
            return (reply as any).sendFile("index.html");
        }

        reply.status(404).send({
            success: false,
            error: {
                message: `Route ${req.method}:${req.url} not found`,
                code: "NOT_FOUND",
                status: 404,
            }
        });
    });
});
