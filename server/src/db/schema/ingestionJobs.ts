import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";
import { baseId, timestamps } from "./base";
import { vaults } from "./vaults";

export type IngestionJobStatus = "queued" | "processing" | "completed" | "failed";

export const ingestionJobs = sqliteTable("ingestion_jobs", {
    ...baseId,
    vaultId: text("vault_id")
        .notNull()
        .references(() => vaults.id, { onDelete: "cascade" }),
    status: text("status").$type<IngestionJobStatus>().notNull().default("queued"),
    progress: integer("progress").notNull().default(0),
    stage: text("stage").default("queued"),
    sourceFileName: text("source_file_name").notNull(),
    sourceFilePath: text("source_file_path"),
    sourceFileHash: text("source_file_hash"),
    targetNotePath: text("target_note_path"),
    error: text("error"),
    metadata: text("metadata"),
    ...timestamps,
});

export type IngestionJob = typeof ingestionJobs.$inferSelect;
export type NewIngestionJob = typeof ingestionJobs.$inferInsert;
