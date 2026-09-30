import fp from "fastify-plugin";

// Repositories & Storage
import { UserRepository } from "../db/repositories/user.repository";
import { VaultRepository } from "../db/repositories/vault.repository";
import { VaultMemberRepository } from "../db/repositories/vaultMember.repository";
import { FileRepository } from "../db/repositories/file.repository";
import { DeviceRepository } from "../db/repositories/device.repository";
import { SyncStateRepository } from "../db/repositories/syncState.repository";
import { StorageService } from "../modules/storage/storage.service";
import { IngestionJobRepository } from "../db/repositories/ingestionJob.repository";
import { IngestService } from "../modules/ingest/ingest.service";
import { IngestionQueueWorker } from "../modules/ingest/ingest.worker";

export default fp(async function (app)
{
    // Single instances for the app
    const userRepo = new UserRepository();
    const vaultRepo = new VaultRepository();
    const vaultMemberRepo = new VaultMemberRepository();
    const fileRepo = new FileRepository();
    const deviceRepo = new DeviceRepository();
    const syncStateRepo = new SyncStateRepository();
    const storageService = new StorageService();
    const ingestionJobRepo = new IngestionJobRepository();

    const ingestService = new IngestService(ingestionJobRepo, fileRepo, storageService);
    const ingestWorker = new IngestionQueueWorker(ingestService);
    ingestService.setWorker(ingestWorker);

    app.decorate("userRepo", userRepo);
    app.decorate("vaultRepo", vaultRepo);
    app.decorate("vaultMemberRepo", vaultMemberRepo);
    app.decorate("fileRepo", fileRepo);
    app.decorate("deviceRepo", deviceRepo);
    app.decorate("syncStateRepo", syncStateRepo);
    app.decorate("storageService", storageService);
    app.decorate("ingestionJobRepo", ingestionJobRepo);
    app.decorate("ingestService", ingestService);
    app.decorate("ingestWorker", ingestWorker);

    // Start background queue worker
    ingestWorker.start();

    app.addHook("onClose", async () =>
    {
        ingestWorker.stop();
    });
});

