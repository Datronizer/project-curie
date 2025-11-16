import { FileRepository, SyncStateRepository } from "../../db/repositories";

export class SyncService
{
    constructor(
        private fileRepo: FileRepository,
        private syncRepo: SyncStateRepository
    ) { }

    async diff(deviceId: string, fileId: string, clientHash: string)
    {
        const file = await this.fileRepo.findById(fileId);
        if (!file) 
        {
            throw new Error("File not found");
        }

        const serverHash = file.hash;
        if (serverHash === clientHash)
        {
            await this.syncRepo.updateState(deviceId, fileId, serverHash);
            return { action: "noop", serverHash };
        }

        return { action: "pull", serverHash };
    }
}
