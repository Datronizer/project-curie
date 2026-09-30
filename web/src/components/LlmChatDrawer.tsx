import { useState, useRef, useEffect, useMemo } from "react";
import { api, TreeNode } from "../api/client";
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
  LuPaperclip,
  LuSquare,
  LuFilePlus,
  LuArrowDownToLine,
  LuBrain,
  LuFileText,
  LuSearch,
} from "react-icons/lu";
import { TbFileTypePdf } from "react-icons/tb";

interface Message {
  role: "user" | "assistant" | "system";
  content: string;
  thought?: string;
  attachments?: string[];
}

interface LlmChatDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  vaultId?: string;
  activeNotePath?: string | null;
  activeNoteContent?: string;
  tree?: TreeNode[];
  onAppendToNote?: (content: string) => Promise<void> | void;
  onCreateNote?: (path: string, content?: string) => Promise<void> | void;
}

export default function LlmChatDrawer({
  isOpen,
  onClose,
  vaultId,
  activeNotePath,
  activeNoteContent,
  tree = [],
  onAppendToNote,
  onCreateNote,
}: LlmChatDrawerProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showAttachModal, setShowAttachModal] = useState(false);
  const [selectedAttachments, setSelectedAttachments] = useState<string[]>([]);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const [appendedIdx, setAppendedIdx] = useState<number | null>(null);
  const [savedIdx, setSavedIdx] = useState<number | null>(null);

  // Settings
  const [provider, setProvider] = useState<"gemini" | "ollama">("gemini");
  const [model, setModel] = useState<string>("gemini-3.8-flash");
  const [customModel, setCustomModel] = useState<string>("");
  const [thinkingEffort, setThinkingEffort] = useState<"off" | "low" | "medium" | "high">("medium");
  const [includeActiveNote, setIncludeActiveNote] = useState<boolean>(true);
  const [searchAttachQuery, setSearchAttachQuery] = useState<string>("");

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (isOpen) {
      setProvider(api.getAiProvider());
      setModel(api.getAiModel());
      setThinkingEffort(api.getAiThinkingEffort());
      setTimeout(() => inputRef.current?.focus(), 150);
    }
  }, [isOpen]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Flatten tree for attachment picker
  const allVaultFiles = useMemo(() => {
    const list: { path: string; name: string; ext: string }[] = [];
    const walk = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") {
          const ext = node.name.split(".").pop()?.toLowerCase() || "";
          list.push({ path: node.path, name: node.name, ext });
        } else if (node.type === "dir" && node.children) {
          walk(node.children);
        }
      }
    };
    walk(tree);
    return list;
  }, [tree]);

  const filteredAttachFiles = useMemo(() => {
    if (!searchAttachQuery.trim()) return allVaultFiles;
    const q = searchAttachQuery.toLowerCase();
    return allVaultFiles.filter(
      (f) => f.name.toLowerCase().includes(q) || f.path.toLowerCase().includes(q)
    );
  }, [allVaultFiles, searchAttachQuery]);

  if (!isOpen) return null;

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setLoading(false);
  };

  const handleSend = async (customPrompt?: string) => {
    const textToSend = customPrompt || input.trim();
    if (!textToSend || loading) return;

    const attachmentsForThisMsg = [...selectedAttachments];
    const userMessage: Message = {
      role: "user",
      content: textToSend,
      attachments: attachmentsForThisMsg.length > 0 ? attachmentsForThisMsg : undefined,
    };

    setMessages((prev) => [...prev, userMessage]);
    if (!customPrompt) setInput("");
    setSelectedAttachments([]);
    setLoading(true);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    // Placeholder assistant message for streaming
    const assistantIndex = messages.length + 1;
    let accumulatedText = "";
    let accumulatedThought = "";

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", thought: "" },
    ]);

    try {
      const activeModel = model === "custom" ? customModel.trim() || "gemini-3.8-flash" : model;

      await api.streamAiChat({
        vaultId,
        prompt: textToSend,
        model: activeModel,
        thinkingEffort,
        activeNotePath: includeActiveNote ? activeNotePath || undefined : undefined,
        attachmentPaths: attachmentsForThisMsg,
        history: messages.slice(-8), // Send last 8 context messages
        signal: abortController.signal,
        onToken: (tok) => {
          accumulatedText += tok;
          setMessages((prev) => {
            const next = [...prev];
            if (next[assistantIndex]) {
              next[assistantIndex] = {
                ...next[assistantIndex],
                content: accumulatedText,
                thought: accumulatedThought || undefined,
              };
            }
            return next;
          });
        },
        onThought: (th) => {
          accumulatedThought += th;
          setMessages((prev) => {
            const next = [...prev];
            if (next[assistantIndex]) {
              next[assistantIndex] = {
                ...next[assistantIndex],
                content: accumulatedText,
                thought: accumulatedThought,
              };
            }
            return next;
          });
        },
        onError: (err) => {
          accumulatedText += `\n\n> ⚠️ **Error:** ${err}`;
          setMessages((prev) => {
            const next = [...prev];
            if (next[assistantIndex]) {
              next[assistantIndex] = {
                ...next[assistantIndex],
                content: accumulatedText,
              };
            }
            return next;
          });
        },
      });
    } catch (err: any) {
      if (err.name !== "AbortError") {
        setMessages((prev) => {
          const next = [...prev];
          if (next[assistantIndex]) {
            next[assistantIndex] = {
              ...next[assistantIndex],
              content: `**Error reaching Curie AI:**\n${err.message || String(err)}\n\n*Ensure GEMINI_API_KEY is configured in server/.env.*`,
            };
          }
          return next;
        });
      }
    } finally {
      setLoading(false);
      abortControllerRef.current = null;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSaveSettings = () => {
    api.setAiProvider(provider);
    api.setAiModel(model === "custom" ? customModel : model);
    api.setAiThinkingEffort(thinkingEffort);
    setShowSettings(false);
  };

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(null), 2000);
  };

  const handleAppend = async (text: string, idx: number) => {
    if (onAppendToNote) {
      await onAppendToNote(text);
      setAppendedIdx(idx);
      setTimeout(() => setAppendedIdx(null), 2000);
    }
  };

  const handleSaveAsNewNote = async (text: string, idx: number) => {
    const baseName = activeNotePath?.split("/").pop()?.replace(/\.md$/, "") || "Curie-Summary";
    const suggestedTitle = `AI-Summary-${baseName}.md`;
    const noteName = prompt("Enter note name to create in vault:", suggestedTitle);
    if (!noteName) return;

    if (onCreateNote) {
      await onCreateNote(noteName, text);
      setSavedIdx(idx);
      setTimeout(() => setSavedIdx(null), 2000);
    }
  };

  const toggleAttachment = (path: string) => {
    setSelectedAttachments((prev) =>
      prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]
    );
  };

  const activeNoteName = activeNotePath?.split("/").pop() || null;

  return (
    <div className="fixed inset-y-0 right-0 z-40 w-full sm:w-96 md:w-[460px] bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col transition-transform duration-200">
      {/* Drawer Header */}
      <div className="h-14 px-4 border-b border-slate-800 bg-slate-950/70 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center space-x-2 text-indigo-400">
          <div className="w-8 h-8 rounded-lg bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center">
            <LuSparkles className="w-4 h-4 text-indigo-400" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white flex items-center gap-1.5">
              <span>Curie AI</span>
              <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                {model === "custom" ? customModel || "custom" : model.replace("gemini-", "")}
              </span>
            </h3>
            {activeNoteName ? (
              <p className="text-[10px] text-slate-400 truncate max-w-[200px] flex items-center gap-1">
                <LuBookOpen className="w-3 h-3 text-indigo-400/80 flex-shrink-0" />
                <span className="truncate">{activeNoteName}</span>
              </p>
            ) : (
              <p className="text-[10px] text-slate-500 font-mono">Vault Assistant</p>
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
            title="Configure Gemini Model & Thinking Effort"
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
        <div className="flex-1 p-5 overflow-y-auto space-y-5 bg-slate-900 text-xs">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <h4 className="font-bold text-slate-200 uppercase tracking-wider text-[11px]">
              AI Provider & Models
            </h4>
            <span className="text-[10px] text-indigo-400 font-mono">Google Gemini</span>
          </div>

          {/* Provider Toggle */}
          <div>
            <label className="block font-medium text-slate-300 mb-1.5">Provider</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setProvider("gemini")}
                className={`py-2 px-3 rounded-xl border text-left font-medium transition ${
                  provider === "gemini"
                    ? "bg-indigo-600/20 border-indigo-500 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold">Google Gemini</div>
                <div className="text-[10px] opacity-75 font-normal">Active (Server .env)</div>
              </button>
              <button
                type="button"
                onClick={() => setProvider("ollama")}
                className={`py-2 px-3 rounded-xl border text-left font-medium transition ${
                  provider === "ollama"
                    ? "bg-amber-600/20 border-amber-500 text-white"
                    : "bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200"
                }`}
              >
                <div className="font-semibold">Local Ollama</div>
                <div className="text-[10px] opacity-75 font-normal">Server Rack</div>
              </button>
            </div>
            {provider === "ollama" && (
              <div className="mt-2.5 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-[11px] leading-relaxed">
                ⚠️ Local Ollama is not configured on this server. Please contact your administrator (Sienna) to enable local models.
              </div>
            )}
          </div>

          {/* Model Selector */}
          <div>
            <label className="block font-medium text-slate-300 mb-1.5">Model</label>
            <select
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              <option value="gemini-3.8-flash">Gemini 3.8 Flash (Flagship / Ultra-Fast & Thinking)</option>
              <option value="gemini-3.8-pro">Gemini 3.8 Pro (Deep Mathematical & Analytical Reasoning)</option>
              <option value="gemini-2.5-flash">Gemini 2.5 Flash (Balanced Multimodal)</option>
              <option value="gemini-2.0-flash">Gemini 2.0 Flash (Fast & Lightweight)</option>
              <option value="gemini-1.5-pro">Gemini 1.5 Pro (2M Token Context Window)</option>
              <option value="custom">Custom Model ID...</option>
            </select>
          </div>

          {model === "custom" && (
            <div>
              <label className="block font-medium text-slate-300 mb-1.5">Custom Model ID</label>
              <input
                type="text"
                placeholder="e.g. gemini-3.8-flash or preview model"
                value={customModel}
                onChange={(e) => setCustomModel(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          )}

          {/* Thinking Effort Selector */}
          <div>
            <label className="block font-medium text-slate-300 mb-1 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <LuBrain className="w-3.5 h-3.5 text-indigo-400" />
                <span>Thinking Effort</span>
              </span>
              <span className="text-[10px] text-slate-400 font-mono">
                {thinkingEffort === "off" && "0 tokens (Off)"}
                {thinkingEffort === "low" && "1k tokens (Low)"}
                {thinkingEffort === "medium" && "4k tokens (Medium)"}
                {thinkingEffort === "high" && "16k tokens (Deep)"}
              </span>
            </label>
            <div className="grid grid-cols-4 gap-1.5 mt-1.5">
              {(["off", "low", "medium", "high"] as const).map((effort) => (
                <button
                  key={effort}
                  type="button"
                  onClick={() => setThinkingEffort(effort)}
                  className={`py-1.5 rounded-lg border text-center capitalize font-medium transition ${
                    thinkingEffort === effort
                      ? "bg-indigo-600 text-white border-indigo-500 shadow-sm"
                      : "bg-slate-950 border-slate-800 text-slate-400 hover:text-white"
                  }`}
                >
                  {effort}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-slate-500 mt-1.5">
              Higher thinking effort produces more rigorous step-by-step reasoning for formulas, proofs, and multi-lecture summaries.
            </p>
          </div>

          {/* Active Note Context Toggle */}
          <div className="pt-2 border-t border-slate-800">
            <label className="flex items-center space-x-2.5 cursor-pointer">
              <input
                type="checkbox"
                checked={includeActiveNote}
                onChange={(e) => setIncludeActiveNote(e.target.checked)}
                className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
              />
              <span className="text-slate-300 text-xs font-medium">
                Include currently opened note in prompt context
              </span>
            </label>
          </div>

          <div className="pt-4 flex justify-end space-x-2">
            <button
              onClick={() => setShowSettings(false)}
              className="px-3 py-1.5 rounded-lg text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveSettings}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium transition shadow-sm"
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
                <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
                  <LuSparkles className="w-6 h-6" />
                </div>
                <p className="text-sm font-semibold text-slate-200">
                  Ask Curie Brain
                </p>
                <p className="text-xs text-slate-400 mt-1 max-w-xs leading-relaxed">
                  Query, summarize, or derive insights from your notes and vault attachments with Google Gemini.
                </p>

                {activeNoteContent && (
                  <div className="mt-6 w-full space-y-2">
                    <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider text-left">
                      Quick actions for this note:
                    </p>
                    <button
                      onClick={() => handleSend("Summarize the key takeaways and concepts of this note in bullet points.")}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white transition flex items-center gap-2"
                    >
                      <span>💡</span>
                      <span>Summarize key takeaways</span>
                    </button>
                    <button
                      onClick={() => handleSend("Generate 3 challenging study and practice exam questions with detailed answers based on this note.")}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white transition flex items-center gap-2"
                    >
                      <span>❓</span>
                      <span>Generate study & quiz questions</span>
                    </button>
                    <button
                      onClick={() => handleSend("Explain the core logic, formulas, and definitions in this note simply and clearly.")}
                      className="w-full text-left p-2.5 rounded-xl bg-slate-950/70 border border-slate-800 hover:border-indigo-500/40 text-slate-300 hover:text-white transition flex items-center gap-2"
                    >
                      <span>📊</span>
                      <span>Explain core formulas & terms</span>
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
                    className={`max-w-[90%] rounded-2xl p-3.5 leading-relaxed shadow-sm ${
                      m.role === "user"
                        ? "bg-indigo-600 text-white shadow-indigo-600/20"
                        : "bg-slate-950 border border-slate-800 text-slate-200"
                    }`}
                  >
                    {/* Attachments chip list if user sent any */}
                    {m.attachments && m.attachments.length > 0 && (
                      <div className="mb-2 flex flex-wrap gap-1">
                        {m.attachments.map((p, aIdx) => (
                          <span
                            key={aIdx}
                            className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-md bg-white/10 text-indigo-100 font-mono"
                          >
                            <LuPaperclip className="w-2.5 h-2.5" />
                            <span>{p.split("/").pop()}</span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Thinking Process Accordion */}
                    {m.thought && (
                      <details className="mb-2.5 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden group">
                        <summary className="px-3 py-1.5 text-[11px] font-medium text-slate-400 hover:text-slate-200 cursor-pointer flex items-center gap-1.5 select-none bg-slate-950/40">
                          <LuBrain className="w-3.5 h-3.5 text-indigo-400" />
                          <span>Thought process</span>
                        </summary>
                        <div className="p-3 text-[11px] text-slate-400 font-mono whitespace-pre-wrap border-t border-slate-800/60 bg-slate-950/50 max-h-48 overflow-y-auto leading-relaxed">
                          {m.thought}
                        </div>
                      </details>
                    )}

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

                  {/* One-click Action Bar for Assistant Messages */}
                  {m.role === "assistant" && m.content && (
                    <div className="mt-1 flex items-center space-x-1 px-1">
                      <button
                        onClick={() => handleCopy(m.content, idx)}
                        className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
                        title="Copy Markdown"
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

                      {onAppendToNote && activeNotePath && (
                        <button
                          onClick={() => handleAppend(m.content, idx)}
                          className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
                          title="Append to bottom of active note"
                        >
                          {appendedIdx === idx ? (
                            <>
                              <LuCheck className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Appended</span>
                            </>
                          ) : (
                            <>
                              <LuArrowDownToLine className="w-3 h-3" />
                              <span>Append</span>
                            </>
                          )}
                        </button>
                      )}

                      {onCreateNote && (
                        <button
                          onClick={() => handleSaveAsNewNote(m.content, idx)}
                          className="text-[10px] text-slate-500 hover:text-indigo-400 flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-slate-800 transition"
                          title="Save as new note in vault"
                        >
                          {savedIdx === idx ? (
                            <>
                              <LuCheck className="w-3 h-3 text-emerald-400" />
                              <span className="text-emerald-400">Saved</span>
                            </>
                          ) : (
                            <>
                              <LuFilePlus className="w-3 h-3" />
                              <span>New Note</span>
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  )}
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-center justify-between text-slate-400 p-2 rounded-xl bg-slate-950/40 border border-slate-800/60">
                <div className="flex items-center space-x-2 text-xs">
                  <LuLoaderCircle className="w-4 h-4 animate-spin text-indigo-400" />
                  <span>Generating answer...</span>
                </div>
                <button
                  type="button"
                  onClick={handleStop}
                  className="px-2.5 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 text-[10px] font-medium transition flex items-center gap-1 border border-rose-500/30"
                >
                  <LuSquare className="w-2.5 h-2.5 fill-current" />
                  <span>Stop</span>
                </button>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Attachment Chips Bar */}
          {selectedAttachments.length > 0 && (
            <div className="px-3 py-1.5 bg-slate-950/90 border-t border-slate-800/80 flex flex-wrap gap-1.5 items-center">
              <span className="text-[10px] text-slate-500 font-medium">Context attachments:</span>
              {selectedAttachments.map((p) => {
                const ext = p.split(".").pop()?.toLowerCase();
                const isPdf = ext === "pdf";
                return (
                  <span
                    key={p}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-lg bg-indigo-950/60 border border-indigo-500/30 text-indigo-200"
                  >
                    {isPdf ? (
                      <TbFileTypePdf className="w-3 h-3 text-rose-400" />
                    ) : (
                      <LuFileText className="w-3 h-3 text-indigo-400" />
                    )}
                    <span className="max-w-[140px] truncate">{p.split("/").pop()}</span>
                    <button
                      type="button"
                      onClick={() => toggleAttachment(p)}
                      className="ml-0.5 text-slate-400 hover:text-white"
                    >
                      <LuX className="w-3 h-3" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}

          {/* Chat Input Bar */}
          <div className="p-3 border-t border-slate-800 bg-slate-950/80">
            <div className="flex items-end space-x-2 bg-slate-900 border border-slate-700/80 rounded-2xl p-1.5 focus-within:ring-2 focus-within:ring-indigo-500/40">
              <button
                type="button"
                onClick={() => setShowAttachModal(true)}
                className="w-7 h-7 rounded-xl text-slate-400 hover:text-indigo-400 hover:bg-slate-800 flex items-center justify-center transition flex-shrink-0"
                title="Attach vault note, PDF, or image"
              >
                <LuPaperclip className="w-3.5 h-3.5" />
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  activeNoteName
                    ? `Ask about ${activeNoteName}...`
                    : "Ask anything about your notes & vault..."
                }
                rows={1}
                className="flex-1 bg-transparent border-0 text-xs text-white placeholder-slate-500 focus:outline-none resize-none px-2 py-1 max-h-24 leading-relaxed"
              />

              {loading ? (
                <button
                  type="button"
                  onClick={handleStop}
                  className="w-7 h-7 rounded-xl bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center transition flex-shrink-0"
                  title="Stop generating"
                >
                  <LuSquare className="w-3 h-3 fill-current" />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => handleSend()}
                  disabled={!input.trim()}
                  className="w-7 h-7 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white flex items-center justify-center transition disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 shadow-sm"
                  title="Send message (Enter)"
                >
                  <LuSend className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </>
      )}

      {/* Attachment Selection Modal */}
      {showAttachModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm flex flex-col max-h-[500px] shadow-2xl overflow-hidden">
            <div className="p-3.5 border-b border-slate-800 flex items-center justify-between">
              <h4 className="text-xs font-semibold text-white flex items-center gap-1.5">
                <LuPaperclip className="w-3.5 h-3.5 text-indigo-400" />
                <span>Attach Vault File to Context</span>
              </h4>
              <button
                type="button"
                onClick={() => setShowAttachModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <LuX className="w-4 h-4" />
              </button>
            </div>

            <div className="p-2.5 border-b border-slate-800/80 bg-slate-950/60">
              <div className="flex items-center space-x-2 bg-slate-900 border border-slate-800 rounded-xl px-2.5 py-1.5">
                <LuSearch className="w-3.5 h-3.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filter vault files..."
                  value={searchAttachQuery}
                  onChange={(e) => setSearchAttachQuery(e.target.value)}
                  className="w-full bg-transparent border-0 text-xs text-white placeholder-slate-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-2 space-y-1 text-xs">
              {filteredAttachFiles.length === 0 ? (
                <div className="p-4 text-center text-slate-500">No files found.</div>
              ) : (
                filteredAttachFiles.map((f) => {
                  const isSelected = selectedAttachments.includes(f.path);
                  const isPdf = f.ext === "pdf";
                  return (
                    <button
                      key={f.path}
                      type="button"
                      onClick={() => toggleAttachment(f.path)}
                      className={`w-full text-left p-2 rounded-xl flex items-center justify-between transition ${
                        isSelected
                          ? "bg-indigo-600/20 border border-indigo-500/40 text-indigo-200"
                          : "hover:bg-slate-800 text-slate-300"
                      }`}
                    >
                      <div className="flex items-center space-x-2 truncate">
                        {isPdf ? (
                          <TbFileTypePdf className="w-3.5 h-3.5 text-rose-400 flex-shrink-0" />
                        ) : (
                          <LuFileText className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                        )}
                        <span className="truncate">{f.name}</span>
                      </div>
                      <div
                        className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 ${
                          isSelected
                            ? "bg-indigo-600 border-indigo-500 text-white"
                            : "border-slate-700"
                        }`}
                      >
                        {isSelected && <LuCheck className="w-3 h-3" />}
                      </div>
                    </button>
                  );
                })
              )}
            </div>

            <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex justify-end">
              <button
                type="button"
                onClick={() => setShowAttachModal(false)}
                className="px-4 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition"
              >
                Done ({selectedAttachments.length} selected)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
