const { db } = require("../dist/db/client");
const { files } = require("../dist/db/schema/files");
const { devices } = require("../dist/db/schema/devices");
const { SyncStateRepository } = require("../dist/db/repositories/syncState.repository");

async function main()
{
    console.log("Backfilling sync_states for registered devices...");
    const syncRepo = new SyncStateRepository();

    const allDevices = await db.select().from(devices);
    const allFiles = await db.select().from(files);

    for (const device of allDevices)
    {
        console.log(`Checking device ${device.name} (${device.id})...`);
        let added = 0;
        for (const file of allFiles)
        {
            await syncRepo.updateState(device.id, file.id, file.hash);
            added++;
        }
        console.log(`✓ Backfilled ${added} files for device ${device.name}`);
    }

    console.log("All devices backfilled successfully!");
}

main().catch(console.error).finally(() => process.exit(0));
