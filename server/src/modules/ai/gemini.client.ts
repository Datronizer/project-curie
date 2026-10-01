import { GoogleGenAI } from "@google/genai";

export interface GeminiPart {
  text?: string;
  inlineData?: {
    mimeType: string;
    data: string; // base64
  };
  thought?: boolean;
}

export interface GeminiContent {
  role?: "user" | "model";
  parts: GeminiPart[];
}

export interface GeminiThinkingConfig {
  thinkingBudget?: number;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  maxOutputTokens?: number;
  thinkingConfig?: GeminiThinkingConfig;
}

export interface GeminiRequestPayload {
  contents: GeminiContent[];
  systemInstruction?: {
    parts: GeminiPart[];
  };
  generationConfig?: GeminiGenerationConfig;
}

export interface StreamEvent {
  type: "token" | "thought" | "error" | "done";
  text?: string;
  message?: string;
}

export interface ModelMetadata {
  id: string;
  name: string;
  description: string;
  supportsThinking: boolean;
  defaultThinkingEffort?: "off" | "low" | "medium" | "high";
  isFlagship?: boolean;
}

export const SUPPORTED_MODELS: ModelMetadata[] = [
  {
    id: "gemini-3.8-flash",
    name: "Gemini 3.8 Flash",
    description: "Next-gen flagship: Ultra-low latency, multimodal, native deep thinking.",
    supportsThinking: true,
    defaultThinkingEffort: "medium",
    isFlagship: true,
  },
  {
    id: "gemini-3.8-pro",
    name: "Gemini 3.8 Pro",
    description: "Deep analytical reasoning for advanced mathematics, coding, and multi-step derivations.",
    supportsThinking: true,
    defaultThinkingEffort: "high",
    isFlagship: true,
  },
  {
    id: "gemini-2.5-flash",
    name: "Gemini 2.5 Flash",
    description: "Fast multimodal model optimized for notes, lecture summaries, and high throughput.",
    supportsThinking: true,
    defaultThinkingEffort: "low",
  },
  {
    id: "gemini-2.0-flash",
    name: "Gemini 2.0 Flash",
    description: "Lightweight, reliable streaming with broad multimodal capabilities.",
    supportsThinking: true,
    defaultThinkingEffort: "low",
  },
  {
    id: "gemini-1.5-pro",
    name: "Gemini 1.5 Pro",
    description: "Massive 2M token context window for full textbooks, PDFs, and multi-semester vaults.",
    supportsThinking: false,
    defaultThinkingEffort: "off",
  },
];

export class GeminiClient {
  private ai: GoogleGenAI;

  constructor(apiKey: string) {
    this.ai = new GoogleGenAI({ apiKey });
  }

  public async *streamChat(
    model: string,
    payload: GeminiRequestPayload,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const cleanModel = model.trim().replace(/^models\//, "");

    try {
      if (signal?.aborted) return;

      const contents = payload.contents.map((c) => ({
        role: c.role || "user",
        parts: c.parts.map((p) => {
          if (p.inlineData) {
            return {
              inlineData: {
                mimeType: p.inlineData.mimeType,
                data: p.inlineData.data,
              },
            };
          }
          return { text: p.text || "" };
        }),
      }));

      const config: any = {};
      if (signal) {
        config.abortSignal = signal;
      }

      if (payload.systemInstruction?.parts?.length) {
        config.systemInstruction = {
          parts: payload.systemInstruction.parts.map((p) => ({
            text: p.text || "",
          })),
        };
      }

      if (payload.generationConfig?.thinkingConfig?.thinkingBudget !== undefined) {
        const budget = payload.generationConfig.thinkingConfig.thinkingBudget;
        if (budget > 0) {
          config.thinkingConfig = {
            includeThoughts: true,
            thinkingBudget: budget,
          };
        }
      }

      const streamResponse = await this.ai.models.generateContentStream({
        model: cleanModel,
        contents,
        config,
      });

      for await (const chunk of streamResponse) {
        if (signal?.aborted) return;

        const candidates = chunk.candidates || [];
        for (const candidate of candidates) {
          const parts = candidate.content?.parts || [];
          for (const part of parts) {
            if ((part as any).thought) {
              yield { type: "thought", text: (part as any).text || "" };
            } else if ((part as any).text) {
              yield { type: "token", text: (part as any).text };
            }
          }
        }
      }

      yield { type: "done" };
    } catch (err: any) {
      if (signal?.aborted) return;
      yield { type: "error", message: err?.message || String(err) };
    }
  }
}
