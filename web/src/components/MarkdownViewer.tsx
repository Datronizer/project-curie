import { useMemo, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  LuCopy,
  LuCheck,
  LuPlay,
  LuPause,
  LuMusic,
  LuLoaderCircle,
} from "react-icons/lu";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";

interface MarkdownViewerProps {
  content: string;
  onNavigateWikiLink: (target: string) => void;
}

function InlineAudioPlayer({ vaultId, filePath }: { vaultId: string; filePath: string }) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const fileName = filePath.split("/").pop() || filePath;

  const handlePlayToggle = async () => {
    if (!blobUrl) {
      try {
        setLoading(true);
        const blob = await api.getBlob(vaultId, filePath);
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
        setTimeout(() => {
          audioRef.current?.play().catch(() => {});
          setIsPlaying(true);
        }, 50);
      } catch (err) {
        console.error("Failed to load inline audio:", err);
      } finally {
        setLoading(false);
      }
      return;
    }

    if (isPlaying) {
      audioRef.current?.pause();
      setIsPlaying(false);
    } else {
      audioRef.current?.play().catch(() => {});
      setIsPlaying(true);
    }
  };

  return (
    <div className="not-prose my-3 p-3 rounded-xl bg-slate-900/90 border border-purple-500/30 flex items-center space-x-3 max-w-md shadow-md">
      <audio
        ref={audioRef}
        src={blobUrl || undefined}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />
      <button
        type="button"
        onClick={handlePlayToggle}
        disabled={loading}
        className="w-9 h-9 rounded-lg bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white flex items-center justify-center flex-shrink-0 transition shadow-sm disabled:opacity-50"
      >
        {loading ? (
          <LuLoaderCircle className="w-4 h-4 animate-spin" />
        ) : isPlaying ? (
          <LuPause className="w-4 h-4" />
        ) : (
          <LuPlay className="w-4 h-4 ml-0.5" />
        )}
      </button>
      <div className="flex-1 truncate">
        <p className="text-xs font-medium text-white truncate">{fileName}</p>
        <p className="text-[10px] text-purple-400 flex items-center gap-1 mt-0.5">
          <LuMusic className="w-3 h-3" />
          <span>Embedded Recording</span>
        </p>
      </div>
    </div>
  );
}

function InlineImageViewer({ vaultId, filePath }: { vaultId: string; filePath: string }) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;
    api.getBlob(vaultId, filePath).then((blob) => {
      if (!active) return;
      const url = URL.createObjectURL(blob);
      urlToRevoke = url;
      setSrc(url);
    }).catch(console.error);

    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [vaultId, filePath]);

  if (!src) {
    return <span className="text-xs text-slate-500 italic">Loading attachment...</span>;
  }

  return (
    <img
      src={src}
      alt={filePath}
      className="my-3 rounded-xl border border-slate-800 max-h-96 object-contain shadow-md"
    />
  );
}

function CodeBlock({ children, className }: { children: any; className?: string }) {
  const [copied, setCopied] = useState(false);
  const codeString = String(children).replace(/\n$/, "");
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : "";

  const handleCopy = () => {
    navigator.clipboard.writeText(codeString);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group my-4 rounded-xl overflow-hidden border border-slate-800 bg-slate-900/90">
      <div className="flex items-center justify-between px-3 py-1.5 bg-slate-950/60 border-b border-slate-800 text-[11px] text-slate-400">
        <span className="font-mono uppercase tracking-wider">{language || "text"}</span>
        <button
          onClick={handleCopy}
          className="flex items-center space-x-1 hover:text-white transition px-1.5 py-0.5 rounded hover:bg-slate-800"
        >
          {copied ? (
            <>
              <LuCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <LuCopy className="w-3.5 h-3.5" />
              <span>Copy</span>
            </>
          )}
        </button>
      </div>
      <pre className="p-4 text-xs font-mono text-slate-200 overflow-x-auto leading-relaxed">
        <code>{children}</code>
      </pre>
    </div>
  );
}

export default function MarkdownViewer({
  content,
  onNavigateWikiLink,
}: MarkdownViewerProps) {
  const { activeVault } = useAuth();

  // Pre-process Obsidian embeds and wikilinks:
  // ![[Recording.m4a]] -> [Recording.m4a](wikilink_embed:Recording.m4a)
  // [[Note Name]] -> [Note Name](wikilink:Note%20Name)
  const processedContent = useMemo(() => {
    if (!content) return "";

    const embedRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let text = content.replace(embedRegex, (_, target, alias) => {
      const cleanTarget = target.trim();
      const label = alias ? alias.trim() : cleanTarget;
      return `[${label}](wikilink_embed:${encodeURIComponent(cleanTarget)})`;
    });

    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    text = text.replace(wikiLinkRegex, (_, target, alias) => {
      const cleanTarget = target.trim();
      const label = alias ? alias.trim() : cleanTarget;
      return `[${label}](wikilink:${encodeURIComponent(cleanTarget)})`;
    });

    return text;
  }, [content]);

  return (
    <div className="markdown-body prose prose-invert prose-indigo max-w-none text-slate-200 text-sm leading-relaxed p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            if (href?.startsWith("wikilink_embed:")) {
              const target = decodeURIComponent(href.slice(15));
              const ext = target.split(".").pop()?.toLowerCase();
              if (["m4a", "mp3", "wav", "aac", "ogg", "amr"].includes(ext || "")) {
                return activeVault ? (
                  <InlineAudioPlayer vaultId={activeVault.id} filePath={target} />
                ) : (
                  <span className="text-xs text-purple-400">Audio: {target}</span>
                );
              }
              if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) {
                return activeVault ? (
                  <InlineImageViewer vaultId={activeVault.id} filePath={target} />
                ) : (
                  <span className="text-xs text-emerald-400">Image: {target}</span>
                );
              }
            }

            if (href?.startsWith("wikilink:")) {
              const target = decodeURIComponent(href.slice(9));
              const ext = target.split(".").pop()?.toLowerCase();
              if (["m4a", "mp3", "wav", "aac", "ogg", "amr"].includes(ext || "")) {
                return activeVault ? (
                  <InlineAudioPlayer vaultId={activeVault.id} filePath={target} />
                ) : null;
              }
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    onNavigateWikiLink(target);
                  }}
                  title={`Go to [[${target}]]`}
                  className="inline-flex items-center text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 decoration-indigo-500/40 hover:decoration-indigo-400 transition"
                >
                  <span className="text-indigo-500/70 mr-0.5">[[</span>
                  {children}
                  <span className="text-indigo-500/70 ml-0.5">]]</span>
                </button>
              );
            }
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-indigo-400 hover:underline"
                {...props}
              >
                {children}
              </a>
            );
          },
          code: ({ node, inline, className, children, ...props }: any) => {
            if (inline) {
              return (
                <code
                  className="px-1.5 py-0.5 rounded bg-slate-800/80 text-indigo-300 text-xs font-mono border border-slate-700/50"
                  {...props}
                >
                  {children}
                </code>
              );
            }
            return <CodeBlock className={className}>{children}</CodeBlock>;
          },
          h1: ({ children }) => (
            <h1 className="text-2xl font-bold text-white tracking-tight mt-6 mb-4 pb-2 border-b border-slate-800">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-xl font-semibold text-white tracking-tight mt-5 mb-3">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-lg font-semibold text-slate-100 mt-4 mb-2">
              {children}
            </h3>
          ),
          p: ({ children }) => <p className="mb-4 text-slate-300">{children}</p>,
          ul: ({ children }) => <ul className="list-disc pl-5 mb-4 space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="list-decimal pl-5 mb-4 space-y-1">{children}</ol>,
          li: ({ children }) => <li className="text-slate-300">{children}</li>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-4 border-indigo-500 pl-4 italic text-slate-400 my-4 bg-slate-900/40 py-1 rounded-r">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto my-4 rounded-lg border border-slate-800">
              <table className="min-w-full divide-y divide-slate-800 text-xs text-slate-300">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => <thead className="bg-slate-900">{children}</thead>,
          th: ({ children }) => (
            <th className="px-3 py-2 text-left font-semibold text-slate-200">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3 py-2 border-t border-slate-800/60">{children}</td>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
