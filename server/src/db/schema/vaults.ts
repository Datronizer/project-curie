import { pgTable, varchar } from "drizzle-orm/pg-core";
import { baseId, timestamps } from "./base";

export const vaults = pgTable("vaults", {
    ...baseId,

    name: varchar("name", { length: 255 }).notNull(),

    ...timestamps,
});