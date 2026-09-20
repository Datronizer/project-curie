import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import * as schema from "./schema/index";
import path from "node:path";
import fs from "node:fs";

const dbPath = process.env.DATABASE_URL || "./storage/curie.db";
const dir = path.dirname(dbPath);
if (!fs.existsSync(dir))
{
    fs.mkdirSync(dir, { recursive: true });
}

export const sqlite = new Database(dbPath);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("busy_timeout = 5000");

export const db = drizzle(sqlite, { schema });
