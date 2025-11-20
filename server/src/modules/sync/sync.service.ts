import { FileRepository, SyncStateRepository } from "../../db/repositories";

export class SyncService
{
    constructor(
        private fileRepo: FileRepository,
        private syncRepo: SyncStateRepository
    ) { }

    async diff(deviceId: string, vaultId: string, path: string, clientHash: string)
    {
        const file = await this.fileRepo.findByVaultAndPath(vaultId, path);
        if (!file) 
        {
            return { action: "push" };
        }

        const serverHash = file.hash;
        if (serverHash === clientHash)
        {
            await this.syncRepo.updateState(deviceId, file.id, serverHash);
            return { action: "noop", serverHash };
        }

        return { action: "pull", serverHash };
    }
}
