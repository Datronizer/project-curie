import { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Copy, Check } from "lucide-react";
import { useState } from "react";

interface MarkdownViewerProps {
  content: string;
  onNavigateWikiLink: (target: string) => void;
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
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span className="text-emerald-400">Copied</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
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
  // Pre-process Obsidian wikilinks: [[Target Note]] or [[Target Note|Label]] -> [Label](wikilink:Target%20Note)
  const processedContent = useMemo(() => {
    if (!content) return "";

    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    return content.replace(wikiLinkRegex, (_, target, alias) => {
      const cleanTarget = target.trim();
      const label = alias ? alias.trim() : cleanTarget;
      return `[${label}](wikilink:${encodeURIComponent(cleanTarget)})`;
    });
  }, [content]);

  return (
    <div className="markdown-body prose prose-invert prose-indigo max-w-none text-slate-200 text-sm leading-relaxed p-6">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: ({ href, children, ...props }) => {
            if (href?.startsWith("wikilink:")) {
              const target = decodeURIComponent(href.slice(9));
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
