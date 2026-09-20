import fastify from "fastify";

import { initDatabase } from "./db/init";
import dbPlugin from "./plugins/db.plugin";
import authPlugin from "./plugins/auth.plugin";
import errorPlugin from "./plugins/error.plugin";

import deviceRoutes from "./modules/device/device.routes";
import fileRoutes from "./modules/file/file.routes";
import syncRoutes from "./modules/sync/sync.routes";
import vaultRoutes from "./modules/vault/vault.routes";

export function buildApp()
{
    // Ensure SQLite tables exist
    initDatabase();

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
                        messageFormat: "{msg}",
                    },
                },
            }
            : true,
    });

    // Plugins
    app.register(errorPlugin);
    app.register(dbPlugin);
    app.register(authPlugin);

    // Health check (public)
    app.get("/health", async () => ({ status: "ok", service: "project-curie-api" }));

    // Module routes
    app.register(vaultRoutes, { prefix: "/vaults" });
    app.register(fileRoutes, { prefix: "/vaults/:vaultId" });
    app.register(deviceRoutes, { prefix: "/devices" });
    app.register(syncRoutes, { prefix: "/sync" });

    return app;
}
