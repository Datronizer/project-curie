import { FileRepository, SyncStateRepository } from "../../db/repositories";

export type DiffAction = "noop" | "push" | "pull" | "conflict";

export interface DiffResult
{
    action: DiffAction;
    serverHash?: string;
}

export class SyncService
{
    constructor(
        private fileRepo: FileRepository,
        private syncRepo: SyncStateRepository
    ) { }

    public async diff(deviceId: string, vaultId: string, path: string, clientHash: string): Promise<DiffResult>
    {
        const file = await this.fileRepo.findByVaultAndPath(vaultId, path);
        if (!file)
        {
            return { action: "push" };
        }

        const serverHash = file.hash;

        // Hashes match exactly
        if (serverHash === clientHash)
        {
            await this.syncRepo.updateState(deviceId, file.id, serverHash);
            return { action: "noop", serverHash };
        }

        const syncState = await this.syncRepo.find(deviceId, file.id);

        // No previous sync state recorded for this device; preserve local edit via conflict
        if (!syncState)
        {
            return { action: "conflict", serverHash };
        }

        // Server hasn't changed since last sync; client modified locally
        if (syncState.lastKnownHash === serverHash)
        {
            return { action: "push", serverHash };
        }

        // Client hasn't changed since last sync; server was updated by another device
        if (syncState.lastKnownHash === clientHash)
        {
            return { action: "pull", serverHash };
        }

        // Both client and server changed concurrently offline
        return { action: "conflict", serverHash };
    }
}
