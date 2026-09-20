const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { buildApp } = require("../dist/app");

async function runTests()
{
    console.log("Starting vault creation test...");
    const app = buildApp();
    await app.ready();

    // 1. Create a user via /auth/users
    const userEmail = `vault_user_${Date.now()}@example.com`;
    const resUser = await app.inject({
        method: "POST",
        url: "/auth/users",
        headers: {
            "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
        },
        payload: {
            name: "Vault Test User",
            email: userEmail,
            password: "Password123!",
        },
    });
    assert.strictEqual(resUser.statusCode, 201);
    const user = JSON.parse(resUser.body);

    // 2. Log in via /auth/login
    const resLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: userEmail,
            password: "Password123!",
            deviceName: "Vault Creation Test Device",
        },
    });
    assert.strictEqual(resLogin.statusCode, 200);
    const loginData = JSON.parse(resLogin.body);
    const deviceToken = loginData.device.token;
    assert.ok(deviceToken);

    // 3. Create a vault via POST /vaults
    const vaultName = `Test Vault ${Date.now()}`;
    const resVault = await app.inject({
        method: "POST",
        url: "/vaults",
        headers: {
            authorization: `Bearer ${deviceToken}`,
        },
        payload: {
            name: vaultName,
        },
    });
    assert.strictEqual(resVault.statusCode, 201, `Expected 201, got ${resVault.statusCode}: ${resVault.body}`);
    const vault = JSON.parse(resVault.body);
    assert.strictEqual(vault.name, vaultName);
    assert.strictEqual(vault.ownerId, user.id);

    // 4. Verify directory exists
    const storageDir = process.env.STORAGE_DIR || "./storage";
    const vaultDir = path.resolve(storageDir, "vaults", vault.id);
    assert.ok(fs.existsSync(vaultDir), `Vault directory must exist at ${vaultDir}`);

    // 5. Verify vault shows up in /vaults list for this user
    const resList = await app.inject({
        method: "GET",
        url: "/vaults",
        headers: {
            authorization: `Bearer ${deviceToken}`,
        },
    });
    assert.strictEqual(resList.statusCode, 200);
    const vaults = JSON.parse(resList.body);
    assert.ok(vaults.some((v) => v.id === vault.id), "Created vault must appear in user's vault list");

    console.log("Vault creation test passed successfully!");
    await app.close();
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
