import fp from "fastify-plugin";

// Repositories & Storage
import { UserRepository } from "../db/repositories/user.repository";
import { VaultRepository } from "../db/repositories/vault.repository";
import { VaultMemberRepository } from "../db/repositories/vaultMember.repository";
import { FileRepository } from "../db/repositories/file.repository";
import { DeviceRepository } from "../db/repositories/device.repository";
import { SyncStateRepository } from "../db/repositories/syncState.repository";
import { StorageService } from "../modules/storage/storage.service";

export default fp(async function (app)
{
    // Single instances for the app
    app.decorate("userRepo", new UserRepository());
    app.decorate("vaultRepo", new VaultRepository());
    app.decorate("vaultMemberRepo", new VaultMemberRepository());
    app.decorate("fileRepo", new FileRepository());
    app.decorate("deviceRepo", new DeviceRepository());
    app.decorate("syncStateRepo", new SyncStateRepository());
    app.decorate("storageService", new StorageService());
});
