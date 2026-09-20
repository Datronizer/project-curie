import { VaultRepository, VaultMemberRepository, FileRepository } from "../../db/repositories/index";
import { StorageService } from "../storage/storage.service";
import { Vault } from "../../db/types";
import fs from "node:fs";

export class VaultService
{
    constructor(
        private vaultRepo: VaultRepository,
        private vaultMemberRepo: VaultMemberRepository,
        private fileRepo: FileRepository,
        private storageService?: StorageService
    ) { }

    public async create(name: string, ownerId: string): Promise<Vault>
    {
        const vault = await this.vaultRepo.create({ name, ownerId });
        if (this.storageService)
        {
            const vaultDir = this.storageService.getVaultDir(vault.id);
            if (!fs.existsSync(vaultDir))
            {
                fs.mkdirSync(vaultDir, { recursive: true });
            }
        }
        return vault;
    }

    public async list(userId?: string): Promise<Vault[]>
    {
        if (userId)
        {
            return this.vaultRepo.listForUser(userId);
        }
        return this.vaultRepo.list();
    }

    public async findOne(id: string, userId?: string): Promise<Vault>
    {
        if (userId)
        {
            const hasAccess = await this.vaultMemberRepo.hasAccess(id, userId, "read");
            if (!hasAccess)
            {
                throw new Error(`Access denied to vault ${id}`);
            }
        }

        const vault = await this.vaultRepo.findById(id);
        if (!vault)
        {
            throw new Error(`Vault with id ${id} not found`);
        }
        return vault;
    }

    public async delete(id: string, userId?: string): Promise<void>
    {
        if (userId)
        {
            const hasAdmin = await this.vaultMemberRepo.hasAccess(id, userId, "admin");
            if (!hasAdmin)
            {
                throw new Error(`Admin permission required to delete vault ${id}`);
            }
        }

        return this.vaultRepo.delete(id);
    }
}
