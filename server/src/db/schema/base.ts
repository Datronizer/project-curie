import { text, integer } from "drizzle-orm/sqlite-core";
import { randomUUID } from "node:crypto";

export const baseId = {
    id: text("id").primaryKey().$defaultFn(() => randomUUID()),
};

export const timestamps = {
    createdAt: integer("created_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
    updatedAt: integer("updated_at", { mode: "timestamp" })
        .notNull()
        .$defaultFn(() => new Date()),
};