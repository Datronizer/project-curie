const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { buildApp } = require("../dist/app");

async function runTests()
{
    console.log("Starting full E2E web client and production server test...");

    // Point WEB_DIST_DIR to the actual web/dist build
    const webDistPath = path.resolve(__dirname, "../../web/dist");
    assert.ok(fs.existsSync(webDistPath), "web/dist must exist before running E2E test");
    process.env.WEB_DIST_DIR = webDistPath;

    const app = buildApp();
    await app.ready();

    try
    {
        // 1. Verify production web client assets are served
        const resRoot = await app.inject({ method: "GET", url: "/" });
        assert.strictEqual(resRoot.statusCode, 200);
        assert.ok(resRoot.body.includes("<div id=\"root\"></div>"));
        assert.ok(resRoot.body.includes("Project Curie"));
        console.log("✓ Production web client index.html served at root /");

        // 2. Verify SPA fallback routing
        const resSpa = await app.inject({ method: "GET", url: "/admin" });
        assert.strictEqual(resSpa.statusCode, 200);
        assert.ok(resSpa.body.includes("<div id=\"root\"></div>"));
        console.log("✓ SPA route /admin successfully served via index.html fallback");

        // 3. User provisioning
        const email = `web_e2e_${Date.now()}@example.com`;
        const resUser = await app.inject({
            method: "POST",
            url: "/auth/users",
            headers: {
                "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
            },
            payload: {
                name: "Web E2E User",
                email,
                password: "Password123!",
            },
        });
        assert.strictEqual(resUser.statusCode, 201);
        const user = JSON.parse(resUser.body);
        console.log("✓ User created:", user.email);

        // 4. Web client login
        const resLogin = await app.inject({
            method: "POST",
            url: "/auth/login",
            payload: {
                email,
                password: "Password123!",
                deviceName: "Web Client Chrome",
            },
        });
        assert.strictEqual(resLogin.statusCode, 200);
        const loginData = JSON.parse(resLogin.body);
        const token = loginData.device.token;
        const deviceId = loginData.device.id;
        assert.ok(token);
        console.log("✓ Web client authenticated, device:", loginData.device.name);

        // 5. Create Vault
        const vaultName = `E2E Vault ${Date.now()}`;
        const resVault = await app.inject({
            method: "POST",
            url: "/vaults",
            headers: { authorization: `Bearer ${token}` },
            payload: { name: vaultName },
        });
        assert.strictEqual(resVault.statusCode, 201);
        const vault = JSON.parse(resVault.body);
        console.log("✓ Vault created:", vault.name);

        // 6. Create note with wikilink
        const noteContent = "# Today's Notes\n\nSee [[Architecture Roadmap]] for details.\n- [x] Phase 1 complete\n- [ ] Phase 2 in progress";
        const resNote = await app.inject({
            method: "PUT",
            url: `/vaults/${vault.id}/content?path=Today.md`,
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "text/markdown",
            },
            payload: noteContent,
        });
        assert.strictEqual(resNote.statusCode, 200);
        console.log("✓ Markdown note with [[wikilinks]] saved");

        // 7. Verify tree endpoint
        const resTree = await app.inject({
            method: "GET",
            url: `/vaults/${vault.id}/tree`,
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(resTree.statusCode, 200);
        const tree = JSON.parse(resTree.body);
        assert.strictEqual(tree.length, 1);
        assert.strictEqual(tree[0].name, "Today.md");
        console.log("✓ Vault directory tree verified with 1 note");

        // 8. Simulate conflict note creation
        const conflictFileName = "Today (Conflict from Mobile 2026-09-20T21-00-00).md";
        const resConflict = await app.inject({
            method: "PUT",
            url: `/vaults/${vault.id}/content?path=${encodeURIComponent(conflictFileName)}`,
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "text/markdown",
            },
            payload: "# Conflicted version from mobile",
        });
        assert.strictEqual(resConflict.statusCode, 200);

        const resTreeWithConflict = await app.inject({
            method: "GET",
            url: `/vaults/${vault.id}/tree`,
            headers: { authorization: `Bearer ${token}` },
        });
        const treeWithConflict = JSON.parse(resTreeWithConflict.body);
        assert.strictEqual(treeWithConflict.length, 2);
        console.log("✓ Conflict file created and discovered in tree");

        // 9. Conflict resolution: delete conflict copy
        const resDelete = await app.inject({
            method: "DELETE",
            url: `/vaults/${vault.id}/content?path=${encodeURIComponent(conflictFileName)}`,
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(resDelete.statusCode, 200);

        const resTreeAfterResolve = await app.inject({
            method: "GET",
            url: `/vaults/${vault.id}/tree`,
            headers: { authorization: `Bearer ${token}` },
        });
        const treeAfterResolve = JSON.parse(resTreeAfterResolve.body);
        assert.strictEqual(treeAfterResolve.length, 1);
        console.log("✓ Conflict resolved: conflict copy removed, primary retained");

        // 10. Device inventory and revocation
        const resDevices = await app.inject({
            method: "GET",
            url: "/devices",
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(resDevices.statusCode, 200);
        const devices = JSON.parse(resDevices.body);
        assert.ok(devices.some((d) => d.id === deviceId));
        console.log("✓ Connected device inventory verified");

        const resRevoke = await app.inject({
            method: "DELETE",
            url: `/devices/${deviceId}`,
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(resRevoke.statusCode, 200);

        const resCheckRevoked = await app.inject({
            method: "GET",
            url: "/devices",
            headers: { authorization: `Bearer ${token}` },
        });
        assert.strictEqual(resCheckRevoked.statusCode, 401);
        console.log("✓ Device revoked and subsequent API access rejected with 401");

        console.log("==========================================");
        console.log("✓ FULL E2E WEB CLIENT TEST PASSED!");
        console.log("==========================================");
    }
    finally
    {
        await app.close();
        delete process.env.WEB_DIST_DIR;
    }
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
