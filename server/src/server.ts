import * as dotenv from "dotenv";
import { existsSync } from "node:fs";
import { buildApp } from "./app";

function loadEnvFile(path: string)
{
    dotenv.config({ path });
}

// Load base .env first if it exists to allow NODE_ENV to be defined there
if (existsSync(".env"))
{
    loadEnvFile(".env");
}
else
{
    dotenv.config();
}

const nodeEnv = process.env.NODE_ENV || "development";

const envCandidates: string[] = [];

if (nodeEnv === "production")
{
    envCandidates.push(".env.production", ".env.prod");
}
else
{
    envCandidates.push(`.env.${nodeEnv}`);

    if (nodeEnv === "development")
    {
        envCandidates.push(".env.dev");
    }
}

for (const file of envCandidates)
{
    if (file && existsSync(file))
    {
        loadEnvFile(file);
        break;
    }
}


const PORT = Number(process.env.PORT || 3000);

async function start()
{
    const app = buildApp();

    try
    {
        await app.listen({ port: PORT, host: "0.0.0.0" });
        console.log(`[Curie API] Running on port ${PORT}`);
    }
    catch (err)
    {
        console.error(err);
        process.exit(1);
    }
}

start();
