import { FastifyInstance } from "fastify";
import crypto from "node:crypto";
import { hashPassword, verifyPassword } from "../../utils/crypto";

export default async function authRoutes(app: FastifyInstance)
{
    // POST /auth/users - Admin provision user
    app.post("/users", async (req, reply) =>
    {
        const expectedSetupKey = process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret";
        const incomingSetupKey = req.headers["x-setup-key"];

        if (!incomingSetupKey || incomingSetupKey !== expectedSetupKey)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Invalid or missing setup key in x-setup-key header",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const { name, email, password } = (req.body as any) || {};
        if (!name || !email || !password)
        {
            return reply.status(400).send({
                success: false,
                error: {
                    message: "name, email, and password are required",
                    code: "BAD_REQUEST",
                    status: 400,
                },
            });
        }

        const existing = await app.userRepo.findByEmail(email);
        if (existing)
        {
            return reply.status(409).send({
                success: false,
                error: {
                    message: `User with email '${email}' already exists`,
                    code: "CONFLICT",
                    status: 409,
                },
            });
        }

        const passwordHash = await hashPassword(password);
        const user = await app.userRepo.create({
            name,
            email,
            passwordHash,
        });

        return reply.status(201).send({
            id: user.id,
            name: user.name,
            email: user.email,
            createdAt: user.createdAt,
        });
    });

    // POST /auth/login - User login and device token issuance
    app.post("/login", async (req, reply) =>
    {
        const { email, password, deviceName } = (req.body as any) || {};

        if (!email || !password)
        {
            return reply.status(400).send({
                success: false,
                error: {
                    message: "email and password are required",
                    code: "BAD_REQUEST",
                    status: 400,
                },
            });
        }

        const user = await app.userRepo.findByEmail(email);
        if (!user || !user.passwordHash)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Invalid email or password",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        const isValid = await verifyPassword(password, user.passwordHash);
        if (!isValid)
        {
            return reply.status(401).send({
                success: false,
                error: {
                    message: "Invalid email or password",
                    code: "UNAUTHORIZED",
                    status: 401,
                },
            });
        }

        // Generate permanent device token
        const rawToken = crypto.randomBytes(32).toString("hex");
        const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");

        const device = await app.deviceRepo.registerDevice({
            userId: user.id,
            name: deviceName || "Obsidian Client",
            tokenHash,
            lastSeenAt: new Date(),
        });

        // Retrieve accessible vaults
        const vaults = await app.vaultRepo.listForUser(user.id);

        return reply.status(200).send({
            user: {
                id: user.id,
                name: user.name,
                email: user.email,
            },
            device: {
                id: device.id,
                name: device.name,
                token: rawToken,
            },
            vaults: vaults.map((v) => ({
                id: v.id,
                name: v.name,
            })),
        });
    });
}
