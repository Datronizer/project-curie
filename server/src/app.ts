import fastify from "fastify";

export function buildApp()
{
    const app = fastify({
        logger: false
    });

    // Health check
    app.get("/health", async () =>
    {
        return { status: "ok", service: "project-curie-api" };
    });

    return app;
}
