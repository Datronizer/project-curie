import { initDatabase } from "../db/init";
import { UserRepository } from "../db/repositories/user.repository";
import { hashPassword } from "../utils/crypto";

function parseArgs()
{
    const args = process.argv.slice(2);
    let name = "";
    let email = "";
    let password = "";

    for (let i = 0; i < args.length; i++)
    {
        if (args[i] === "--name" && args[i + 1])
        {
            name = args[++i];
        }
        else if (args[i] === "--email" && args[i + 1])
        {
            email = args[++i];
        }
        else if (args[i] === "--password" && args[i + 1])
        {
            password = args[++i];
        }
    }

    // Fall back to positional args: <name> <email> <password>
    if (!name && args[0] && !args[0].startsWith("--")) name = args[0];
    if (!email && args[1] && !args[1].startsWith("--")) email = args[1];
    if (!password && args[2] && !args[2].startsWith("--")) password = args[2];

    return { name, email, password };
}

async function main()
{
    const { name, email, password } = parseArgs();

    if (!name || !email || !password)
    {
        console.error("Usage: npm run user:create -- <name> <email> <password>");
        console.error("   Or: npm run user:create -- --name <name> --email <email> --password <password>");
        process.exit(1);
    }

    initDatabase();
    const userRepo = new UserRepository();

    const existing = await userRepo.findByEmail(email);
    if (existing)
    {
        console.error(`Error: User with email '${email}' already exists.`);
        process.exit(1);
    }

    const passwordHash = await hashPassword(password);
    const user = await userRepo.create({
        name,
        email,
        passwordHash,
    });

    console.log(`✓ User created successfully!`);
    console.log(`  ID:    ${user.id}`);
    console.log(`  Name:  ${user.name}`);
    console.log(`  Email: ${user.email}`);
}

main().catch((err) =>
{
    console.error("Fatal error creating user:", err);
    process.exit(1);
});
