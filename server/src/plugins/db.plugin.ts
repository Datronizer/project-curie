import fp from "fastify-plugin";

// Repositories
import { VaultRepository } from "../db/repositories/vault.repository";
import { FileRepository } from "../db/repositories/file.repository";
import { FileVersionRepository } from "../db/repositories/fileVersion.repository";
import { DeviceRepository } from "../db/repositories/device.repository";
import { SyncStateRepository } from "../db/repositories/syncState.repository";

export default fp(async function (app) {

  // One instance of each repository for the whole app
  app.decorate("vaultRepo", new VaultRepository());
  app.decorate("fileRepo", new FileRepository());
  app.decorate("fileVersionRepo", new FileVersionRepository());
  app.decorate("deviceRepo", new DeviceRepository());
  app.decorate("syncStateRepo", new SyncStateRepository());
});
