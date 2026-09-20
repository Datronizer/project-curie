import { Readable } from "node:stream";
import { FileRepository } from "../../db/repositories/file.repository";
import { StorageService } from "../storage/storage.service";
import { File } from "../../db/types";

export class FileService
{
    constructor(
        private fileRepo: FileRepository,
        private storageService: StorageService
    ) { }

    public async uploadStream(
        vaultId: string,
        relativePath: string,
        inputStream: Readable,
        options?: { isConflict?: boolean; deviceName?: string }
    ): Promise<{ file: File; hash: string; size: number; conflictCopyPath?: string }>
    {
        const result = await this.storageService.saveStream(vaultId, relativePath, inputStream, options);

        const file = await this.fileRepo.upsertFile(
            vaultId,
            relativePath,
            result.hash,
            result.size,
            new Date()
        );

        return {
            file,
            hash: result.hash,
            size: result.size,
            conflictCopyPath: result.conflictCopyPath,
        };
    }

    public async getStream(
        vaultId: string,
        relativePath: string
    ): Promise<{ stream: Readable; hash: string; size: number }>
    {
        const file = await this.fileRepo.findByVaultAndPath(vaultId, relativePath);
        if (!file)
        {
            throw new Error(`File not found at path ${relativePath}`);
        }

        const stream = this.storageService.getFileReadStream(vaultId, relativePath);
        const stats = this.storageService.getFileStats(vaultId, relativePath);

        return {
            stream,
            hash: file.hash,
            size: stats.size,
        };
    }

    public async upsertJson(
        vaultId: string,
        relativePath: string,
        content: string,
        hash: string
    ): Promise<{ file: File }>
    {
        const stream = Readable.from(Buffer.from(content, "utf8"));
        const { file } = await this.uploadStream(vaultId, relativePath, stream);
        return { file };
    }

    public async listFiles(vaultId: string): Promise<File[]>
    {
        return this.fileRepo.listFilesInVault(vaultId);
    }
}
