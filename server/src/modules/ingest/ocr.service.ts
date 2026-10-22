import { createWorker } from "tesseract.js";
import { Resvg } from "@resvg/resvg-js";
import { GoogleGenAI } from "@google/genai";

export interface TranscribedLine
{
    text: string;
    confidence: number;
}

export interface TranscriptionResult
{
    text: string;
    confidence: number;
    lines: TranscribedLine[];
    engine: "gemini" | "vision-llm" | "tesseract" | "fallback";
}

function isValidRasterImage(buf: Buffer): boolean
{
    if (!buf || buf.length < 8) return false;
    // PNG signature: 89 50 4E 47
    if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return true;
    // JPEG signature: FF D8 FF
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;
    // BMP signature: 42 4D
    if (buf[0] === 0x42 && buf[1] === 0x4d) return true;
    // WebP signature: RIFF....WEBP
    if (buf.length >= 12 && buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return true;
    return false;
}

export class OcrService
{
    private ollamaEndpoint?: string;
    private ollamaModel?: string;
    private geminiClient?: GoogleGenAI;

    constructor()
    {
        this.ollamaEndpoint = process.env.OLLAMA_HOST || process.env.OLLAMA_BASE_URL || process.env.LLM_ENDPOINT;
        this.ollamaModel = process.env.OLLAMA_VISION_MODEL || "llava";

        const geminiApiKey = process.env.GEMINI_API_KEY;
        if (geminiApiKey)
        {
            this.geminiClient = new GoogleGenAI({ apiKey: geminiApiKey });
        }
    }

    /**
     * Transcribes an SVG string by rasterizing it to PNG and running OCR.
     */
    public async transcribeSvg(
        svgString: string,
        options?: { minConfidence?: number; pageIndex?: number }
    ): Promise<TranscriptionResult>
    {
        try
        {
            const resvg = new Resvg(svgString, {
                fitTo: { mode: "width", value: 1200 },
                font: { loadSystemFonts: true },
            });
            const pngBuffer = resvg.render().asPng();
            return this.transcribeImage(pngBuffer, options);
        }
        catch (err)
        {
            console.warn(`[OCR] Failed to rasterize SVG for OCR on page ${options?.pageIndex}:`, err);
            return {
                text: "",
                confidence: 0,
                lines: [],
                engine: "fallback",
            };
        }
    }

    /**
     * Transcribes an image or raster buffer using Gemini Vision, local Vision LLM,
     * or local lightweight Tesseract OCR.
     */
    public async transcribeImage(
        imageBuffer: Buffer,
        options?: { minConfidence?: number; pageIndex?: number }
    ): Promise<TranscriptionResult>
    {
        const minConfidence = options?.minConfidence ?? 30;

        if (!isValidRasterImage(imageBuffer))
        {
            return {
                text: "",
                confidence: 0,
                lines: [],
                engine: "fallback",
            };
        }

        // 1. Try Gemini Vision if configured
        if (this.geminiClient)
        {
            try
            {
                const geminiResult = await this.transcribeWithGemini(imageBuffer);
                if (geminiResult && geminiResult.text.trim())
                {
                    return geminiResult;
                }
            }
            catch (geminiErr)
            {
                console.warn("[OCR] Gemini transcription skipped or failed, falling back to local OCR:", geminiErr);
            }
        }

        // 2. Try local Vision LLM if configured
        if (this.ollamaEndpoint)
        {
            try
            {
                const llmResult = await this.transcribeWithVisionLlm(imageBuffer);
                if (llmResult && llmResult.text.trim())
                {
                    return llmResult;
                }
            }
            catch (err)
            {
                console.warn("[OCR] Vision LLM transcription skipped or failed, falling back to local Tesseract:", err);
            }
        }

        // 3. Tesseract.js local worker
        let worker: any = null;
        try
        {
            worker = await createWorker("eng");
            const ret = await worker.recognize(imageBuffer);
            await worker.terminate();
            worker = null;

            const overallConfidence = ret.data.confidence || 0;
            const rawText = (ret.data.text || "").trim();
            const textLines = rawText.split("\n").map((l: string) => l.trim()).filter(Boolean);

            const lines: TranscribedLine[] = textLines.map((lineText: string) => ({
                text: lineText,
                confidence: overallConfidence,
            }));

            return {
                text: rawText,
                confidence: overallConfidence,
                lines,
                engine: "tesseract",
            };
        }
        catch (err)
        {
            console.warn("[OCR] Tesseract recognition failed on page image:", err);
            if (worker)
            {
                try { await worker.terminate(); } catch {}
            }
            return {
                text: "",
                confidence: 0,
                lines: [],
                engine: "fallback",
            };
        }
    }

    /**
     * Gemini Vision transcription using gemini-2.5-flash
     */
    private async transcribeWithGemini(imageBuffer: Buffer): Promise<TranscriptionResult | null>
    {
        if (!this.geminiClient) return null;

        const base64Image = imageBuffer.toString("base64");
        const mimeType = imageBuffer[0] === 0x89 ? "image/png" : "image/jpeg";

        const response = await this.geminiClient.models.generateContent({
            model: "gemini-2.5-flash",
            contents: [
                {
                    role: "user",
                    parts: [
                        {
                            inlineData: {
                                mimeType,
                                data: base64Image,
                            },
                        },
                        {
                            text: "Transcribe all handwritten and typed text from this note page accurately. Preserve line breaks. Output ONLY the extracted text with no introductory or explanatory remarks.",
                        },
                    ],
                },
            ],
        });

        const text = (response.text || "").trim();
        if (!text) return null;

        const lines = text.split("\n").map((line) => ({
            text: line.trim(),
            confidence: 95,
        })).filter((l) => l.text.length > 0);

        return {
            text,
            confidence: 95,
            lines,
            engine: "gemini",
        };
    }

    /**
     * Optional local Vision LLM transcription hook (e.g. Ollama llava / minicpm-v)
     */
    private async transcribeWithVisionLlm(imageBuffer: Buffer): Promise<TranscriptionResult | null>
    {
        if (!this.ollamaEndpoint) return null;

        const base64Image = imageBuffer.toString("base64");
        const url = `${this.ollamaEndpoint.replace(/\/+$/, "")}/api/generate`;

        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                model: this.ollamaModel,
                prompt: "Transcribe all handwritten and typed text from this note page accurately. Preserve line breaks. Output ONLY the extracted text with no introductory or explanatory remarks.",
                images: [base64Image],
                stream: false,
            }),
        });

        if (!response.ok)
        {
            throw new Error(`Ollama returned status ${response.status}`);
        }

        const data = (await response.json()) as { response?: string };
        const text = (data.response || "").trim();

        if (!text) return null;

        const lines = text.split("\n").map((line) => ({
            text: line.trim(),
            confidence: 90,
        })).filter((l) => l.text.length > 0);

        return {
            text,
            confidence: 90,
            lines,
            engine: "vision-llm",
        };
    }
}
