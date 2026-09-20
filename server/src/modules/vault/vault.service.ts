import { VaultRepository, VaultMemberRepository, FileRepository } from "../../db/repositories/index";
import { StorageService } from "../storage/storage.service";
import { Vault } from "../../db/types";
import fs from "node:fs";
import path from "node:path";

export interface TreeNode
{
    name: string;
    path: string;
    type: "file" | "dir";
    size?: number;
    updatedAt?: string;
    children?: TreeNode[];
}

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

    public async getTree(vaultId: string, userId?: string): Promise<TreeNode[]>
    {
        if (userId)
        {
            const hasAccess = await this.vaultMemberRepo.hasAccess(vaultId, userId, "read");
            if (!hasAccess)
            {
                throw new Error(`Access denied to vault ${vaultId}`);
            }
        }

        const vault = await this.vaultRepo.findById(vaultId);
        if (!vault)
        {
            throw new Error(`Vault with id ${vaultId} not found`);
        }

        if (!this.storageService)
        {
            return [];
        }

        const vaultDir = this.storageService.getVaultDir(vaultId);
        if (!fs.existsSync(vaultDir))
        {
            return [];
        }

        const buildTree = (dirPath: string): TreeNode[] =>
        {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            const nodes: TreeNode[] = [];

            for (const entry of entries)
            {
                if (entry.name.startsWith("."))
                {
                    continue;
                }

                const fullPath = path.join(dirPath, entry.name);
                const relPath = path.relative(vaultDir, fullPath).replace(/\\/g, "/");

                if (entry.isDirectory())
                {
                    const children = buildTree(fullPath);
                    nodes.push({
                        name: entry.name,
                        path: relPath,
                        type: "dir",
                        children,
                    });
                }
                else if (entry.isFile())
                {
                    try
                    {
                        const stat = fs.statSync(fullPath);
                        nodes.push({
                            name: entry.name,
                            path: relPath,
                            type: "file",
                            size: stat.size,
                            updatedAt: stat.mtime.toISOString(),
                        });
                    }
                    catch
                    {
                        nodes.push({
                            name: entry.name,
                            path: relPath,
                            type: "file",
                        });
                    }
                }
            }

            nodes.sort((a, b) =>
            {
                if (a.type === b.type)
                {
                    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
                }
                return a.type === "dir" ? -1 : 1;
            });

            return nodes;
        };

        return buildTree(vaultDir);
    }
}
