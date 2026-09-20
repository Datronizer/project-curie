import "fastify";

import { UserRepository } from "../db/repositories/user.repository";
import { VaultRepository } from "../db/repositories/vault.repository";
import { VaultMemberRepository } from "../db/repositories/vaultMember.repository";
import { FileRepository } from "../db/repositories/file.repository";
import { DeviceRepository } from "../db/repositories/device.repository";
import { SyncStateRepository } from "../db/repositories/syncState.repository";
import { StorageService } from "../modules/storage/storage.service";
import { Device, User } from "../db/types";

declare module "fastify" {
    interface FastifyInstance {
        userRepo: UserRepository;
        vaultRepo: VaultRepository;
        vaultMemberRepo: VaultMemberRepository;
        fileRepo: FileRepository;
        deviceRepo: DeviceRepository;
        syncStateRepo: SyncStateRepository;
        storageService: StorageService;
    }

    interface FastifyRequest {
        authenticatedDevice?: Device;
        authenticatedUser?: User;
    }
}
