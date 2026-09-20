require("dotenv").config({ path: ".env.dev" });
const fs = require("node:fs");
const path = require("node:path");
const { buildApp } = require("../dist/app");

async function main()
{
    console.log("=== STARTING END-TO-END VERIFICATION ===");
    const app = buildApp();
    await app.ready();

    // 1. Register device
    const regRes = await app.inject({
        method: "POST",
        url: "/devices/register",
        headers: { "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret" },
        payload: { name: "E2E Test Device", email: "e2e@curie.local" },
    });
    if (regRes.statusCode !== 201)
    {
        throw new Error(`Device registration failed: ${regRes.body}`);
    }
    const { id: deviceId, token } = regRes.json();
    console.log("✓ Device registered:", deviceId);

    // 2. Create vault
    const vaultRes = await app.inject({
        method: "POST",
        url: "/vaults",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "E2E Verification Vault" },
    });
    if (vaultRes.statusCode !== 201)
    {
        throw new Error(`Vault creation failed: ${vaultRes.body}`);
    }
    const vaultId = vaultRes.json().id;
    console.log("✓ Vault created:", vaultId);

    // 3. Upload sample note (Task 6.1)
    const initialContent = "# Marie Curie Notes\n\nRadioactivity research notes.";
    const relativePath = "research/curie-notes.md";
    const uploadRes = await app.inject({
        method: "PUT",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(relativePath)}`,
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "text/markdown",
        },
        payload: initialContent,
    });
    if (uploadRes.statusCode !== 200)
    {
        throw new Error(`Upload failed: ${uploadRes.body}`);
    }
    const initialHash = uploadRes.json().hash;
    console.log("✓ Initial note uploaded, hash:", initialHash);

    // Verify file exists on disk
    const diskPath = path.resolve("./storage/vaults", vaultId, relativePath);
    if (!fs.existsSync(diskPath))
    {
        throw new Error(`Expected file to exist on disk at ${diskPath}`);
    }
    const diskContent = fs.readFileSync(diskPath, "utf8");
    if (diskContent !== initialContent)
    {
        throw new Error(`Content mismatch on disk! Expected '${initialContent}', got '${diskContent}'`);
    }
    console.log("✓ Task 6.1 Verified: Note exists on disk at", diskPath);

    // 4. Simulate concurrent conflict (Task 6.2)
    const conflictContent = "# Marie Curie Notes (Modified on iPad)\n\nPolonium discoveries.";
    const conflictRes = await app.inject({
        method: "PUT",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(relativePath)}&conflict=true`,
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "text/markdown",
        },
        payload: conflictContent,
    });
    if (conflictRes.statusCode !== 200)
    {
        throw new Error(`Conflict upload failed: ${conflictRes.body}`);
    }
    const conflictResult = conflictRes.json();
    console.log("✓ Conflict upload returned:", conflictResult);

    if (!conflictResult.conflictCopyPath)
    {
        throw new Error("Expected conflictCopyPath to be generated!");
    }

    const conflictDiskPath = path.resolve("./storage/vaults", vaultId, conflictResult.conflictCopyPath);
    if (!fs.existsSync(conflictDiskPath))
    {
        throw new Error(`Conflict copy file not found on disk at ${conflictDiskPath}`);
    }
    const conflictCopyContent = fs.readFileSync(conflictDiskPath, "utf8");
    if (conflictCopyContent !== initialContent)
    {
        throw new Error(`Conflict copy content mismatch! Got: ${conflictCopyContent}`);
    }
    console.log("✓ Task 6.2 Verified: Side-by-side conflict copy preserved at", conflictDiskPath);

    // 5. Test bidirectional sync & pull (Task 6.3)
    const diffRes = await app.inject({
        method: "POST",
        url: "/sync/diff",
        headers: { authorization: `Bearer ${token}` },
        payload: {
            deviceId,
            vaultId,
            path: relativePath,
            clientHash: "old-stale-hash-123",
        },
    });
    if (diffRes.statusCode !== 200)
    {
        throw new Error(`Diff request failed: ${diffRes.body}`);
    }
    const diffAction = diffRes.json().action;
    if (diffAction !== "pull")
    {
        throw new Error(`Expected action 'pull', got '${diffAction}'`);
    }
    console.log("✓ Diff reports action: pull");

    const pullRes = await app.inject({
        method: "GET",
        url: `/vaults/${vaultId}/content?path=${encodeURIComponent(relativePath)}`,
        headers: { authorization: `Bearer ${token}` },
    });
    if (pullRes.statusCode !== 200 || pullRes.body !== conflictContent)
    {
        throw new Error("Pull failed to retrieve updated remote content");
    }
    console.log("✓ Task 6.3 Verified: Client pull downloads remote content cleanly!");

    console.log("\n=== ALL END-TO-END VERIFICATIONS PASSED SUCCESSFULLY! ===");
    await app.close();
}

main().catch((err) =>
{
    console.error("Verification failed:", err);
    process.exit(1);
});
