const assert = require("node:assert");
const { buildApp } = require("../dist/app");

async function runTests()
{
    console.log("Starting device listing and revocation test...");
    const app = buildApp();
    await app.ready();

    // 1. Create a primary user
    const userEmail = `device_user_${Date.now()}@example.com`;
    const resUser = await app.inject({
        method: "POST",
        url: "/auth/users",
        headers: {
            "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
        },
        payload: {
            name: "Device Test User",
            email: userEmail,
            password: "Password123!",
        },
    });
    assert.strictEqual(resUser.statusCode, 201);
    const user = JSON.parse(resUser.body);

    // 2. Log in with Device A (Obsidian Desktop)
    const resLoginA = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: userEmail,
            password: "Password123!",
            deviceName: "Device A - Desktop",
        },
    });
    assert.strictEqual(resLoginA.statusCode, 200);
    const dataA = JSON.parse(resLoginA.body);
    const deviceA = dataA.device;
    const tokenA = deviceA.token;

    // 3. Log in with Device B (Mobile Phone)
    const resLoginB = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: userEmail,
            password: "Password123!",
            deviceName: "Device B - Mobile",
        },
    });
    assert.strictEqual(resLoginB.statusCode, 200);
    const dataB = JSON.parse(resLoginB.body);
    const deviceB = dataB.device;
    const tokenB = deviceB.token;

    // 4. Test GET /devices with token A (Task 1.2)
    const resList = await app.inject({
        method: "GET",
        url: "/devices",
        headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(resList.statusCode, 200);
    const devicesList = JSON.parse(resList.body);
    console.log("Devices list:", devicesList);

    assert.strictEqual(devicesList.length, 2);
    const foundA = devicesList.find((d) => d.id === deviceA.id);
    const foundB = devicesList.find((d) => d.id === deviceB.id);
    assert.ok(foundA, "Device A not found in devices list");
    assert.ok(foundB, "Device B not found in devices list");
    assert.strictEqual(foundA.name, "Device A - Desktop");
    assert.strictEqual(foundB.name, "Device B - Mobile");
    assert.strictEqual(foundA.tokenHash, undefined, "tokenHash must not be leaked");
    assert.ok(foundA.createdAt);
    assert.ok(foundA.lastSeenAt);
    console.log("✓ Task 1.2: GET /devices listing verified!");

    // 5. Verify Device B can currently access authenticated endpoints
    const resBCheck = await app.inject({
        method: "GET",
        url: "/devices",
        headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(resBCheck.statusCode, 200);

    // 6. Test DELETE /devices/:deviceId (revoke Device B using Device A) (Task 1.3)
    const resRevoke = await app.inject({
        method: "DELETE",
        url: `/devices/${deviceB.id}`,
        headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(resRevoke.statusCode, 200);
    const revokeData = JSON.parse(resRevoke.body);
    assert.strictEqual(revokeData.success, true);

    // 7. Verify GET /devices now only shows Device A
    const resListAfter = await app.inject({
        method: "GET",
        url: "/devices",
        headers: { authorization: `Bearer ${tokenA}` },
    });
    assert.strictEqual(resListAfter.statusCode, 200);
    const devicesAfter = JSON.parse(resListAfter.body);
    assert.strictEqual(devicesAfter.length, 1);
    assert.strictEqual(devicesAfter[0].id, deviceA.id);

    // 8. Verify Device B's old token now receives HTTP 401 Unauthorized
    const resRevokedAccess = await app.inject({
        method: "GET",
        url: "/devices",
        headers: { authorization: `Bearer ${tokenB}` },
    });
    assert.strictEqual(resRevokedAccess.statusCode, 401, `Expected 401 for revoked device, got ${resRevokedAccess.statusCode}`);
    const errBody = JSON.parse(resRevokedAccess.body);
    assert.strictEqual(errBody.error.code, "UNAUTHORIZED");
    console.log("✓ Task 1.3: DELETE /devices/:id and HTTP 401 on revoked token verified!");

    await app.close();
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
