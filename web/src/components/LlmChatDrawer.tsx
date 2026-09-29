import { useState, useRef, useEffect } from "react";
import { api } from "../api/client";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LuSparkles,
  LuSend,
  LuX,
  LuTrash2,
  LuSettings,
  LuLoaderCircle,
  LuBookOpen,
  LuCheck,
  LuCopy,
} from "react-icons/lu";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
}

interface LlmChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeNotePath?: string | null;
  activeNoteContent?: string;
}

export default function LlmChatDrawer({
  isOpen,
  onClose,
  activeNotePath,
  activeNoteContent,
}: LlmChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);

  // Settings
  const [endpoint, setEndpoint] = useState("");
  const [model, setModel] = useState("llama3");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      setEndpoint(api.getLlmEndpoint());
      setModel(api.getLlmModel());
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  if (!isOpen) return null;

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || loading) return;

    const userMessage: Message = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setInput("");
    setLoading(true);

    try {
      const responseText = await api.queryLlm(
        textToSend,
        activeNoteContent || undefined,
        messages
      );

      const assistantMessage: Message = {
        role: "assistant",
        content: responseText,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err: any) {
      const errorMessage: Message = {
        role: "assistant",
        content: `**Error reaching local LLM:**\n${err.message || String(err)}\n\n*Check your LLM endpoint settings via the gear icon above.*`,
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    api.setLlmEndpoint(endpoint);
    api.setLlmModel(model);
    setShowSettings(false);
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const activeNoteName = activeNotePath?.split("/").pop() || null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 md:w-[420px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-200">
      {/* Drawer Header */}
      <div className="h-14 px-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2 text-indigo-400">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <LuSparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Ask Curie</h3>
            {activeNoteName ? (
              <p className="text-[10px] text-slate-400 truncate max-w-[180px] flex items-center gap-1">
                <LuBookOpen className="w-3 h-3 text-indigo-400/80" />
                <span>{activeNoteName}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 font-mono">
                {model || "Local LLM"}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className={`p-1.5 rounded-lg transition ${
              showSettings
                ? "bg-indigo-600/20 text-indigo-400"
                : "text-slate-400 hover:text-white hover:bg-slate-800"
            }`}
            title="Configure LLM Endpoint"
          >
            <LuSettings className="w-4 h-4" />
          </button>

          {messages.length > 0 && (
            <button
              onClick={() => setMessages([])}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              title="Clear conversation"
            >
              <LuTrash2 className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Close Assistant"
          >
            <LuX className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Settings Overlay View */}
      {showSettings ? (
        <div className="flex-1 p-5 overflow-y-auto space-y-4 bg-slate-900">
          <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
            Local LLM Configuration
          </h4>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              API Endpoint
            </label>
            <input
              type="text"
              placeholder="e.g. http://192.168.1.100:11434/api/chat"
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Supports Ollama (/api/chat) or OpenAI-compatible endpoints.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Model Name
            </label>
            <input
              type="text"
              placeholder="e.g. llama3:latest, mistral, gemma2"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
          </div>

          <div className="pt-3 flex justify-end space-x-2">
            <button
              onClick={() => setShowSettings(false)}
              className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition shadow-sm"
            >
              Save Settings
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4 text-xs">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center p-4 text-slate-500">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3">
                  <LuSparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-medium text-slate-300">
                  Ask Curie AI
                </p>
                <p className="text-xs text-slate-500 mt-1 max-w-xs">
                  Query, summarize, or extract key concepts from your notes with your local LLM.
                </p>

                {activeNoteContent && (
                  <div className="mt-6 w-full space-y-2">
                    <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider text-left">
                      Suggested prompts:
                    </p>
                    <button
                      onClick={() => handleSend("Summarize the key points of this note in bullet points.")}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white transition"
                    >
                      💡 Summarize key points
                    </button>
                    <button
                      onClick={() => handleSend("Generate 3 quiz questions with answers based on this note.")}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white transition"
                    >
                      ❓ Generate study questions
                    </button>
                    <button
                      onClick={() => handleSend("Explain the main formulas and tables in this note simply.")}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white transition"
                    >
                      📊 Explain formulas & tables
                    </button>
                  </div>
                )}
              </div>
            ) : (
              messages.map((m, idx) => (
                <div
                  key={idx}
                  className={`flex flex-col ${
                    m.role === "user" ? "items-end" : "items-start"
                  }`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl p-3.5 leading-relaxed ${
                      m.role === "user"
                        ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/20"
                        : "bg-slate-950 border border-slate-800 text-slate-200 shadow-sm"
                    }`}
                  >
                    {m.role === "assistant" ? (
                      <div className="prose prose-invert prose-indigo text-xs max-w-none space-y-2">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {m.content}
                        </ReactMarkdown>
                      </div>
                    ) : (
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    )}
                  </div>

                  {m.role === "assistant" && (
                    <button
                      onClick={() => handleCopy(m.content, idx)}
                      className="mt-1 text-[10px] text-slate-500 hover:text-slate-300 flex items-center space-x-1 px-1 transition"
                    >
                      {copiedIdx === idx ? (
                        <>
                          <LuCheck className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <LuCopy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-center space-x-2 text-slate-400 p-2">
                <LuLoaderCircle className="w-4 h-4 animate-spin text-indigo-400" />
                <span className="text-xs">Thinking...</span>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/80">
            <div className="flex items-end space-x-2 bg-slate-900 border border-slate-700/80 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500/40">
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeNoteName
                    ? `Ask about ${activeNoteName}...`
                    : "Ask anything about your notes..."
                }
                rows={1}
                className="flex-1 bg-transparent border-0 text-xs text-white placeholder-slate-500 focus:outline-none resize-none px-2 py-1 max-h-24 leading-relaxed"
              />
              <button
                type="button"
                onClick={() => handleSend()}
                disabled={!input.trim() || loading}
                className="w-7 h-7 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                title="Send message (Enter)"
              >
                <LuSend className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
