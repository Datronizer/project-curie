import { FastifyInstance } from "fastify";

export default async function ingestRoutes(app: FastifyInstance)
{
    // Allow raw streaming octet-stream payloads
    app.addContentTypeParser(
        ["application/octet-stream", "application/zip", "application/x-zip-compressed"],
        function (request, payload, done)
        {
            done(null, payload);
        }
    );

    // Enqueue an ingestion job: POST /vaults/:vaultId/ingest/sdocx
    app.post("/sdocx", async (req: any, reply: any) =>
    {
        const vaultId = req.params.vaultId;
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

        try
        {
            const contentType = req.headers["content-type"] || "";

            // Option A: JSON request with filePath or base64
            if (contentType.includes("application/json"))
            {
                const body = req.body || {};
                if (body.filePath)
                {
                    const job = await app.ingestService.enqueueJob(vaultId, {
                        existingVaultPath: body.filePath,
                        originalFileName: body.originalFileName,
                    });

                    return reply.status(202).send({
                        success: true,
                        jobId: job.id,
                        status: job.status,
                        message: "SDOCX ingestion job enqueued from vault path",
                    });
                }
                else if (body.contentBase64)
                {
                    const buffer = Buffer.from(body.contentBase64, "base64");
                    const job = await app.ingestService.enqueueJob(vaultId, {
                        buffer,
                        originalFileName: body.originalFileName || "note.sdocx",
                    });

                    return reply.status(202).send({
                        success: true,
                        jobId: job.id,
                        status: job.status,
                        message: "SDOCX ingestion job enqueued from base64 content",
                    });
                }
                else
                {
                    return reply.status(400).send({
                        success: false,
                        error: { message: "Request must specify either 'filePath' or 'contentBase64'", code: "BAD_REQUEST", status: 400 },
                    });
                }
            }

            // Option B: Streamed binary payload
            const chunks: Buffer[] = [];
            for await (const chunk of req.raw)
            {
                chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
            }
            const buffer = Buffer.concat(chunks);

            if (buffer.length === 0)
            {
                return reply.status(400).send({
                    success: false,
                    error: { message: "No binary data provided in request body", code: "BAD_REQUEST", status: 400 },
                });
            }

            const originalFileName = req.query?.filename || (req.headers["x-filename"] as string) || "note.sdocx";
            const job = await app.ingestService.enqueueJob(vaultId, {
                buffer,
                originalFileName,
            });

            return reply.status(202).send({
                success: true,
                jobId: job.id,
                status: job.status,
                message: "SDOCX ingestion job enqueued",
            });
        }
        catch (err: any)
        {
            return reply.status(500).send({
                success: false,
                error: { message: err.message || "Failed to enqueue ingestion job", code: "INTERNAL_ERROR", status: 500 },
            });
        }
    });

    // Inspect job status: GET /vaults/:vaultId/ingest/jobs/:jobId
    app.get("/jobs/:jobId", async (req: any, reply: any) =>
    {
        const vaultId = req.params.vaultId;
        const jobId = req.params.jobId;
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

        const job = await app.ingestService.getJob(jobId, vaultId);
        if (!job)
        {
            return reply.status(404).send({
                success: false,
                error: { message: `Ingestion job not found: ${jobId}`, code: "NOT_FOUND", status: 404 },
            });
        }

        return reply.status(200).send({
            success: true,
            job,
        });
    });

    // List jobs for vault: GET /vaults/:vaultId/ingest/jobs
    app.get("/jobs", async (req: any, reply: any) =>
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

        const limit = req.query?.limit ? parseInt(req.query.limit, 10) : 50;
        const jobs = await app.ingestService.listJobs(vaultId, limit);

        return reply.status(200).send({
            success: true,
            jobs,
        });
    });
}
