import { VaultRepository, FileRepository } from "../../db/repositories/index";
import { Vault } from "../../db/types";

export class VaultService
{
    constructor(
        private vaultRepo: VaultRepository,
        private fileRepo: FileRepository
    ) { }

    public async create(name: string): Promise<Vault>
    {
        return this.vaultRepo.create({ name });
    }

    public async list(): Promise<Vault[]>
    {
        return this.vaultRepo.list();
    }

    public async findOne(id: string): Promise<Vault>
    {
        const vault = await this.vaultRepo.findById(id);
        if (!vault)
        {
            throw new Error(`Vault with id ${id} not found`);
        }
        return vault;
    }

    public async delete(id: string): Promise<void>
    {
        // Optional: delete vault files first
        const files = await this.fileRepo.listFilesInVault(id);
        for (const f of files)
        {
            // fileRepo can handle delete later
        }

        return this.vaultRepo.delete(id);
    }
}
