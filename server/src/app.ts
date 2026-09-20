import fastify from "fastify";
import fastifyStatic from "@fastify/static";
import path from "node:path";
import fs from "node:fs";

import { initDatabase } from "./db/init";
import dbPlugin from "./plugins/db.plugin";
import authPlugin from "./plugins/auth.plugin";
import errorPlugin from "./plugins/error.plugin";

import authRoutes from "./modules/auth/auth.routes";
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
    app.register(authRoutes, { prefix: "/auth" });
    app.register(vaultRoutes, { prefix: "/vaults" });
    app.register(fileRoutes, { prefix: "/vaults/:vaultId" });
    app.register(deviceRoutes, { prefix: "/devices" });
    app.register(syncRoutes, { prefix: "/sync" });

    // Static Web Client & SPA fallback
    const webDistPath = process.env.WEB_DIST_DIR || path.resolve(__dirname, "../../web/dist");
    if (fs.existsSync(webDistPath))
    {
        app.register(fastifyStatic, {
            root: webDistPath,
            prefix: "/",
            wildcard: false,
        });
    }

    return app;
}
