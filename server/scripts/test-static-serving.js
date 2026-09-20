const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

async function runTests()
{
    console.log("Starting static serving and SPA fallback test...");

    // 1. Create a temporary web dist directory
    const tempDistDir = path.resolve(__dirname, "../../storage/.tmp_web_dist_test");
    if (fs.existsSync(tempDistDir))
    {
        fs.rmSync(tempDistDir, { recursive: true, force: true });
    }
    fs.mkdirSync(path.join(tempDistDir, "assets"), { recursive: true });

    const htmlContent = "<!DOCTYPE html><html><head><title>Project Curie</title></head><body><div id='root'>Curie Web Client</div></body></html>";
    const cssContent = "body { margin: 0; background: #111; }";

    fs.writeFileSync(path.join(tempDistDir, "index.html"), htmlContent);
    fs.writeFileSync(path.join(tempDistDir, "assets", "style.css"), cssContent);

    // Set WEB_DIST_DIR
    process.env.WEB_DIST_DIR = tempDistDir;

    const { buildApp } = require("../dist/app");
    const app = buildApp();
    await app.ready();

    try
    {
        // 2. Test GET / serves index.html
        const resRoot = await app.inject({
            method: "GET",
            url: "/",
        });
        assert.strictEqual(resRoot.statusCode, 200);
        assert.ok(resRoot.body.includes("Curie Web Client"), "Root should serve index.html");
        assert.ok(resRoot.headers["content-type"].includes("text/html"));
        console.log("✓ GET / serves index.html");

        // 3. Test GET /assets/style.css serves static asset
        const resCss = await app.inject({
            method: "GET",
            url: "/assets/style.css",
        });
        assert.strictEqual(resCss.statusCode, 200);
        assert.ok(resCss.body.includes("background: #111"));
        assert.ok(resCss.headers["content-type"].includes("text/css"));
        console.log("✓ GET /assets/style.css serves static file");

        // 4. Test client-side routing fallback (e.g. GET /admin, GET /login, GET /vaults/some-id)
        const resSpaFallback = await app.inject({
            method: "GET",
            url: "/admin/devices",
        });
        assert.strictEqual(resSpaFallback.statusCode, 200);
        assert.ok(resSpaFallback.body.includes("Curie Web Client"), "SPA route should fallback to index.html");
        console.log("✓ SPA client route /admin/devices falls back to index.html");

        // 5. Test API 404s do not fallback to index.html
        const resApi404 = await app.inject({
            method: "GET",
            url: "/sync/unknown-endpoint",
        });
        assert.notStrictEqual(resApi404.statusCode, 200);
        assert.ok(!resApi404.body.includes("<!DOCTYPE html>"), "API endpoints must not fallback to HTML");
        console.log("✓ API routes return API errors and do not serve index.html");

        console.log("✓ Task 1.4: Fastify static serving and SPA fallback verified!");
    }
    finally
    {
        await app.close();
        if (fs.existsSync(tempDistDir))
        {
            fs.rmSync(tempDistDir, { recursive: true, force: true });
        }
        delete process.env.WEB_DIST_DIR;
    }
}

runTests().catch((err) =>
{
    console.error("Test failed:", err);
    process.exit(1);
});
