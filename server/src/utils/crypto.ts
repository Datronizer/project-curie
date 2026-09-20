import crypto from "node:crypto";
import { promisify } from "node:util";

const scryptAsync = promisify(crypto.scrypt);

const SALT_BYTES = 16;
const KEY_BYTES = 64;

/**
 * Hashes a plain-text password using native Node.js crypto.scrypt.
 * Returns formatted string: `<salt_hex>:<hash_hex>`.
 */
export async function hashPassword(password: string): Promise<string>
{
    const salt = crypto.randomBytes(SALT_BYTES);
    const derivedKey = (await scryptAsync(password, salt, KEY_BYTES)) as Buffer;
    return `${salt.toString("hex")}:${derivedKey.toString("hex")}`;
}

/**
 * Verifies a plain-text password against a stored `<salt_hex>:<hash_hex>` string
 * using constant-time buffer comparison.
 */
export async function verifyPassword(password: string, combinedHash: string): Promise<boolean>
{
    if (!combinedHash || !combinedHash.includes(":"))
    {
        return false;
    }

    const [saltHex, keyHex] = combinedHash.split(":");
    if (!saltHex || !keyHex)
    {
        return false;
    }

    try
    {
        const salt = Buffer.from(saltHex, "hex");
        const storedKey = Buffer.from(keyHex, "hex");

        const derivedKey = (await scryptAsync(password, salt, storedKey.length)) as Buffer;

        if (storedKey.length !== derivedKey.length)
        {
            return false;
        }

        return crypto.timingSafeEqual(storedKey, derivedKey);
    }
    catch
    {
        return false;
    }
}
