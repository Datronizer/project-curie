import { Readable } from "node:stream";

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
  private baseUrl: string = "https://generativelanguage.googleapis.com/v1beta";

  constructor(private apiKey: string) {}

  public async *streamChat(
    model: string,
    payload: GeminiRequestPayload,
    signal?: AbortSignal
  ): AsyncGenerator<StreamEvent> {
    const cleanModel = model.trim().replace(/^models\//, "");
    const url = `${this.baseUrl}/models/${encodeURIComponent(cleanModel)}:streamGenerateContent?alt=sse&key=${this.apiKey}`;

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(payload),
      signal,
    });

    if (!res.ok) {
      let errorMsg = `Gemini API returned status ${res.status}`;
      try {
        const errorJson = await res.json();
        if (errorJson?.error?.message) {
          errorMsg = errorJson.error.message;
        }
      } catch {
        const text = await res.text().catch(() => "");
        if (text) errorMsg = text;
      }
      yield { type: "error", message: errorMsg };
      return;
    }

    if (!res.body) {
      yield { type: "error", message: "No response stream received from Gemini API" };
      return;
    }

    // Process SSE stream
    const reader = res.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data:")) continue;

          const dataPayload = trimmed.slice(5).trim();
          if (dataPayload === "[DONE]") {
            yield { type: "done" };
            return;
          }

          try {
            const parsed = JSON.parse(dataPayload);
            const candidates = parsed?.candidates || [];
            for (const candidate of candidates) {
              const parts: GeminiPart[] = candidate?.content?.parts || [];
              for (const part of parts) {
                if (part.thought) {
                  yield { type: "thought", text: part.text || "" };
                } else if (part.text) {
                  yield { type: "token", text: part.text };
                }
              }
            }
          } catch (err) {
            // Ignore malformed intermediate JSON chunks
          }
        }
      }

      // Flush remaining buffer
      if (buffer.trim().startsWith("data:")) {
        const dataPayload = buffer.trim().slice(5).trim();
        if (dataPayload !== "[DONE]") {
          try {
            const parsed = JSON.parse(dataPayload);
            const candidates = parsed?.candidates || [];
            for (const candidate of candidates) {
              const parts: GeminiPart[] = candidate?.content?.parts || [];
              for (const part of parts) {
                if (part.thought) {
                  yield { type: "thought", text: part.text || "" };
                } else if (part.text) {
                  yield { type: "token", text: part.text };
                }
              }
            }
          } catch {}
        }
      }
    } finally {
      reader.releaseLock();
    }

    yield { type: "done" };
  }
}
