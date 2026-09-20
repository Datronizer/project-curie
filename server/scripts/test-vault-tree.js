const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");
const { buildApp } = require("../dist/app");

async function runTests()
{
    console.log("Starting vault directory tree test...");
    const app = buildApp();
    await app.ready();

    // 1. Create a user
    const userEmail = `tree_user_${Date.now()}@example.com`;
    const resUser = await app.inject({
        method: "POST",
        url: "/auth/users",
        headers: {
            "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
        },
        payload: {
            name: "Tree Test User",
            email: userEmail,
            password: "Password123!",
        },
    });
    assert.strictEqual(resUser.statusCode, 201);
    const user = JSON.parse(resUser.body);

    // 2. Log in
    const resLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: userEmail,
            password: "Password123!",
            deviceName: "Tree Test Device",
        },
    });
    assert.strictEqual(resLogin.statusCode, 200);
    const loginData = JSON.parse(resLogin.body);
    const token = loginData.device.token;

    // 3. Create vault
    const resVault = await app.inject({
        method: "POST",
        url: "/vaults",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: `Tree Vault ${Date.now()}` },
    });
    assert.strictEqual(resVault.statusCode, 201);
    const vault = JSON.parse(resVault.body);

    // 4. Upload several files and nested files
    const filesToCreate = [
        { path: "RootNote.md", content: "# Root Note Content" },
        { path: "Docs/Guide.md", content: "# Guide Note" },
        { path: "Docs/Advanced/Deep.md", content: "# Deep Note" },
        { path: "Images/diagram.png", content: "fake-image-bytes" },
    ];

    for (const f of filesToCreate)
    {
        const resUpload = await app.inject({
            method: "PUT",
            url: `/vaults/${vault.id}/content?path=${encodeURIComponent(f.path)}`,
            headers: {
                authorization: `Bearer ${token}`,
                "content-type": "text/markdown",
            },
            payload: f.content,
        });
        assert.strictEqual(resUpload.statusCode, 200, `Failed to upload ${f.path}: ${resUpload.body}`);
    }

    // 5. Query GET /vaults/:id/tree
    const resTree = await app.inject({
        method: "GET",
        url: `/vaults/${vault.id}/tree`,
        headers: { authorization: `Bearer ${token}` },
    });
    assert.strictEqual(resTree.statusCode, 200, `Expected 200, got ${resTree.statusCode}: ${resTree.body}`);

    const tree = JSON.parse(resTree.body);
    console.log("Tree output:", JSON.stringify(tree, null, 2));

    // Assert top-level items: Docs (dir), Images (dir), RootNote.md (file)
    assert.ok(Array.isArray(tree));
    assert.strictEqual(tree.length, 3);

    const docsDir = tree.find((n) => n.name === "Docs");
    const imagesDir = tree.find((n) => n.name === "Images");
    const rootNote = tree.find((n) => n.name === "RootNote.md");

    assert.ok(docsDir && docsDir.type === "dir");
    assert.ok(imagesDir && imagesDir.type === "dir");
    assert.ok(rootNote && rootNote.type === "file");

    // Check nested items inside Docs
    assert.strictEqual(docsDir.children.length, 2);
    const advancedDir = docsDir.children.find((n) => n.name === "Advanced");
    const guideNote = docsDir.children.find((n) => n.name === "Guide.md");
    assert.ok(advancedDir && advancedDir.type === "dir");
    assert.ok(guideNote && guideNote.type === "file");

    // Check nested items inside Docs/Advanced
    assert.strictEqual(advancedDir.children.length, 1);
    assert.strictEqual(advancedDir.children[0].name, "Deep.md");
    assert.strictEqual(advancedDir.children[0].path, "Docs/Advanced/Deep.md");

    console.log("✓ Vault tree test passed!");
    await app.close();
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
