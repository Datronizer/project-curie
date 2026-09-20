import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { baseId, timestamps } from "./base";

export const users = sqliteTable("users", {
    ...baseId,
    name: text("name").notNull(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash"),
    ...timestamps,
});
