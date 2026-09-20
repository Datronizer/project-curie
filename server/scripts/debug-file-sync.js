const { db } = require("../dist/db/client");
const { files } = require("../dist/db/schema/files");
const { syncStates } = require("../dist/db/schema/syncStates");
const { devices } = require("../dist/db/schema/devices");
const { vaults } = require("../dist/db/schema/vaults");
const { eq } = require("drizzle-orm");

async function check()
{
    console.log("=== Vaults ===");
    const allVaults = await db.select().from(vaults);
    console.log(allVaults);

    console.log("=== Devices ===");
    const allDevices = await db.select().from(devices);
    console.log(allDevices);

    console.log("=== Files for AWS/Analytics.md ===");
    const matchingFiles = await db.select().from(files).where(eq(files.path, "AWS/Analytics.md"));
    console.log(matchingFiles);

    console.log("=== Sync States ===");
    const allSyncStates = await db.select().from(syncStates);
    console.log(allSyncStates);
}

check().catch(console.error).finally(() => process.exit(0));
