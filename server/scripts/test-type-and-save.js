const assert = require("node:assert");
const crypto = require("node:crypto");
const { buildApp } = require("../dist/app");

async function testTypeAndSave()
{
    console.log("=== Testing Typing and Saving Scenario ===");
    const app = buildApp();
    await app.ready();

    // 1. Log in
    const resLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: "wife_user_1789935844252@curie.local",
            password: "StrongPassword!_1789935844252",
            deviceName: "Type Test Device",
        },
    });
    assert.strictEqual(resLogin.statusCode, 200);
    const { device, vaults } = JSON.parse(resLogin.body);
    const token = device.token;
    const deviceId = device.id;
    const vaultId = vaults[0].id;

    // 2. Initial file creation on server
    const testPath = "Notes/TypingTest.md";
    const v1Content = "Initial content of note";
    const v1Hash = crypto.createHash("sha256").update(v1Content).digest("hex");

    console.log("[1] Uploading initial note version...");
    const resUpload1 = await app.inject({
        method: "PUT",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(testPath)}`,
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "text/markdown",
        },
        payload: v1Content,
    });
    assert.strictEqual(resUpload1.statusCode, 200);

    // 3. User types in Obsidian (v2Content)
    console.log("[2] User types in Obsidian...");
    const v2Content = "Initial content of note + user typed new text!";
    const v2Hash = crypto.createHash("sha256").update(v2Content).digest("hex");

    // Client queries diff
    const resDiff = await app.inject({
        method: "POST",
        url: "/sync/diff",
        headers: {
            authorization: `Bearer ${token}`,
        },
        payload: {
            deviceId,
            vaultId,
            path: testPath,
            clientHash: v2Hash,
        },
    });
    assert.strictEqual(resDiff.statusCode, 200);
    const diffResult = JSON.parse(resDiff.body);

    console.log(`Diff result action: ${diffResult.action}`);
    assert.strictEqual(diffResult.action, "push", "Diff MUST be 'push' when user edits local note!");

    // 4. Client pushes new version
    console.log("[3] Pushing edited note...");
    const resUpload2 = await app.inject({
        method: "PUT",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(testPath)}`,
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "text/markdown",
        },
        payload: v2Content,
    });
    assert.strictEqual(resUpload2.statusCode, 200);

    // 5. Subsequent diff check should be noop
    const resDiffAfter = await app.inject({
        method: "POST",
        url: "/sync/diff",
        headers: {
            authorization: `Bearer ${token}`,
        },
        payload: {
            deviceId,
            vaultId,
            path: testPath,
            clientHash: v2Hash,
        },
    });
    assert.strictEqual(resDiffAfter.statusCode, 200);
    const diffAfterResult = JSON.parse(resDiffAfter.body);
    console.log(`Diff after push action: ${diffAfterResult.action}`);
    assert.strictEqual(diffAfterResult.action, "noop");

    console.log("✓ Typing and saving test passed 100%!");
    await app.close();
}

testTypeAndSave().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
