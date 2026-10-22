import fs from "node:fs";
import path from "node:path";
import { IngestionJobRepository } from "../../db/repositories/ingestionJob.repository";
import { FileRepository } from "../../db/repositories/file.repository";
import { StorageService } from "../storage/storage.service";
import { OcrService } from "./ocr.service";
import { decomposeSdocx, sanitizeSlug } from "./archive.utils";
import { parseStrokeBuffer, renderStrokesToSvg } from "./stroke.parser";
import { extractContentFromXmlOrJson } from "./table.parser";
import { synthesizeMarkdownNote, SynthesizerPageInput } from "./note.synthesizer";
import { IngestionJob } from "../../db/types";
import { IngestionQueueWorker, JobProcessor } from "./ingest.worker";
import { parseSdocxArchive, SdocxParsedDocument } from "./sdocx.parser";

export interface EnqueueJobOptions
{
    buffer?: Buffer;
    existingVaultPath?: string;
    originalFileName?: string;
}

export class IngestService implements JobProcessor
{
    private ocrService: OcrService;
    private worker?: IngestionQueueWorker;

    constructor(
        private ingestionJobRepo: IngestionJobRepository,
        private fileRepo: FileRepository,
        private storageService: StorageService,
        ocrService?: OcrService
    )
    {
        this.ocrService = ocrService ?? new OcrService();
    }

    public setWorker(worker: IngestionQueueWorker): void
    {
        this.worker = worker;
    }

    /**
     * Enqueues an .sdocx ingestion job, preserving the untouched raw archive.
     */
    public async enqueueJob(vaultId: string, options: EnqueueJobOptions): Promise<IngestionJob>
    {
        let rawRelativePath = "";
        let fileHash = "";
        let sourceFileName = "";

        if (options.buffer)
        {
            const timestamp = Date.now();
            const originalName = options.originalFileName ? path.basename(options.originalFileName) : "note.sdocx";
            sourceFileName = originalName;
            const safeName = originalName.replace(/[^a-zA-Z0-9._-]/g, "_");
            rawRelativePath = `.curie/sdocx/${timestamp}_${safeName}`;

            const saveRes = await this.storageService.saveBuffer(vaultId, rawRelativePath, options.buffer);
            fileHash = saveRes.hash;
        }
        else if (options.existingVaultPath)
        {
            if (!this.storageService.fileExists(vaultId, options.existingVaultPath))
            {
                throw new Error(`Vault file does not exist at ${options.existingVaultPath}`);
            }

            sourceFileName = path.basename(options.existingVaultPath);
            const fullPath = this.storageService.resolvePath(vaultId, options.existingVaultPath);
            const buffer = fs.readFileSync(fullPath);
            const timestamp = Date.now();
            const safeName = sourceFileName.replace(/[^a-zA-Z0-9._-]/g, "_");
            rawRelativePath = `.curie/sdocx/${timestamp}_${safeName}`;

            const saveRes = await this.storageService.saveBuffer(vaultId, rawRelativePath, buffer);
            fileHash = saveRes.hash;
        }
        else
        {
            throw new Error("Either buffer or existingVaultPath must be provided to enqueue an ingestion job");
        }

        const job = await this.ingestionJobRepo.create({
            vaultId,
            sourceFileName,
            status: "queued",
            stage: "queued",
            progress: 0,
            sourceFilePath: rawRelativePath,
            sourceFileHash: fileHash,
        });

        // Notify background worker
        this.worker?.trigger();

        return job;
    }

    public async getJob(jobId: string, vaultId?: string): Promise<IngestionJob | undefined>
    {
        if (vaultId)
        {
            return this.ingestionJobRepo.findByIdAndVault(jobId, vaultId);
        }
        return this.ingestionJobRepo.findById(jobId);
    }

    public async listJobs(vaultId: string, limit?: number): Promise<IngestionJob[]>
    {
        return this.ingestionJobRepo.listByVault(vaultId, limit);
    }

    /**
     * Finds and processes the next queued job.
     */
    public async processNextPendingJob(): Promise<boolean>
    {
        const pending = await this.ingestionJobRepo.getPendingJobs(1);
        if (pending.length === 0)
        {
            return false;
        }

        await this.processJob(pending[0].id);
        return true;
    }

    /**
     * Executes the complete decomposition, stroke rendering, OCR, and synthesis pipeline for a job.
     */
    public async processJob(jobId: string): Promise<void>
    {
        const job = await this.ingestionJobRepo.findById(jobId);
        if (!job || job.status !== "queued")
        {
            return;
        }

        try
        {
            await this.ingestionJobRepo.updateStatus(job.id, "processing", {
                stage: "initializing",
                progress: 5,
            });

            if (!job.sourceFilePath)
            {
                throw new Error(`Raw source archive path missing for job ${job.id}`);
            }

            const sourceFilePath = job.sourceFilePath;
            const fullPath = this.storageService.resolvePath(job.vaultId, sourceFilePath);
            if (!fs.existsSync(fullPath))
            {
                throw new Error(`Raw source archive missing at ${sourceFilePath}`);
            }

            const buffer = fs.readFileSync(fullPath);

            // Step 1: Decompress archive
            await this.ingestionJobRepo.updateProgress(job.id, 15, "decompressing");

            // Infer title fallback from source filename (stripping timestamps and formatting)
            const rawBaseName = path.basename(job.sourceFileName || sourceFilePath, path.extname(job.sourceFileName || sourceFilePath));
            const inferredTitle = rawBaseName
                .replace(/^\d+_+/, "")
                .replace(/_\d{6}_\d{6}$/, "")
                .replace(/_+/g, " ")
                .trim();

            // Try native @twango/sdocx engine first
            let sdocxDoc: SdocxParsedDocument | null = null;
            try
            {
                sdocxDoc = await parseSdocxArchive(buffer);
            }
            catch (sdocxErr)
            {
                // Graceful fallback for non-Samsung or synthetic test archives
                console.info(`[IngestService] Native @twango/sdocx parsing skipped/fallback for job ${job.id}:`, (sdocxErr as any)?.message || sdocxErr);
                sdocxDoc = null;
            }

            if (sdocxDoc && sdocxDoc.pages.length > 0)
            {
                await this.processNativeSdocx(job, buffer, sdocxDoc, inferredTitle);
            }
            else
            {
                await this.processFallbackSdocx(job, buffer, inferredTitle);
            }
        }
        catch (err: any)
        {
            console.error(`[IngestService] Job ${jobId} failed:`, err);
            await this.ingestionJobRepo.updateStatus(jobId, "failed", {
                stage: "failed",
                error: err?.message || String(err),
            });
        }
    }

    /**
     * Processes modern Samsung Notes archives using the @twango/sdocx WASM parser.
     */
    private async processNativeSdocx(
        job: IngestionJob,
        buffer: Buffer,
        sdocxDoc: SdocxParsedDocument,
        inferredTitle: string
    ): Promise<void>
    {
        const sourceFilePath = job.sourceFilePath!;
        const noteTitle = sdocxDoc.title || inferredTitle || "Samsung Note";
        const slug = sanitizeSlug(noteTitle);

        // Step 2: Extract Media from zip
        await this.ingestionJobRepo.updateProgress(job.id, 30, "extracting_media");
        const decomposed = decomposeSdocx(buffer);
        const audioPaths: string[] = [];
        const imagePaths: string[] = [];

        for (const audio of decomposed.audioFiles)
        {
            const relPath = `attachments/${slug}/${audio.fileName}`;
            const saveRes = await this.storageService.saveBuffer(job.vaultId, relPath, audio.buffer);
            await this.fileRepo.upsertFile(job.vaultId, relPath, saveRes.hash, saveRes.size, new Date());
            audioPaths.push(relPath);
        }

        for (const img of decomposed.imageFiles)
        {
            const relPath = `attachments/${slug}/${img.fileName}`;
            const saveRes = await this.storageService.saveBuffer(job.vaultId, relPath, img.buffer);
            await this.fileRepo.upsertFile(job.vaultId, relPath, saveRes.hash, saveRes.size, new Date());
            imagePaths.push(relPath);
        }

        // Step 3: Vector Strokes & OCR for each page
        await this.ingestionJobRepo.updateProgress(job.id, 50, "parsing_strokes");
        const pages: SynthesizerPageInput[] = [];

        for (let i = 0; i < sdocxDoc.pages.length; i++)
        {
            const page = sdocxDoc.pages[i];
            const svgRelPath = `attachments/${slug}/handwriting_p${page.pageIndex}.svg`;
            const saveRes = await this.storageService.saveBuffer(
                job.vaultId,
                svgRelPath,
                Buffer.from(page.svg, "utf-8")
            );
            await this.fileRepo.upsertFile(job.vaultId, svgRelPath, saveRes.hash, saveRes.size, new Date());

            // Run OCR transcription on rasterized page PNG
            let transcription: any = undefined;
            if (page.pngBuffer && page.pngBuffer.length > 0)
            {
                try
                {
                    transcription = await this.ocrService.transcribeImage(page.pngBuffer, {
                        pageIndex: page.pageIndex,
                    });
                }
                catch (ocrErr)
                {
                    console.warn(`[IngestService] OCR failed on page ${page.pageIndex}:`, ocrErr);
                }
            }

            // Append any typed text from the page
            if (page.typedText)
            {
                if (transcription && transcription.text)
                {
                    transcription.text = `${page.typedText}\n\n${transcription.text}`;
                }
                else
                {
                    transcription = {
                        text: page.typedText,
                        confidence: 100,
                        lines: page.typedText.split("\n").map((t) => ({ text: t, confidence: 100 })),
                    };
                }
            }

            pages.push({
                pageIndex: page.pageIndex,
                svgPath: svgRelPath,
                transcription,
            });
        }

        // Step 4: Synthesize Markdown Note
        await this.ingestionJobRepo.updateProgress(job.id, 85, "synthesizing_note");
        const markdown = synthesizeMarkdownNote({
            title: noteTitle,
            sourceSdocxPath: sourceFilePath,
            audioPaths,
            imagePaths,
            pages,
            paragraphs: [],
            tables: [],
            ingestedAt: new Date(),
        });

        const targetNotePath = `${slug}.md`;
        const noteSaveRes = await this.storageService.saveBuffer(
            job.vaultId,
            targetNotePath,
            Buffer.from(markdown, "utf-8")
        );
        await this.fileRepo.upsertFile(job.vaultId, targetNotePath, noteSaveRes.hash, noteSaveRes.size, new Date());

        // Step 5: Mark Completed
        await this.ingestionJobRepo.updateStatus(job.id, "completed", {
            stage: "completed",
            progress: 100,
            targetNotePath,
            metadata: JSON.stringify({
                title: noteTitle,
                audioCount: audioPaths.length,
                imageCount: imagePaths.length,
                pageCount: pages.length,
                tableCount: 0,
            }),
        });
    }

    /**
     * Fallback processing pipeline for custom, legacy, or synthetic test archives.
     */
    private async processFallbackSdocx(
        job: IngestionJob,
        buffer: Buffer,
        inferredTitle: string
    ): Promise<void>
    {
        const sourceFilePath = job.sourceFilePath!;
        const decomposed = decomposeSdocx(buffer);

        // Extract title and base name
        const extracted = extractContentFromXmlOrJson(decomposed.xmlOrJsonFiles);
        const noteTitle = extracted.title || inferredTitle || "Samsung Note";
        const slug = sanitizeSlug(noteTitle);

        // Step 2: Extract Media
        await this.ingestionJobRepo.updateProgress(job.id, 30, "extracting_media");
        const audioPaths: string[] = [];
        const imagePaths: string[] = [];

        for (const audio of decomposed.audioFiles)
        {
            const relPath = `attachments/${slug}/${audio.fileName}`;
            const saveRes = await this.storageService.saveBuffer(job.vaultId, relPath, audio.buffer);
            await this.fileRepo.upsertFile(job.vaultId, relPath, saveRes.hash, saveRes.size, new Date());
            audioPaths.push(relPath);
        }

        for (const img of decomposed.imageFiles)
        {
            const relPath = `attachments/${slug}/${img.fileName}`;
            const saveRes = await this.storageService.saveBuffer(job.vaultId, relPath, img.buffer);
            await this.fileRepo.upsertFile(job.vaultId, relPath, saveRes.hash, saveRes.size, new Date());
            imagePaths.push(relPath);
        }

        // Step 3: Parse Stylus Strokes & OCR
        await this.ingestionJobRepo.updateProgress(job.id, 50, "parsing_strokes");
        const pages: SynthesizerPageInput[] = [];

        for (let i = 0; i < decomposed.strokeFiles.length; i++)
        {
            const strokeFile = decomposed.strokeFiles[i];
            try
            {
                const parsed = parseStrokeBuffer(strokeFile.buffer, strokeFile.pageIndex);
                const svg = renderStrokesToSvg(parsed);
                const svgRelPath = `attachments/${slug}/handwriting_p${strokeFile.pageIndex}.svg`;
                const saveRes = await this.storageService.saveBuffer(job.vaultId, svgRelPath, Buffer.from(svg, "utf-8"));
                await this.fileRepo.upsertFile(job.vaultId, svgRelPath, saveRes.hash, saveRes.size, new Date());

                // OCR Transcription on matching page image if available
                let transcription: any = undefined;
                const matchingImage = decomposed.imageFiles.find(
                    (img) => img.fileName.toLowerCase().includes(`page_${strokeFile.pageIndex}`) ||
                             img.fileName.toLowerCase().includes(`p${strokeFile.pageIndex}`) ||
                             img.fileName.toLowerCase().includes(`page${strokeFile.pageIndex}`)
                );

                if (matchingImage)
                {
                    try
                    {
                        transcription = await this.ocrService.transcribeImage(matchingImage.buffer, { pageIndex: strokeFile.pageIndex });
                    }
                    catch (ocrErr)
                    {
                        console.warn(`[IngestService] OCR skipped on page ${strokeFile.pageIndex}:`, ocrErr);
                    }
                }

                pages.push({
                    pageIndex: strokeFile.pageIndex,
                    svgPath: svgRelPath,
                    transcription,
                });
            }
            catch (pageErr)
            {
                console.warn(`[IngestService] Non-fatal error processing stroke page ${strokeFile.pageIndex}:`, pageErr);
            }
        }

        // Step 4: Synthesize Markdown Note
        await this.ingestionJobRepo.updateProgress(job.id, 85, "synthesizing_note");
        const markdown = synthesizeMarkdownNote({
            title: noteTitle,
            sourceSdocxPath: sourceFilePath,
            audioPaths,
            imagePaths,
            pages,
            paragraphs: extracted.textParagraphs,
            tables: extracted.tables,
            ingestedAt: new Date(),
        });

        const targetNotePath = `${slug}.md`;
        const noteSaveRes = await this.storageService.saveBuffer(job.vaultId, targetNotePath, Buffer.from(markdown, "utf-8"));
        await this.fileRepo.upsertFile(job.vaultId, targetNotePath, noteSaveRes.hash, noteSaveRes.size, new Date());

        // Step 5: Mark Completed
        await this.ingestionJobRepo.updateStatus(job.id, "completed", {
            stage: "completed",
            progress: 100,
            targetNotePath,
            metadata: JSON.stringify({
                title: noteTitle,
                audioCount: audioPaths.length,
                imageCount: imagePaths.length,
                pageCount: pages.length,
                tableCount: extracted.tables.length,
            }),
        });
    }
}
