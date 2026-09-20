import { FastifyInstance } from "fastify";
import { FileService } from "./file.service";

export default async function fileRoutes(app: FastifyInstance)
{
    const fileService = new FileService(app.fileRepo, app.storageService);

    // Support streaming binary/raw body
    app.addContentTypeParser(
        ["application/octet-stream", "text/markdown", "text/plain", "application/pdf"],
        function (request, payload, done)
        {
            done(null, payload);
        }
    );

    // List all files in vault
    const handleListFiles = async (req: any, reply: any) =>
    {
        const vaultId = req.params.vaultId;
        const userId = req.authenticatedUser?.id;

        if (userId)
        {
            const hasAccess = await app.vaultMemberRepo.hasAccess(vaultId, userId, "read");
            if (!hasAccess)
            {
                return reply.status(403).send({
                    success: false,
                    error: { message: "Access denied to this vault", code: "FORBIDDEN", status: 403 },
                });
            }
        }

        return fileService.listFiles(vaultId);
    };

    app.get("/files", handleListFiles);
    app.get("/files/", handleListFiles);

    // Stream download handler
    const handleDownload = async (req: any, reply: any) =>
    {
        const vaultId = req.params.vaultId;
        const relativePath = req.query?.path;
        const userId = req.authenticatedUser?.id;

        if (!relativePath)
        {
            return reply.status(400).send({
                success: false,
                error: { message: "Query parameter 'path' is required", code: "BAD_REQUEST", status: 400 },
            });
        }

        if (userId)
        {
            const hasAccess = await app.vaultMemberRepo.hasAccess(vaultId, userId, "read");
            if (!hasAccess)
            {
                return reply.status(403).send({
                    success: false,
                    error: { message: "Access denied to this vault", code: "FORBIDDEN", status: 403 },
                });
            }
        }

        try
        {
            const { stream, hash, size } = await fileService.getStream(vaultId, relativePath);
            const file = await app.fileRepo.findByVaultAndPath(vaultId, relativePath);
            const effectiveDeviceId = req.authenticatedDevice?.id;
            if (effectiveDeviceId && file)
            {
                await app.syncStateRepo.updateState(effectiveDeviceId, file.id, hash);
            }

            reply.header("x-curie-hash", hash);
            reply.header("Content-Length", size);
            reply.header("Content-Type", "application/octet-stream");
            return reply.send(stream);
        }
        catch (err: any)
        {
            return reply.status(404).send({
                success: false,
                error: { message: err.message || "File not found", code: "NOT_FOUND", status: 404 },
            });
        }
    };

    app.get("/content", handleDownload);
    app.get("/files/content", handleDownload);

    // Stream upload handler
    const handleUpload = async (req: any, reply: any) =>
    {
        const vaultId = req.params.vaultId;
        const relativePath = req.query?.path;
        const isConflict = req.query?.conflict === "true";
        const userId = req.authenticatedUser?.id;
        const deviceName = req.authenticatedDevice?.name || "Client Device";

        if (!relativePath)
        {
            return reply.status(400).send({
                success: false,
                error: { message: "Query parameter 'path' is required", code: "BAD_REQUEST", status: 400 },
            });
        }

        if (userId)
        {
            const hasAccess = await app.vaultMemberRepo.hasAccess(vaultId, userId, "write");
            if (!hasAccess)
            {
                return reply.status(403).send({
                    success: false,
                    error: { message: "Write access denied to this vault", code: "FORBIDDEN", status: 403 },
                });
            }
        }

        const inputStream = req.raw;
        const result = await fileService.uploadStream(vaultId, relativePath, inputStream, {
            isConflict,
            deviceName,
        });

        const effectiveDeviceId = req.authenticatedDevice?.id;
        if (effectiveDeviceId)
        {
            await app.syncStateRepo.updateState(effectiveDeviceId, result.file.id, result.hash);
        }

        return reply.status(200).send({
            success: true,
            file: result.file,
            hash: result.hash,
            size: result.size,
            conflictCopyPath: result.conflictCopyPath,
        });
    };

    app.put("/content", handleUpload);
    app.put("/files/content", handleUpload);

    // Legacy JSON upsert
    const handleLegacyUpsert = async (req: any, reply: any) =>
    {
        const vaultId = req.params.vaultId;
        const { path, content, hash } = req.body || {};
        const userId = req.authenticatedUser?.id;

        if (userId)
        {
            const hasAccess = await app.vaultMemberRepo.hasAccess(vaultId, userId, "write");
            if (!hasAccess)
            {
                return reply.status(403).send({
                    success: false,
                    error: { message: "Write access denied to this vault", code: "FORBIDDEN", status: 403 },
                });
            }
        }

        const result = await fileService.upsertJson(vaultId, path, content, hash);
        const effectiveDeviceId = req.authenticatedDevice?.id;
        if (effectiveDeviceId && result.file)
        {
            await app.syncStateRepo.updateState(effectiveDeviceId, result.file.id, hash);
        }
        return result;
    };

    app.put("/files", handleLegacyUpsert);
    app.put("/files/", handleLegacyUpsert);
}
