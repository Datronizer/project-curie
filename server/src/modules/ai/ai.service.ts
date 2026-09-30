import path from "node:path";
import { StorageService } from "../storage/storage.service";
import { FileRepository } from "../../db/repositories/file.repository";
import {
  GeminiClient,
  GeminiContent,
  GeminiPart,
  GeminiRequestPayload,
  StreamEvent,
  SUPPORTED_MODELS,
  ModelMetadata,
} from "./gemini.client";

export type ThinkingEffort = "off" | "low" | "medium" | "high";

export interface ChatRequestOptions {
  vaultId: string;
  prompt: string;
  model?: string;
  thinkingEffort?: ThinkingEffort;
  activeNotePath?: string;
  attachmentPaths?: string[];
  history?: Array<{ role: "user" | "assistant" | "system"; content: string }>;
  signal?: AbortSignal;
}

export class AiService {
  private geminiClient: GeminiClient | null = null;

  constructor(
    private storageService: StorageService,
    private fileRepo: FileRepository
  ) {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (apiKey) {
      this.geminiClient = new GeminiClient(apiKey);
    }
  }

  public isConfigured(): boolean {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    return Boolean(apiKey);
  }

  public getModels(): ModelMetadata[] {
    return SUPPORTED_MODELS;
  }

  private mapThinkingBudget(effort?: ThinkingEffort): number | undefined {
    switch (effort) {
      case "high":
        return 16384;
      case "medium":
        return 4096;
      case "low":
        return 1024;
      case "off":
      default:
        return 0;
    }
  }

  private getMimeType(filePath: string): string {
    const ext = filePath.split(".").pop()?.toLowerCase();
    switch (ext) {
      case "pdf":
        return "application/pdf";
      case "png":
        return "image/png";
      case "jpg":
      case "jpeg":
        return "image/jpeg";
      case "gif":
        return "image/gif";
      case "webp":
        return "image/webp";
      case "svg":
        return "image/svg+xml";
      case "mp3":
        return "audio/mp3";
      case "m4a":
      case "aac":
        return "audio/mp4";
      case "wav":
        return "audio/wav";
      default:
        return "application/octet-stream";
    }
  }

  public async *streamChat(options: ChatRequestOptions): AsyncGenerator<StreamEvent> {
    const apiKey = process.env.GEMINI_API_KEY?.trim();
    if (!apiKey) {
      yield {
        type: "error",
        message:
          "Gemini API key is not configured. Please add GEMINI_API_KEY to server/.env on your server rack.",
      };
      return;
    }

    const client = this.geminiClient || new GeminiClient(apiKey);
    const model = options.model?.trim() || "gemini-3.8-flash";
    const thinkingBudget = this.mapThinkingBudget(options.thinkingEffort);

    // 1. Assemble system instructions and active note context
    let systemText =
      "You are Curie AI, an intelligent study, lecture, and research assistant. " +
      "Provide clear, well-structured Markdown responses. If note context or attachments are provided, " +
      "prioritize factual details from them to directly answer the user's questions.";

    if (options.activeNotePath) {
      try {
        const fileStats = this.storageService.getFileStats(options.vaultId, options.activeNotePath);
        if (fileStats.size < 5 * 1024 * 1024) {
          // Read up to 5MB note
          const stream = this.storageService.getFileReadStream(options.vaultId, options.activeNotePath);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const noteText = Buffer.concat(chunks).toString("utf-8");
          systemText += `\n\n=== Active Note: ${options.activeNotePath} ===\n${noteText}\n=== End Active Note ===`;
        }
      } catch (err: any) {
        console.warn(`[AiService] Could not load active note ${options.activeNotePath}:`, err.message);
      }
    }

    // 2. Build conversation history
    const contents: GeminiContent[] = [];

    if (options.history && options.history.length > 0) {
      for (const msg of options.history) {
        if (msg.role === "system") continue;
        contents.push({
          role: msg.role === "assistant" ? "model" : "user",
          parts: [{ text: msg.content }],
        });
      }
    }

    // 3. Assemble current user prompt and attached multimodal files
    const userParts: GeminiPart[] = [];

    if (options.attachmentPaths && options.attachmentPaths.length > 0) {
      for (const attachPath of options.attachmentPaths) {
        try {
          const stats = this.storageService.getFileStats(options.vaultId, attachPath);
          if (stats.size > 30 * 1024 * 1024) {
            userParts.push({
              text: `[Attachment ${attachPath} omitted: file size exceeds 30MB limit]`,
            });
            continue;
          }

          const mimeType = this.getMimeType(attachPath);
          const stream = this.storageService.getFileReadStream(options.vaultId, attachPath);
          const chunks: Buffer[] = [];
          for await (const chunk of stream) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
          }
          const buffer = Buffer.concat(chunks);

          if (mimeType.startsWith("image/") || mimeType === "application/pdf" || mimeType.startsWith("audio/")) {
            userParts.push({
              inlineData: {
                mimeType,
                data: buffer.toString("base64"),
              },
            });
          } else {
            // Text or markdown document
            const textContent = buffer.toString("utf-8");
            userParts.push({
              text: `=== Attached File: ${attachPath} ===\n${textContent}\n=== End Attached File ===`,
            });
          }
        } catch (err: any) {
          console.warn(`[AiService] Failed to load attachment ${attachPath}:`, err.message);
          userParts.push({
            text: `[Could not load attachment: ${attachPath}]`,
          });
        }
      }
    }

    // Append user prompt text
    userParts.push({ text: options.prompt });
    contents.push({
      role: "user",
      parts: userParts,
    });

    // 4. Build payload with optional thinking config
    const payload: GeminiRequestPayload = {
      contents,
      systemInstruction: {
        parts: [{ text: systemText }],
      },
    };

    if (thinkingBudget !== undefined && thinkingBudget > 0) {
      payload.generationConfig = {
        thinkingConfig: {
          thinkingBudget,
        },
      };
    }

    // 5. Stream from Gemini
    yield* client.streamChat(model, payload, options.signal);
  }
}
