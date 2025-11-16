import { FileRepository, FileVersionRepository } from "../../db/repositories";
import { File, FileVersion } from "../../db/types";

export class FileService
{
    constructor(
        private fileRepo: FileRepository,
        private versionRepo: FileVersionRepository
    ) { }

    public async upsert(vaultId: string, path: string, content: string, hash: string): Promise<{ file: File; version: FileVersion }>
    {
        let file = await this.fileRepo.findByVaultAndPath(vaultId, path);

        if (!file)
        {
            file = await this.fileRepo.create({ vaultId, path, hash });
        }
        else
        {
            file = await this.fileRepo.updateHash(file.id, hash);
        }

        const version = await this.versionRepo.create({
            fileId: file.id,
            versionHash: hash,
            content,
        });

        return { file, version };
    }
}
