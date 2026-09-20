import { db } from "../client";
import { users } from "../schema/users";
import { eq } from "drizzle-orm";
import { User, CreateUserDto } from "../types";

export class UserRepository
{
    public async create(data: CreateUserDto): Promise<User>
    {
        const [created] = await db.insert(users).values(data).returning();
        return created;
    }

    public async findById(id: string): Promise<User | undefined>
    {
        const [row] = await db.select().from(users).where(eq(users.id, id));
        return row;
    }

    public async findByEmail(email: string): Promise<User | undefined>
    {
        const [row] = await db.select().from(users).where(eq(users.email, email));
        return row;
    }

    public async list(): Promise<User[]>
    {
        return db.select().from(users).orderBy(users.createdAt);
    }
}
