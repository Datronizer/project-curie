/// <reference types="node" />
import dotenv from "dotenv";
dotenv.config({ path: ".env.dev" });

import { defineConfig } from "drizzle-kit";

export default defineConfig({
    dialect: "sqlite",
    schema: "./src/db/schema",
    out: "./drizzle",
    dbCredentials: {
        url: process.env.DATABASE_URL || "./storage/curie.db",
    },
});
