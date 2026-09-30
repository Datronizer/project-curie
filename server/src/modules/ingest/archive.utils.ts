import AdmZip from "adm-zip";
import path from "node:path";

export interface ExtractedMedia
{
    originalPath: string;
    fileName: string;
    buffer: Buffer;
    mimeType: string;
}

export interface ExtractedStrokeFile
{
    originalPath: string;
    pageIndex: number;
    buffer: Buffer;
}

export interface DecomposedSdocx
{
    rawEntries: Map<string, Buffer>;
    audioFiles: ExtractedMedia[];
    imageFiles: ExtractedMedia[];
    strokeFiles: ExtractedStrokeFile[];
    xmlOrJsonFiles: { path: string; text: string }[];
}

export function sanitizeSlug(name: string): string
{
    const base = path.parse(name).name;
    const cleaned = base
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "_")
        .replace(/_+/g, "_")
        .replace(/^_|_$/g, "");
    return cleaned || "note";
}

export function getMimeType(filename: string): string
{
    const ext = path.extname(filename).toLowerCase();
    switch (ext)
    {
        case ".m4a": return "audio/mp4";
        case ".aac": return "audio/aac";
        case ".mp3": return "audio/mpeg";
        case ".wav": return "audio/wav";
        case ".ogg": return "audio/ogg";
        case ".png": return "image/png";
        case ".jpg":
        case ".jpeg": return "image/jpeg";
        case ".gif": return "image/gif";
        case ".webp": return "image/webp";
        case ".svg": return "image/svg+xml";
        default: return "application/octet-stream";
    }
}

export function unzipArchive(buffer: Buffer): Map<string, Buffer>
{
    const zip = new AdmZip(buffer);
    const zipEntries = zip.getEntries();
    const result = new Map<string, Buffer>();

    for (const entry of zipEntries)
    {
        if (!entry.isDirectory)
        {
            result.set(entry.entryName.replace(/\\/g, "/"), entry.getData());
        }
    }

    return result;
}

export function decomposeSdocx(buffer: Buffer): DecomposedSdocx
{
    const rawEntries = unzipArchive(buffer);
    const audioFiles: ExtractedMedia[] = [];
    const imageFiles: ExtractedMedia[] = [];
    const strokeFiles: ExtractedStrokeFile[] = [];
    const xmlOrJsonFiles: { path: string; text: string }[] = [];

    const audioExtensions = new Set([".m4a", ".aac", ".mp3", ".wav", ".ogg"]);
    const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".bmp"]);

    let strokeIndexCounter = 1;

    for (const [entryPath, data] of rawEntries.entries())
    {
        const ext = path.extname(entryPath).toLowerCase();
        const base = path.basename(entryPath);

        if (audioExtensions.has(ext))
        {
            audioFiles.push({
                originalPath: entryPath,
                fileName: base,
                buffer: data,
                mimeType: getMimeType(base),
            });
        }
        else if (imageExtensions.has(ext))
        {
            imageFiles.push({
                originalPath: entryPath,
                fileName: base,
                buffer: data,
                mimeType: getMimeType(base),
            });
        }
        else if (
            ext === ".page" ||
            entryPath.includes("drawing/") ||
            entryPath.includes("stroke/") ||
            base.includes("stroke") ||
            base.startsWith("page_")
        )
        {
            // Extract page number if present in filename, e.g. page_01.page -> 1
            const match = base.match(/(?:page[_-]?|p)(\d+)/i);
            const pageIndex = match ? parseInt(match[1], 10) : strokeIndexCounter++;

            strokeFiles.push({
                originalPath: entryPath,
                pageIndex,
                buffer: data,
            });
        }
        else if (ext === ".xml" || ext === ".json")
        {
            try
            {
                xmlOrJsonFiles.push({
                    path: entryPath,
                    text: data.toString("utf-8"),
                });
            }
            catch
            {
                // Binary or corrupted text ignored
            }
        }
    }

    // Sort strokes by pageIndex
    strokeFiles.sort((a, b) => a.pageIndex - b.pageIndex);

    return {
        rawEntries,
        audioFiles,
        imageFiles,
        strokeFiles,
        xmlOrJsonFiles,
    };
}
