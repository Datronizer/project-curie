require("dotenv").config({ path: ".env.dev" });
const { buildApp } = require("../dist/app");

async function run()
{
    const app = buildApp();
    await app.ready();
    console.log("App ready!");

    // 1. Health check
    const r1 = await app.inject({ method: "GET", url: "/health" });
    console.log("Health:", r1.statusCode, r1.json());
    if (r1.statusCode !== 200) throw new Error("Health check failed");

    // 2. Register device without setup key
    const r2 = await app.inject({ method: "POST", url: "/devices/register", payload: { name: "Test" } });
    console.log("Register without key:", r2.statusCode);
    if (r2.statusCode !== 401) throw new Error("Expected 401 for register without key");

    // 3. Register device with setup key
    const r3 = await app.inject({
        method: "POST",
        url: "/devices/register",
        headers: { "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret" },
        payload: { name: "Test Device", email: "test@curie.local" }
    });
    console.log("Register with key:", r3.statusCode, r3.json());
    if (r3.statusCode !== 201) throw new Error("Register with key failed");
    const { id: deviceId, token } = r3.json();

    // 4. Get vaults without auth
    const r4 = await app.inject({ method: "GET", url: "/vaults" });
    console.log("Vaults without auth:", r4.statusCode);
    if (r4.statusCode !== 401) throw new Error("Expected 401 for vaults without auth");

    // 5. Get vaults with auth
    const r5 = await app.inject({
        method: "GET",
        url: "/vaults",
        headers: { authorization: `Bearer ${token}` }
    });
    console.log("Vaults with auth:", r5.statusCode, r5.json());
    if (r5.statusCode !== 200) throw new Error("Get vaults with auth failed");

    // 6. Create vault
    const r6 = await app.inject({
        method: "POST",
        url: "/vaults",
        headers: { authorization: `Bearer ${token}` },
        payload: { name: "Test Vault" }
    });
    console.log("Create vault:", r6.statusCode, r6.json());
    if (r6.statusCode !== 201) throw new Error("Create vault failed");
    const vaultId = r6.json().id;

    // 7. Stream upload note
    const content = "# Hello World from Curie!";
    const r7 = await app.inject({
        method: "PUT",
        url: `/vaults/${vaultId}/content?path=notes/welcome.md`,
        headers: {
            authorization: `Bearer ${token}`,
            "content-type": "text/markdown"
        },
        payload: content
    });
    console.log("Upload content:", r7.statusCode, r7.json());
    if (r7.statusCode !== 200) throw new Error("Upload content failed");
    const fileHash = r7.json().hash;

    // 8. Stream download note
    const r8 = await app.inject({
        method: "GET",
        url: `/vaults/${vaultId}/content?path=notes/welcome.md`,
        headers: { authorization: `Bearer ${token}` }
    });
    console.log("Download content:", r8.statusCode, r8.headers["x-curie-hash"], r8.body);
    if (r8.statusCode !== 200 || r8.body !== content) throw new Error("Download content failed");

    // 9. Sync diff
    const r9 = await app.inject({
        method: "POST",
        url: "/sync/diff",
        headers: { authorization: `Bearer ${token}` },
        payload: {
            deviceId,
            vaultId,
            path: "notes/welcome.md",
            clientHash: fileHash
        }
    });
    console.log("Sync diff:", r9.statusCode, r9.json());
    if (r9.statusCode !== 200 || r9.json().action !== "noop") throw new Error("Sync diff failed");

    // 10. Heartbeat
    const r10 = await app.inject({
        method: "POST",
        url: "/devices/heartbeat",
        headers: { authorization: `Bearer ${token}` },
        payload: { deviceId }
    });
    console.log("Heartbeat:", r10.statusCode, r10.json().name);
    if (r10.statusCode !== 200) throw new Error("Heartbeat failed");

    console.log("ALL INTEGRATION TESTS PASSED!");
    await app.close();
}

run().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
