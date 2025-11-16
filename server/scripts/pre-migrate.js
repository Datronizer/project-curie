#!/usr/bin/env node
"use strict";

const path = require("path");
const dotenv = require("dotenv");
const { Client } = require("pg");

const envPath = path.resolve(__dirname, "..", ".env.dev");
dotenv.config({ path: envPath });

if (!process.env.DATABASE_URL)
{
    console.error("DATABASE_URL is not defined. Cannot run pre-migrate checks.");
    process.exitCode = 1;
    return;
}

const COLUMN_TARGETS = [
    { table: "files", column: "vault_id" },
];

async function ensureUuidColumns()
{
    const client = new Client({ connectionString: process.env.DATABASE_URL });
    await client.connect();

    try
    {
        for (const { table, column } of COLUMN_TARGETS)
        {
            const result = await client.query(
                `SELECT data_type FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = $1 AND column_name = $2`,
                [table, column],
            );

            if (result.rowCount === 0)
            {
                continue;
            }

            const [{ data_type: type }] = result.rows;
            if (type !== "uuid")
            {
                console.log(`Converting ${table}.${column} from ${type} to uuid...`);
                await client.query(
                    `ALTER TABLE "${table}"
                     ALTER COLUMN "${column}" TYPE uuid
                     USING "${column}"::uuid;`,
                );
                console.log(`Converted ${table}.${column} to uuid.`);
            }
        }
    }
    finally
    {
        await client.end();
    }
}

ensureUuidColumns().catch((error) =>
{
    console.error("Failed to run pre-migrate checks:", error);
    process.exitCode = 1;
});
