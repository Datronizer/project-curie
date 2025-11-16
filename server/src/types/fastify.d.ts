import "fastify";

import { VaultRepository } from "../db/repositories/vault.repository";
import { FileRepository } from "../db/repositories/file.repository";
import { FileVersionRepository } from "../db/repositories/fileVersion.repository";
import { DeviceRepository } from "../db/repositories/device.repository";
import { SyncStateRepository } from "../db/repositories/syncState.repository";

declare module "fastify" {
  interface FastifyInstance {
    vaultRepo: VaultRepository;
    fileRepo: FileRepository;
    fileVersionRepo: FileVersionRepository;
    deviceRepo: DeviceRepository;
    syncStateRepo: SyncStateRepository;
  }
}
