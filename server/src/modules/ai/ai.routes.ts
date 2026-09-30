import { FastifyInstance } from "fastify";
import { AiService } from "./ai.service";

export default async function aiRoutes(app: FastifyInstance) {
  const aiService = new AiService(app.storageService, app.fileRepo);

  // Model catalog
  app.get("/models", async () => {
    return {
      success: true,
      configured: aiService.isConfigured(),
      models: aiService.getModels(),
    };
  });

  // Streaming chat endpoint (Server-Sent Events)
  app.post("/chat", async (req: any, reply: any) => {
    const vaultId = req.params?.vaultId;
    const body = req.body || {};
    const prompt = body.prompt?.trim();

    if (!prompt) {
      return reply.status(400).send({
        success: false,
        error: { message: "Prompt is required", code: "BAD_REQUEST", status: 400 },
      });
    }

    if (!aiService.isConfigured()) {
      return reply.status(503).send({
        success: false,
        error: {
          message:
            "Gemini API key is not configured. Please add GEMINI_API_KEY to server/.env on your server rack.",
          code: "SERVICE_UNAVAILABLE",
          status: 503,
        },
      });
    }

    reply.hijack();

    const abortController = new AbortController();
    reply.raw.on("close", () => {
      if (!reply.raw.writableEnded) {
        abortController.abort();
      }
    });

    // Write SSE headers directly
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });

    try {
      const stream = aiService.streamChat({
        vaultId: vaultId || body.vaultId || "",
        prompt,
        model: body.model,
        thinkingEffort: body.thinkingEffort,
        activeNotePath: body.activeNotePath,
        attachmentPaths: body.attachmentPaths,
        history: body.history,
        signal: abortController.signal,
      });

      for await (const event of stream) {
        if (reply.raw.writableEnded || reply.raw.destroyed) {
          break;
        }
        if (event.type === "done") {
          reply.raw.write("data: [DONE]\n\n");
        } else {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }
    } catch (err: any) {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.write(
          `data: ${JSON.stringify({ type: "error", message: err.message || String(err) })}\n\n`
        );
      }
    } finally {
      if (!reply.raw.writableEnded && !reply.raw.destroyed) {
        reply.raw.end();
      }
    }
  });
}
