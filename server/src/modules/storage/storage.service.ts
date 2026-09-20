import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { pipeline } from "node:stream/promises";
import { Readable } from "node:stream";

export interface SaveStreamResult
{
    hash: string;
    size: number;
    conflictCopyPath?: string;
}

export class StorageService
{
    private baseStorageDir: string;
    private tmpDir: string;

    constructor(storageDir?: string)
    {
        this.baseStorageDir = path.resolve(storageDir || process.env.STORAGE_DIR || "./storage");
        this.tmpDir = path.join(this.baseStorageDir, ".tmp");

        if (!fs.existsSync(this.tmpDir))
        {
            fs.mkdirSync(this.tmpDir, { recursive: true });
        }
    }

    public getVaultDir(vaultId: string): string
    {
        return path.join(this.baseStorageDir, "vaults", vaultId);
    }

    public resolvePath(vaultId: string, relativePath: string): string
    {
        const vaultDir = this.getVaultDir(vaultId);
        const resolved = path.resolve(vaultDir, relativePath);

        // Path traversal guard
        if (!resolved.startsWith(vaultDir))
        {
            throw new Error(`Access denied: Path traversal detected for path ${relativePath}`);
        }

        return resolved;
    }

    public fileExists(vaultId: string, relativePath: string): boolean
    {
        const fullPath = this.resolvePath(vaultId, relativePath);
        return fs.existsSync(fullPath);
    }

    public getFileStats(vaultId: string, relativePath: string): { exists: boolean; size: number; mtime?: Date }
    {
        const fullPath = this.resolvePath(vaultId, relativePath);
        if (!fs.existsSync(fullPath))
        {
            return { exists: false, size: 0 };
        }

        const stat = fs.statSync(fullPath);
        return {
            exists: true,
            size: stat.size,
            mtime: stat.mtime,
        };
    }

    public getFileReadStream(vaultId: string, relativePath: string): fs.ReadStream
    {
        const fullPath = this.resolvePath(vaultId, relativePath);
        if (!fs.existsSync(fullPath))
        {
            throw new Error(`File not found at ${relativePath}`);
        }

        return fs.createReadStream(fullPath);
    }

    /**
     * Preserves an existing file by renaming it to a side-by-side conflict copy.
     */
    public createConflictCopy(vaultId: string, relativePath: string, deviceName: string = "Unknown Device"): string
    {
        const fullPath = this.resolvePath(vaultId, relativePath);
        if (!fs.existsSync(fullPath))
        {
            return "";
        }

        const dir = path.dirname(fullPath);
        const ext = path.extname(fullPath);
        const baseName = path.basename(fullPath, ext);

        const now = new Date();
        const dateStr = now.toISOString().replace(/[:.]/g, "-").slice(0, 19);
        const sanitizedDevice = deviceName.replace(/[^a-zA-Z0-9_-]/g, "_");

        const conflictFileName = `${baseName} (Conflict from ${sanitizedDevice} ${dateStr})${ext}`;
        const conflictFullPath = path.join(dir, conflictFileName);

        fs.renameSync(fullPath, conflictFullPath);

        // Return relative path to conflict copy
        const vaultDir = this.getVaultDir(vaultId);
        return path.relative(vaultDir, conflictFullPath);
    }

    /**
     * Atomically saves an incoming stream to the target vault path via a temporary file.
     * Computes the SHA-256 hash and byte size on the fly.
     */
    public async saveStream(
        vaultId: string,
        relativePath: string,
        inputStream: Readable,
        options?: { isConflict?: boolean; deviceName?: string }
    ): Promise<SaveStreamResult>
    {
        const fullTargetPath = this.resolvePath(vaultId, relativePath);
        const targetDir = path.dirname(fullTargetPath);

        if (!fs.existsSync(targetDir))
        {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        let conflictCopyPath: string | undefined;

        // If a collision occurs and we need a conflict copy
        if (options?.isConflict && fs.existsSync(fullTargetPath))
        {
            conflictCopyPath = this.createConflictCopy(vaultId, relativePath, options.deviceName);
        }

        // Write to a temporary file first
        const tempFilePath = path.join(this.tmpDir, `${crypto.randomUUID()}.tmp`);
        const tempWriteStream = fs.createWriteStream(tempFilePath);
        const hash = crypto.createHash("sha256");

        let byteCount = 0;
        inputStream.on("data", (chunk: Buffer) =>
        {
            hash.update(chunk);
            byteCount += chunk.length;
        });

        await pipeline(inputStream, tempWriteStream);

        const computedHash = hash.digest("hex");

        // Atomic rename from temp file to final target
        fs.renameSync(tempFilePath, fullTargetPath);

        return {
            hash: computedHash,
            size: byteCount,
            conflictCopyPath,
        };
    }

    public deleteFile(vaultId: string, relativePath: string): boolean
    {
        const fullPath = this.resolvePath(vaultId, relativePath);
        if (fs.existsSync(fullPath))
        {
            fs.unlinkSync(fullPath);
            return true;
        }
        return false;
    }
}
