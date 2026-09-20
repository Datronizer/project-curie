const assert = require("node:assert");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const { buildApp } = require("../dist/app");

async function runE2ETest()
{
    console.log("=== Starting Curie E2E Onboarding & Sync Test ===");

    const app = buildApp();
    await app.ready();

    // 1. Admin provisions user
    const timestamp = Date.now();
    const userEmail = `wife_user_${timestamp}@curie.local`;
    const userPassword = `StrongPassword!_${timestamp}`;
    const userName = "Sienna Wife";

    console.log(`[1] Provisioning user ${userEmail}...`);
    const resUser = await app.inject({
        method: "POST",
        url: "/auth/users",
        headers: {
            "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
        },
        payload: {
            name: userName,
            email: userEmail,
            password: userPassword,
        },
    });
    assert.strictEqual(resUser.statusCode, 201, `Failed to provision user: ${resUser.body}`);
    const user = JSON.parse(resUser.body);
    assert.strictEqual(user.email, userEmail);
    console.log(`✓ User created with ID: ${user.id}`);

    // 2. User logs in from Obsidian client
    console.log(`[2] Logging in user via /auth/login...`);
    const resLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: userEmail,
            password: userPassword,
            deviceName: "Sienna's MacBook - Obsidian",
        },
    });
    assert.strictEqual(resLogin.statusCode, 200, `Login failed: ${resLogin.body}`);
    const loginData = JSON.parse(resLogin.body);
    const token = loginData.device.token;
    const deviceId = loginData.device.id;
    assert.ok(token, "Device token must be returned");
    assert.ok(deviceId, "Device ID must be returned");
    assert.strictEqual(loginData.user.id, user.id);
    console.log(`✓ Login successful! Issued device token for device: ${deviceId}`);

    // 3. Vault Auto-Registration ("Add vault to Curie")
    const vaultName = `Sheridan Personal Vault ${timestamp}`;
    console.log(`[3] Creating new vault "${vaultName}"...`);
    const resVault = await app.inject({
        method: "POST",
        url: "/vaults",
        headers: {
            authorization: `Bearer ${token}`,
        },
        payload: {
            name: vaultName,
        },
    });
    assert.strictEqual(resVault.statusCode, 201, `Failed to create vault: ${resVault.body}`);
    const vault = JSON.parse(resVault.body);
    assert.strictEqual(vault.name, vaultName);
    const vaultId = vault.id;
    console.log(`✓ Vault registered with ID: ${vaultId}`);

    // 4. Initial File Push (Simulate Obsidian file sync)
    const notePath = "Personal/Family Tree.md";
    const noteContent = `# Family Tree\n\nCreated on ${new Date().toISOString()}\nNotes for our shared family history.`;
    const noteHash = crypto.createHash("sha256").update(noteContent).digest("hex");

    console.log(`[4] Pushing note "${notePath}" to server...`);
    const resPush = await app.inject({
        method: "PUT",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(notePath)}`,
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "text/markdown",
        },
        payload: noteContent,
    });
    assert.strictEqual(resPush.statusCode, 200, `File push failed: ${resPush.body}`);
    const pushResult = JSON.parse(resPush.body);
    assert.strictEqual(pushResult.hash, noteHash);
    console.log(`✓ File pushed with hash: ${pushResult.hash} (${pushResult.size} bytes)`);

    // 5. Query Diff Endpoint
    console.log(`[5] Verifying diff action...`);
    const resDiff = await app.inject({
        method: "POST",
        url: "/sync/diff",
        headers: {
            authorization: `Bearer ${token}`,
        },
        payload: {
            deviceId,
            vaultId,
            path: notePath,
            clientHash: noteHash,
        },
    });
    assert.strictEqual(resDiff.statusCode, 200, `Diff check failed: ${resDiff.body}`);
    const diffResult = JSON.parse(resDiff.body);
    assert.strictEqual(diffResult.action, "noop", "Synced file should result in noop diff");
    console.log(`✓ Server diff returned action: ${diffResult.action}`);

    // 6. Pull File Content (Simulate download)
    console.log(`[6] Pulling file content from server...`);
    const resPull = await app.inject({
        method: "GET",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(notePath)}`,
        headers: {
            authorization: `Bearer ${token}`,
        },
    });
    assert.strictEqual(resPull.statusCode, 200, `File download failed: ${resPull.body}`);
    assert.strictEqual(resPull.body, noteContent, "Downloaded content must match uploaded content");
    assert.strictEqual(resPull.headers["x-curie-hash"], noteHash);
    console.log(`✓ File content verified identical to original payload`);

    // 7. Device Heartbeat
    console.log(`[7] Sending device heartbeat...`);
    const resHeartbeat = await app.inject({
        method: "POST",
        url: "/devices/heartbeat",
        headers: {
            authorization: `Bearer ${token}`,
        },
        payload: {
            deviceId,
        },
    });
    assert.strictEqual(resHeartbeat.statusCode, 200, `Heartbeat failed: ${resHeartbeat.body}`);
    const heartbeatData = JSON.parse(resHeartbeat.body);
    assert.strictEqual(heartbeatData.id, deviceId);
    assert.ok(heartbeatData.lastSeenAt);
    console.log(`✓ Heartbeat registered at: ${heartbeatData.lastSeenAt}`);

    console.log("\n=======================================================");
    console.log("🎉 All E2E Onboarding & Sync Scenarios Passed Successfully!");
    console.log("=======================================================\n");

    await app.close();
}

runE2ETest().catch((err) =>
{
    console.error("E2E Test Failed:", err);
    process.exit(1);
});
