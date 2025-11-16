import { pgTable, uuid, varchar, text, timestamp } from "drizzle-orm/pg-core";
import { baseId } from "./base";
import { files } from "./files";

export const fileVersions = pgTable("file_versions", {
    ...baseId,

    fileId: uuid("file_id")
        .notNull()
        .references(() => files.id, { onDelete: "cascade" }),

    versionHash: varchar("version_hash", { length: 64 }).notNull(),
    content: text("content").notNull(),

    createdAt: timestamp("created_at").defaultNow().notNull()
    // No updatedAt for versions as they are immutable
});
