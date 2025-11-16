import { timestamp, uuid } from "drizzle-orm/pg-core";

export const baseId = {
    id: uuid("id").primaryKey().defaultRandom(),
}

export const timestamps = {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
};