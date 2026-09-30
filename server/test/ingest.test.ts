import { describe, it, before, after } from "node:test";
import assert from "node:assert";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { initDatabase } from "../src/db/init";
import { UserRepository } from "../src/db/repositories/user.repository";
import { DeviceRepository } from "../src/db/repositories/device.repository";
import { VaultRepository } from "../src/db/repositories/vault.repository";
import { FileRepository } from "../src/db/repositories/file.repository";
import { IngestionJobRepository } from "../src/db/repositories/ingestionJob.repository";
import { StorageService } from "../src/modules/storage/storage.service";
import { IngestService } from "../src/modules/ingest/ingest.service";
import { IngestionQueueWorker } from "../src/modules/ingest/ingest.worker";
import { decomposeSdocx, sanitizeSlug } from "../src/modules/ingest/archive.utils";
import { parseStrokeBuffer, renderStrokesToSvg } from "../src/modules/ingest/stroke.parser";
import { extractContentFromXmlOrJson, formatMarkdownTable } from "../src/modules/ingest/table.parser";
import { synthesizeMarkdownNote } from "../src/modules/ingest/note.synthesizer";
import { buildApp } from "../src/app";

describe("SDOCX Ingestion Pipeline", () =>
{
    const testStorageDir = path.resolve("./test_storage_ingest");
    let testVaultId = "";
    const testToken = `sdocx-test-token-${Date.now()}-${Math.random().toString(36).slice(2)}`;

    before(async () =>
    {
        initDatabase();

        if (fs.existsSync(testStorageDir))
        {
            fs.rmSync(testStorageDir, { recursive: true, force: true });
        }
        fs.mkdirSync(testStorageDir, { recursive: true });

        // Seed test user, device, and vault
        const userRepo = new UserRepository();
        const deviceRepo = new DeviceRepository();
        const vaultRepo = new VaultRepository();

        const user = await userRepo.create({
            name: "Ingest Tester",
            email: `tester_${Date.now()}@curie.internal`,
            passwordHash: "dummy-hash",
        });

        const tokenHash = crypto.createHash("sha256").update(testToken).digest("hex");
        await deviceRepo.registerDevice({
            userId: user.id,
            name: "Test Ingest Device",
            platform: "node",
            tokenHash,
        });

        const vault = await vaultRepo.create({
            name: "SDOCX Vault",
            ownerId: user.id,
        });

        testVaultId = vault.id;
    });

    after(() =>
    {
        if (fs.existsSync(testStorageDir))
        {
            fs.rmSync(testStorageDir, { recursive: true, force: true });
        }
    });

    // Helper: Build a realistic synthetic .sdocx archive
    function createMockSdocxBuffer(): Buffer
    {
        const zip = new AdmZip();

        // 1. Audio recording
        const mockAudioData = Buffer.from("MOCK_AUDIO_CONTENT_M4A_STREAM");
        zip.addFile("media/lecture_recording.m4a", mockAudioData);

        // 2. Embedded image (valid 1x1 transparent PNG)
        const mockImageData = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64");
        zip.addFile("media/diagram_p1.png", mockImageData);

        // 3. Binary stroke stream for page 1
        // Width: 1440 (UInt32LE), Height: 2560 (UInt32LE)
        // Stroke 1: Color 0xFF0000FF (blue), Width 3.0 (FloatLE), Point Count 3 (UInt32LE)
        const strokeBuf = Buffer.alloc(8 + 12 + (3 * 8));
        strokeBuf.writeUInt32LE(1440, 0);
        strokeBuf.writeUInt32LE(2560, 4);

        strokeBuf.writeUInt32LE(0xff0000ff, 8); // Color: opaque blue
        strokeBuf.writeFloatLE(3.0, 12);        // Width: 3.0
        strokeBuf.writeUInt32LE(3, 16);          // Points count: 3

        strokeBuf.writeFloatLE(100.0, 20);
        strokeBuf.writeFloatLE(100.0, 24);
        strokeBuf.writeFloatLE(150.0, 28);
        strokeBuf.writeFloatLE(150.0, 32);
        strokeBuf.writeFloatLE(200.0, 36);
        strokeBuf.writeFloatLE(200.0, 40);

        zip.addFile("drawing/page_1.page", strokeBuf);

        // 4. XML note document with table and text
        const xmlContent = `<?xml version="1.0" encoding="utf-8"?>
<note>
  <title>Biochemistry Lecture Notes</title>
  <p>Enzyme kinetics and active site thermodynamics.</p>
  <p>Review Michaelis-Menten constant Km before lab exam.</p>
  <table>
    <tr><th>Substrate</th><th>Km (mM)</th><th>Vmax (umol/s)</th></tr>
    <tr><td>Glucose</td><td>0.15</td><td>42.5</td></tr>
    <tr><td>Fructose</td><td>1.20</td><td>18.3</td></tr>
  </table>
</note>`;
        zip.addFile("content/note_data.xml", Buffer.from(xmlContent, "utf-8"));

        return zip.toBuffer();
    }

    it("2.1 & 2.2 Unpacks .sdocx ZIP container and decomposes internal assets", () =>
    {
        const buffer = createMockSdocxBuffer();
        const decomposed = decomposeSdocx(buffer);

        assert.strictEqual(decomposed.audioFiles.length, 1);
        assert.strictEqual(decomposed.audioFiles[0].fileName, "lecture_recording.m4a");
        assert.strictEqual(decomposed.audioFiles[0].mimeType, "audio/mp4");

        assert.strictEqual(decomposed.imageFiles.length, 1);
        assert.strictEqual(decomposed.imageFiles[0].fileName, "diagram_p1.png");

        assert.strictEqual(decomposed.strokeFiles.length, 1);
        assert.strictEqual(decomposed.strokeFiles[0].pageIndex, 1);

        assert.strictEqual(decomposed.xmlOrJsonFiles.length, 1);
    });

    it("3.1 & 3.2 Parses binary stylus strokes and renders scalable vector SVG", () =>
    {
        const buffer = createMockSdocxBuffer();
        const decomposed = decomposeSdocx(buffer);
        const strokeFile = decomposed.strokeFiles[0];

        const parsed = parseStrokeBuffer(strokeFile.buffer, strokeFile.pageIndex);
        assert.strictEqual(parsed.pageIndex, 1);
        assert.strictEqual(parsed.width, 1440);
        assert.strictEqual(parsed.height, 2560);
        assert.strictEqual(parsed.strokes.length, 1);
        assert.strictEqual(parsed.strokes[0].points.length, 3);
        assert.strictEqual(parsed.strokes[0].points[0].x, 100);
        assert.strictEqual(parsed.strokes[0].points[0].y, 100);

        const svg = renderStrokesToSvg(parsed);
        assert.ok(svg.includes("<svg"), "Must output valid SVG root");
        assert.ok(svg.includes('viewBox="0 0 1440 2560"'), "Must include page dimensions");
        assert.ok(svg.includes("<path d="), "Must render vector path");
        assert.ok(svg.includes('stroke="#'), "Must render stroke color");
    });

    it("5.1, 5.2, & 5.3 Extracts structured tables, paragraphs, and formats Markdown table", () =>
    {
        const buffer = createMockSdocxBuffer();
        const decomposed = decomposeSdocx(buffer);

        const extracted = extractContentFromXmlOrJson(decomposed.xmlOrJsonFiles);
        assert.ok(extracted.textParagraphs.length >= 2, "Should extract text paragraphs");
        assert.strictEqual(extracted.tables.length, 1, "Should extract 1 table");

        const mdTable = formatMarkdownTable(extracted.tables[0]);
        assert.ok(mdTable.includes("| Substrate | Km (mM) | Vmax (umol/s) |"));
        assert.ok(mdTable.includes("| --- | --- | --- |"));
        assert.ok(mdTable.includes("| Glucose | 0.15 | 42.5 |"));
        assert.ok(mdTable.includes("| Fructose | 1.20 | 18.3 |"));
    });

    it("6.1 Synthesizes unified Obsidian Markdown note with frontmatter and wikilinks", () =>
    {
        const note = synthesizeMarkdownNote({
            title: "Biochemistry Lecture Notes",
            sourceSdocxPath: ".curie/sdocx/1727638000000_Biochemistry_Lecture.sdocx",
            audioPaths: ["attachments/biochemistry_lecture_notes/lecture_recording.m4a"],
            imagePaths: ["attachments/biochemistry_lecture_notes/diagram_p1.png"],
            pages: [
                {
                    pageIndex: 1,
                    svgPath: "attachments/biochemistry_lecture_notes/handwriting_p1.svg",
                    transcription: {
                        text: "Enzyme kinetics notes",
                        confidence: 92,
                    },
                },
            ],
            paragraphs: ["Enzyme kinetics and active site thermodynamics."],
            tables: [
                {
                    headers: ["Substrate", "Km (mM)"],
                    rows: [["Glucose", "0.15"]],
                },
            ],
        });

        assert.ok(note.startsWith("---"), "Must start with frontmatter");
        assert.ok(note.includes('curie_type: "sdocx_note"'));
        assert.ok(note.includes("source_sdocx:"));
        assert.ok(note.includes("# Biochemistry Lecture Notes"));
        assert.ok(note.includes("![[attachments/biochemistry_lecture_notes/lecture_recording.m4a]]"));
        assert.ok(note.includes("![[attachments/biochemistry_lecture_notes/handwriting_p1.svg]]"));
        assert.ok(note.includes('<details open class="curie-transcription">'));
        assert.ok(note.includes("Enzyme kinetics notes"));
        assert.ok(note.includes("| Substrate | Km (mM) |"));
    });

    it("7.1 & 6.2 Executes full IngestService pipeline and persists assets in storage", async () =>
    {
        const storageService = new StorageService(testStorageDir);
        const fileRepo = new FileRepository();
        const jobRepo = new IngestionJobRepository();

        // Mock OCR service for deterministic unit testing
        const mockOcrService = {
            transcribeImage: async () => ({
                text: "Transcribed handwritten notes",
                confidence: 95,
                lines: [{ text: "Transcribed handwritten notes", confidence: 95 }],
                engine: "fallback" as const,
            }),
        } as any;

        const ingestService = new IngestService(jobRepo, fileRepo, storageService, mockOcrService);
        const worker = new IngestionQueueWorker(ingestService);
        ingestService.setWorker(worker);

        const mockBuffer = createMockSdocxBuffer();
        const job = await ingestService.enqueueJob(testVaultId, {
            buffer: mockBuffer,
            originalFileName: "Biochemistry_Lecture.sdocx",
        });

        assert.strictEqual(job.status, "queued");
        assert.ok(job.sourceFilePath?.includes(".curie/sdocx/"));

        // Verify raw source archive was preserved
        assert.ok(storageService.fileExists(testVaultId, job.sourceFilePath!));

        // Process job synchronously
        await ingestService.processJob(job.id);

        const updatedJob = await ingestService.getJob(job.id, testVaultId);
        assert.strictEqual(updatedJob?.status, "completed");
        assert.strictEqual(updatedJob?.progress, 100);
        assert.strictEqual(updatedJob?.stage, "completed");
        assert.ok(updatedJob?.targetNotePath);

        // Verify generated note exists in storage
        assert.ok(storageService.fileExists(testVaultId, updatedJob!.targetNotePath!));

        // Verify audio asset exists in attachments
        const slug = sanitizeSlug("Biochemistry Lecture Notes");
        assert.ok(storageService.fileExists(testVaultId, `attachments/${slug}/lecture_recording.m4a`));

        // Verify handwriting SVG exists in attachments
        assert.ok(storageService.fileExists(testVaultId, `attachments/${slug}/handwriting_p1.svg`));
    });

    it("7.2 & 7.3 Verifies Fastify HTTP REST endpoints for job enqueuing and inspection", async () =>
    {
        const app = buildApp();
        await app.ready();

        const sdocxBuffer = createMockSdocxBuffer();

        // 1. Enqueue job via POST /vaults/:vaultId/ingest/sdocx (base64 JSON)
        const postRes = await app.inject({
            method: "POST",
            url: `/vaults/${testVaultId}/ingest/sdocx`,
            headers: {
                "Authorization": `Bearer ${testToken}`,
                "Content-Type": "application/json",
            },
            payload: {
                contentBase64: sdocxBuffer.toString("base64"),
                originalFileName: "CellBiology.sdocx",
            },
        });

        assert.strictEqual(postRes.statusCode, 202);
        const postJson = JSON.parse(postRes.body);
        assert.strictEqual(postJson.success, true);
        assert.ok(postJson.jobId);
        const jobId = postJson.jobId;

        // 2. Query job status via GET /vaults/:vaultId/ingest/jobs/:jobId
        const getRes = await app.inject({
            method: "GET",
            url: `/vaults/${testVaultId}/ingest/jobs/${jobId}`,
            headers: {
                "Authorization": `Bearer ${testToken}`,
            },
        });

        assert.strictEqual(getRes.statusCode, 200);
        const getJson = JSON.parse(getRes.body);
        assert.strictEqual(getJson.success, true);
        assert.strictEqual(getJson.job.id, jobId);
        assert.ok(["queued", "processing", "completed"].includes(getJson.job.status));

        // 3. List jobs via GET /vaults/:vaultId/ingest/jobs
        const listRes = await app.inject({
            method: "GET",
            url: `/vaults/${testVaultId}/ingest/jobs`,
            headers: {
                "Authorization": `Bearer ${testToken}`,
            },
        });

        assert.strictEqual(listRes.statusCode, 200);
        const listJson = JSON.parse(listRes.body);
        assert.strictEqual(listJson.success, true);
        assert.ok(Array.isArray(listJson.jobs));
        assert.ok(listJson.jobs.length >= 1);

        await app.close();
    });
});
