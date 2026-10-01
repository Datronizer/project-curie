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

  // Conversation list for vault
  app.get("/conversations", async (req: any, reply: any) => {
    const vaultId = req.params?.vaultId || req.query?.vaultId;
    if (!vaultId) {
      return reply.status(400).send({
        success: false,
        error: { message: "Vault ID is required", code: "BAD_REQUEST", status: 400 },
      });
    }
    const conversations = await app.aiConversationRepo.listByVault(vaultId);
    return {
      success: true,
      conversations,
    };
  });

  // Create new conversation explicitly
  app.post("/conversations", async (req: any, reply: any) => {
    const vaultId = req.params?.vaultId || req.body?.vaultId;
    const title = req.body?.title?.trim() || "New Chat";
    const model = req.body?.model?.trim() || "gemini-3.8-flash";

    if (!vaultId) {
      return reply.status(400).send({
        success: false,
        error: { message: "Vault ID is required", code: "BAD_REQUEST", status: 400 },
      });
    }

    const conversation = await app.aiConversationRepo.createConversation({
      vaultId,
      userId: req.authenticatedUser?.id,
      title,
      model,
    });

    return {
      success: true,
      conversation,
    };
  });

  // Get conversation with messages
  app.get("/conversations/:id", async (req: any, reply: any) => {
    const { id } = req.params;
    const vaultId = req.params?.vaultId;
    const result = await app.aiConversationRepo.getConversationWithMessages(id, vaultId);

    if (!result) {
      return reply.status(404).send({
        success: false,
        error: { message: "Conversation not found", code: "NOT_FOUND", status: 404 },
      });
    }

    return {
      success: true,
      conversation: result.conversation,
      messages: result.messages,
    };
  });

  // Update conversation title
  app.patch("/conversations/:id", async (req: any, reply: any) => {
    const { id } = req.params;
    const title = req.body?.title?.trim();

    if (!title) {
      return reply.status(400).send({
        success: false,
        error: { message: "Title is required", code: "BAD_REQUEST", status: 400 },
      });
    }

    const updated = await app.aiConversationRepo.updateTitle(id, title);
    if (!updated) {
      return reply.status(404).send({
        success: false,
        error: { message: "Conversation not found", code: "NOT_FOUND", status: 404 },
      });
    }

    return {
      success: true,
      conversation: updated,
    };
  });

  // Delete conversation
  app.delete("/conversations/:id", async (req: any, reply: any) => {
    const { id } = req.params;
    const vaultId = req.params?.vaultId;
    const deleted = await app.aiConversationRepo.delete(id, vaultId);

    if (!deleted) {
      return reply.status(404).send({
        success: false,
        error: { message: "Conversation not found", code: "NOT_FOUND", status: 404 },
      });
    }

    return {
      success: true,
      message: "Conversation deleted successfully",
    };
  });

  // Streaming chat endpoint (Server-Sent Events) with conversation persistence
  app.post("/chat", async (req: any, reply: any) => {
    const vaultId = req.params?.vaultId || req.body?.vaultId;
    const body = req.body || {};
    const prompt = body.prompt?.trim();
    const activeModel = body.model?.trim() || "gemini-3.8-flash";
    let conversationId = body.conversationId?.trim();

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

    // Persist conversation and message if vaultId is available
    if (vaultId) {
      try {
        if (!conversationId) {
          // Derive concise title from prompt
          const title = prompt.length > 45 ? `${prompt.slice(0, 42).trim()}...` : prompt;
          const newConv = await app.aiConversationRepo.createConversation({
            vaultId,
            userId: req.authenticatedUser?.id,
            title,
            model: activeModel,
          });
          conversationId = newConv.id;
        }

        // Build history from DB if not passed explicitly
        if (!body.history || body.history.length === 0) {
          const pastMessages = await app.aiConversationRepo.getMessages(conversationId);
          body.history = pastMessages.slice(-10).map((m) => ({
            role: m.role,
            content: m.content,
          }));
        }

        // Record user message
        await app.aiConversationRepo.addMessage({
          conversationId,
          role: "user",
          content: prompt,
          metadata: JSON.stringify({
            activeNotePath: body.activeNotePath || null,
            attachmentPaths: body.attachmentPaths || [],
          }),
        });
      } catch (err: any) {
        req.log.warn(`[AiRoutes] Failed to persist initial user message: ${err.message}`);
      }
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

    // Inform client of active conversation ID immediately
    if (conversationId) {
      reply.raw.write(
        `data: ${JSON.stringify({ type: "conversation", conversationId })}\n\n`
      );
    }

    let accumulatedText = "";
    let accumulatedThought = "";

    try {
      const stream = aiService.streamChat({
        vaultId: vaultId || "",
        prompt,
        model: activeModel,
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
        if (event.type === "token" && event.text) {
          accumulatedText += event.text;
        } else if (event.type === "thought" && event.text) {
          accumulatedThought += event.text;
        }

        if (event.type === "done") {
          reply.raw.write("data: [DONE]\n\n");
        } else {
          reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
        }
      }

      // Persist assistant message upon successful or partial streaming
      if (conversationId && (accumulatedText || accumulatedThought)) {
        try {
          await app.aiConversationRepo.addMessage({
            conversationId,
            role: "assistant",
            content: accumulatedText,
            thought: accumulatedThought || null,
            metadata: JSON.stringify({
              model: activeModel,
              thinkingEffort: body.thinkingEffort,
            }),
          });
        } catch (dbErr: any) {
          req.log.warn(`[AiRoutes] Failed to persist assistant message: ${dbErr.message}`);
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
