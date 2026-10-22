import fs from "node:fs";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";

export interface SdocxParsedPage
{
    pageIndex: number;
    svg: string;
    pngBuffer: Buffer;
    typedText?: string;
}

export interface SdocxParsedDocument
{
    title: string;
    pageCount: number;
    pages: SdocxParsedPage[];
    createdMs?: number;
    modifiedMs?: number;
    pageDimensions?: [number, number];
}

let sdocxEngine: any = null;
let isInitialized = false;

/**
 * Initializes the @twango/sdocx WebAssembly engine if not already loaded.
 */
export async function getSdocxEngine(): Promise<any>
{
    if (sdocxEngine && isInitialized)
    {
        return sdocxEngine;
    }

    try
    {
        const dynamicImport = new Function("specifier", "return import(specifier)");
        sdocxEngine = await dynamicImport("@twango/sdocx");

        const pkgDir = path.dirname(require.resolve("@twango/sdocx/package.json"));
        const wasmPath = path.join(pkgDir, "sdocx_bg.wasm");

        if (!fs.existsSync(wasmPath))
        {
            throw new Error(`sdocx_bg.wasm not found at ${wasmPath}`);
        }

        const wasmBuffer = fs.readFileSync(wasmPath);
        await sdocxEngine.default({ module_or_path: wasmBuffer });
        isInitialized = true;
        return sdocxEngine;
    }
    catch (err)
    {
        console.error("[SdocxParser] Failed to initialize @twango/sdocx WASM engine:", err);
        throw err;
    }
}

/**
 * Parses a Samsung Notes .sdocx archive buffer using the native reverse-engineered engine.
 * Generates vector SVGs and rasterized PNG buffers for each visible page.
 */
export async function parseSdocxArchive(buffer: Buffer): Promise<SdocxParsedDocument>
{
    const sdocx = await getSdocxEngine();

    const uint8Array = new Uint8Array(buffer);
    const session = new sdocx.DocumentSession(uint8Array);
    const doc = sdocx.parse(uint8Array);

    const title = doc.metadata?.note_title?.text?.trim() || "";
    const createdMs = doc.metadata?.created_ms;
    const modifiedMs = doc.metadata?.modified_ms;
    const pageDimensions = doc.metadata?.page_dimensions;

    const pageCount = session.page_count;
    const pages: SdocxParsedPage[] = [];

    for (let i = 0; i < pageCount; i++)
    {
        const pageIndex = i + 1;
        // Render high-fidelity SVG with paper styling, ink strokes, and placed images
        const svg = session.render_svg(i, "light");

        // Rasterize SVG to high-resolution PNG for OCR detection
        let pngBuffer: Buffer;
        try
        {
            const resvg = new Resvg(svg, {
                fitTo: { mode: "width", value: 1200 },
                font: {
                    loadSystemFonts: true,
                },
            });
            pngBuffer = resvg.render().asPng();
        }
        catch (rasterErr)
        {
            console.warn(`[SdocxParser] SVG rasterization warning on page ${pageIndex}:`, rasterErr);
            pngBuffer = Buffer.alloc(0);
        }

        // Extract any typed text attached to the page if available
        let typedText: string | undefined;
        if (doc.pages && doc.pages[i])
        {
            const pageObj = doc.pages[i];
            const textParts: string[] = [];
            for (const obj of pageObj.objects || [])
            {
                if (obj.content?.TextBox?.text?.trim())
                {
                    textParts.push(obj.content.TextBox.text.trim());
                }
            }
            if (textParts.length > 0)
            {
                typedText = textParts.join("\n\n");
            }
        }

        pages.push({
            pageIndex,
            svg,
            pngBuffer,
            typedText,
        });
    }

    return {
        title,
        pageCount,
        pages,
        createdMs,
        modifiedMs,
        pageDimensions,
    };
}
