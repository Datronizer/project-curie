import * as dotenv from "dotenv";
dotenv.config({ path: ".env.dev" });

import { buildApp } from "./app";


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
