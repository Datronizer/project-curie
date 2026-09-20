const assert = require("node:assert");
const { hashPassword, verifyPassword } = require("../dist/utils/crypto");

async function runTests()
{
    console.log("Starting password hashing unit tests...");

    const password = "SuperSecretPassword123!";
    const hash = await hashPassword(password);

    console.log("Generated hash:", hash);
    assert.ok(hash.includes(":"), "Hash must contain colon separator");
    const [saltHex, keyHex] = hash.split(":");
    assert.strictEqual(saltHex.length, 32, "Salt must be 16 bytes (32 hex chars)");
    assert.strictEqual(keyHex.length, 128, "Derived key must be 64 bytes (128 hex chars)");

    // Test correct password verification
    const isValid = await verifyPassword(password, hash);
    assert.strictEqual(isValid, true, "Password verification should succeed with correct password");

    // Test incorrect password
    const isWrong = await verifyPassword("WrongPassword", hash);
    assert.strictEqual(isWrong, false, "Password verification should fail with incorrect password");

    // Test empty or corrupted hash
    assert.strictEqual(await verifyPassword(password, ""), false, "Empty hash must return false");
    assert.strictEqual(await verifyPassword(password, "invalid-hash"), false, "Malformed hash must return false");
    assert.strictEqual(await verifyPassword(password, "abcd:efgh"), false, "Corrupted key must return false");

    // Test unique salts across multiple hashes of the same password
    const hash2 = await hashPassword(password);
    assert.notStrictEqual(hash, hash2, "Subsequent hashes must have different random salts");
    assert.strictEqual(await verifyPassword(password, hash2), true, "Second hash must verify successfully");

    console.log("All crypto unit tests passed successfully!");
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
