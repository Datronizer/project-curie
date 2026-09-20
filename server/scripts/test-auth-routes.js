const assert = require("node:assert");
const { buildApp } = require("../dist/app");

async function runTests()
{
    console.log("Starting auth routes tests...");
    const app = buildApp();
    await app.ready();

    const testEmail = `testuser_${Date.now()}@example.com`;
    const testPassword = "MySecurePassword456!";
    const testName = "Test User";

    // 1. Test POST /auth/users without setup key (should fail 401)
    const resNoKey = await app.inject({
        method: "POST",
        url: "/auth/users",
        payload: {
            name: testName,
            email: testEmail,
            password: testPassword,
        },
    });
    assert.strictEqual(resNoKey.statusCode, 401, "Expected 401 without x-setup-key");

    // 2. Test POST /auth/users with valid setup key (should succeed 201)
    const resCreate = await app.inject({
        method: "POST",
        url: "/auth/users",
        headers: {
            "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
        },
        payload: {
            name: testName,
            email: testEmail,
            password: testPassword,
        },
    });
    assert.strictEqual(resCreate.statusCode, 201, `Expected 201, got ${resCreate.statusCode}: ${resCreate.body}`);
    const createdUser = JSON.parse(resCreate.body);
    assert.strictEqual(createdUser.email, testEmail);
    assert.strictEqual(createdUser.name, testName);
    assert.strictEqual(createdUser.passwordHash, undefined, "Password hash must not be exposed");

    // 3. Test duplicate user creation (should fail 409)
    const resDuplicate = await app.inject({
        method: "POST",
        url: "/auth/users",
        headers: {
            "x-setup-key": process.env.CURIE_SETUP_KEY || "curie-dev-master-key-secret",
        },
        payload: {
            name: testName,
            email: testEmail,
            password: testPassword,
        },
    });
    assert.strictEqual(resDuplicate.statusCode, 409, "Expected 409 for duplicate email");

    // 4. Test POST /auth/login with wrong password (should fail 401)
    const resWrongPass = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: testEmail,
            password: "WrongPassword!",
            deviceName: "Test Laptop",
        },
    });
    assert.strictEqual(resWrongPass.statusCode, 401, "Expected 401 for wrong password");

    // 5. Test POST /auth/login with valid credentials (should succeed 200)
    const resLogin = await app.inject({
        method: "POST",
        url: "/auth/login",
        payload: {
            email: testEmail,
            password: testPassword,
            deviceName: "Test Laptop",
        },
    });
    assert.strictEqual(resLogin.statusCode, 200, `Expected 200, got ${resLogin.statusCode}: ${resLogin.body}`);
    const loginData = JSON.parse(resLogin.body);
    assert.strictEqual(loginData.user.email, testEmail);
    assert.ok(loginData.device.token, "Device token must be present");
    assert.ok(loginData.device.id, "Device ID must be present");
    assert.ok(Array.isArray(loginData.vaults), "Vaults array must be present");

    console.log("Auth routes test passed successfully!");
    await app.close();
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
