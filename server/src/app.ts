import fastify from "fastify";

import dbPlugin from "./plugins/db.plugin";

import deviceRoutes from "./modules/device/device.routes";
import fileRoutes from "./modules/file/file.routes";
import syncRoutes from "./modules/sync/sync.routes";
import vaultRoutes from "./modules/vault/vault.routes";
import errorPlugin from "./plugins/error.plugin";


export function buildApp()
{
    const isDevelopment = process.env.NODE_ENV !== "production";

    const app = fastify({
        logger: isDevelopment
            ? {
                transport: {
                    target: "pino-pretty",
                    options: {
                        colorize: true,
                        translateTime: "yyyy-mm-dd HH:MM:ss.l o",
                        ignore: "pid,hostname",
                        singleLine: false,
                        messageFormat: "{msg}"
                    }
                }
            }
            : true,
    });

    // Load repositories into app instance
    app.register(errorPlugin);
    app.register(dbPlugin);

    // Health check
    app.get("/health", async () => ({ status: "ok", service: "project-curie-api" }));

    // Register module routes
    app.register(vaultRoutes, { prefix: "/vaults" });
    app.register(fileRoutes, { prefix: "/vaults/:vaultId/files" });
    app.register(deviceRoutes, { prefix: "/devices" });
    app.register(syncRoutes, { prefix: "/sync" });

    return app;
}
