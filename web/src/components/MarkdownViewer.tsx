import { useMemo, useState, useRef, useEffect } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import {
  LuCopy,
  LuCheck,
  LuPlay,
  LuPause,
  LuMusic,
  LuLoaderCircle,
  LuPenTool,
  LuFileText,
  LuColumns2,
  LuTriangleAlert,
  LuMail,
  LuPhone,
  LuExternalLink,
} from "react-icons/lu";
import { TbFileTypePdf } from "react-icons/tb";
import { useAuth } from "../contexts/AuthContext";
import { api, TreeNode } from "../api/client";

interface MarkdownViewerProps {
  content: string;
  onNavigateWikiLink: (target: string) => void;
  currentFilePath?: string;
  tree?: TreeNode[];
}

export type DualViewMode = "handwriting" | "transcription" | "split";

function resolveAssetPath(filePath: string, tree?: TreeNode[], currentFilePath?: string): string {
  if (!filePath) return "";
  let cleanPath = filePath.trim();
  try {
    cleanPath = decodeURIComponent(cleanPath);
  } catch {}
  cleanPath = cleanPath.replace(/^\.?\/+/, "");

  if (!tree || tree.length === 0) {
    return cleanPath;
  }

  const allFiles: { path: string; name: string }[] = [];
  const collect = (nodes: TreeNode[]) => {
    for (const node of nodes) {
      if (node.type === "file") {
        allFiles.push({ path: node.path, name: node.name });
      } else if (node.type === "dir" && node.children) {
        collect(node.children);
      }
    }
  };
  collect(tree);

  const cleanLower = cleanPath.toLowerCase();

  // 1. Direct path match
  const direct = allFiles.find((f) => f.path.toLowerCase() === cleanLower);
  if (direct) return direct.path;

  // 2. Relative to current file folder
  if (currentFilePath && currentFilePath.includes("/")) {
    const currentDir = currentFilePath.substring(0, currentFilePath.lastIndexOf("/"));
    const rel = `${currentDir}/${cleanPath}`.toLowerCase();
    const relMatch = allFiles.find((f) => f.path.toLowerCase() === rel);
    if (relMatch) return relMatch.path;
  }

  // 3. Attachments folder match
  const attachMatch = allFiles.find(
    (f) =>
      f.path.toLowerCase() === `attachments/${cleanLower}` ||
      f.path.toLowerCase().endsWith(`/attachments/${cleanLower}`) ||
      f.path.toLowerCase().endsWith(`/${cleanLower}`)
  );
  if (attachMatch) return attachMatch.path;

  // 4. Basename match
  const baseName = (cleanPath.split("/").pop() || cleanPath).toLowerCase();
  const baseMatch = allFiles.find((f) => f.name.toLowerCase() === baseName);
  if (baseMatch) return baseMatch.path;

  return cleanPath;
}

function InlineAudioPlayer({
  vaultId,
  filePath,
  tree,
  currentFilePath,
}: {
  vaultId: string;
  filePath: string;
  tree?: TreeNode[];
  currentFilePath?: string;
}) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const resolvedPath = useMemo(() => {
    return resolveAssetPath(filePath, tree, currentFilePath);
  }, [filePath, tree, currentFilePath]);

  const fileName = resolvedPath.split("/").pop() || resolvedPath;

  const handlePlayToggle = async () => {
    if (!blobUrl) {
      try {
        setLoading(true);
        let blob: Blob | null = null;
        try {
          blob = await api.getBlob(vaultId, resolvedPath);
        } catch (firstErr) {
          if (!resolvedPath.startsWith("attachments/")) {
            blob = await api.getBlob(vaultId, `attachments/${resolvedPath}`);
          } else {
            throw firstErr;
          }
        }
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
        className="w-9 h-9 rounded-lg bg-purple-600 hover:bg-purple-500 active:bg-purple-700 text-white flex items-center justify-center flex-shrink-0 transition shadow-sm disabled:opacity-50 cursor-pointer"
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

function InlineImageViewer({
  vaultId,
  filePath,
  currentFilePath,
  tree,
  alt,
}: {
  vaultId: string;
  filePath: string;
  currentFilePath?: string;
  tree?: TreeNode[];
  alt?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolvedPath = useMemo(() => {
    return resolveAssetPath(filePath, tree, currentFilePath);
  }, [filePath, tree, currentFilePath]);

  const isHandwriting =
    resolvedPath.toLowerCase().includes("handwriting") ||
    resolvedPath.toLowerCase().endsWith(".svg") ||
    resolvedPath.toLowerCase().includes(".page");

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function loadImage() {
      try {
        setLoading(true);
        setError(null);

        let blob: Blob | null = null;
        try {
          blob = await api.getBlob(vaultId, resolvedPath);
        } catch (firstErr) {
          if (!resolvedPath.startsWith("attachments/")) {
            try {
              blob = await api.getBlob(vaultId, `attachments/${resolvedPath}`);
            } catch {
              throw firstErr;
            }
          } else {
            throw firstErr;
          }
        }

        if (!active) return;
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setSrc(url);
      } catch (err: any) {
        if (!active) return;
        // As a fallback, try authenticated downloadUrl
        const downloadUrl = api.getDownloadUrl(vaultId, resolvedPath);
        setSrc(downloadUrl);
      } finally {
        if (active) setLoading(false);
      }
    }

    loadImage();

    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [vaultId, resolvedPath]);

  if (loading) {
    return (
      <span className="inline-flex items-center space-x-1.5 text-xs text-slate-500 my-2">
        <LuLoaderCircle className="w-3.5 h-3.5 animate-spin text-indigo-400" />
        <span>Loading image ({filePath})...</span>
      </span>
    );
  }

  if (error || !src) {
    return (
      <span className="inline-flex items-center space-x-1.5 text-xs text-rose-400/90 my-2 px-2.5 py-1 rounded bg-rose-500/10 border border-rose-500/20">
        <LuTriangleAlert className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Image not found: {filePath}</span>
      </span>
    );
  }

  return (
    <div className={`not-prose my-3 ${isHandwriting ? "curie-handwriting-embed" : ""}`}>
      <img
        src={src}
        alt={alt || filePath}
        className="rounded-xl border border-slate-800 max-h-[650px] w-full object-contain bg-white/5 p-2 shadow-md"
        onError={() => {
          setError(`Failed to render image ${filePath}`);
          setSrc(null);
        }}
      />
    </div>
  );
}

function TranscriptionDetails({ children, className, ...props }: any) {
  const [copied, setCopied] = useState(false);
  const textRef = useRef<HTMLDivElement>(null);

  const handleCopy = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (textRef.current) {
      navigator.clipboard.writeText(textRef.current.innerText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const isTranscription = className?.includes("curie-transcription");

  if (!isTranscription) {
    return <details className={className} {...props}>{children}</details>;
  }

  return (
    <details
      className={`curie-transcription not-prose my-4 rounded-xl border border-indigo-500/30 bg-slate-900/80 shadow-md overflow-hidden ${className || ""}`}
      open
      {...props}
    >
      <summary className="flex items-center justify-between px-4 py-2.5 bg-slate-950/70 border-b border-indigo-500/20 cursor-pointer text-xs font-semibold text-indigo-300 hover:text-indigo-200 transition select-none">
        <span className="flex items-center gap-2">
          <LuFileText className="w-3.5 h-3.5 text-indigo-400" />
          <span>Transcribed Text</span>
        </span>
        <button
          type="button"
          onClick={handleCopy}
          title="Copy transcribed text"
          className="flex items-center space-x-1 px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px] text-slate-300 hover:text-white transition cursor-pointer"
        >
          {copied ? (
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
      </summary>
      <div ref={textRef} className="p-4 text-xs font-sans text-slate-200 leading-relaxed whitespace-pre-wrap">
        {children}
      </div>
    </details>
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
          className="flex items-center space-x-1 hover:text-white transition px-1.5 py-0.5 rounded hover:bg-slate-800 cursor-pointer"
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

function getHeadingId(children: any): string {
  const text = typeof children === "string"
    ? children
    : Array.isArray(children)
      ? children.map((c) => (typeof c === "string" ? c : "")).join("")
      : "";
  return text.toLowerCase().replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-");
}

export default function MarkdownViewer({
  content,
  onNavigateWikiLink,
  currentFilePath,
  tree,
}: MarkdownViewerProps) {
  const { activeVault } = useAuth();
  const [viewMode, setViewMode] = useState<DualViewMode>("split");

  // Check if note contains Samsung Notes handwriting or transcription blocks
  const hasHandwritingOrTranscription = useMemo(() => {
    if (!content) return false;
    return (
      content.includes("curie-transcription") ||
      content.includes("curie_type: \"sdocx_note\"") ||
      content.includes("handwriting_p") ||
      content.includes("has_handwriting: true")
    );
  }, [content]);

  // Pre-process Obsidian embeds and wikilinks:
  // ![[Image.png]] -> ![Image.png](Image.png)
  // [[Image.png]] -> ![Image.png](Image.png)
  // ![[Recording.m4a]] -> [Recording.m4a](wikilink_embed:Recording.m4a)
  // [[Note Name]] -> [Note Name](wikilink:Note%20Name)
  const processedContent = useMemo(() => {
    if (!content) return "";

    const isImageFile = (target: string) => {
      const ext = target.split(".").pop()?.toLowerCase();
      return ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif", "tiff"].includes(
        ext || ""
      );
    };

    // 1. Process Obsidian Embeds: ![[target|alias]]
    // If target is an image, convert directly to Markdown image ![alias](target)
    // so ReactMarkdown directly calls components.img
    const embedRegex = /!\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    let text = content.replace(embedRegex, (_, target, alias) => {
      const cleanTarget = target.trim();
      const label = alias ? alias.trim() : cleanTarget;
      if (isImageFile(cleanTarget)) {
        return `![${label}](${encodeURIComponent(cleanTarget)})`;
      }
      return `[${label}](wikilink_embed:${encodeURIComponent(cleanTarget)})`;
    });

    // 2. Process Obsidian Wikilinks / Backlinks: [[target|alias]]
    // If target is an image, also convert directly to Markdown image ![alias](target)
    const wikiLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
    text = text.replace(wikiLinkRegex, (_, target, alias) => {
      const cleanTarget = target.trim();
      const label = alias ? alias.trim() : cleanTarget;
      if (isImageFile(cleanTarget)) {
        return `![${label}](${encodeURIComponent(cleanTarget)})`;
      }
      return `[${label}](wikilink:${encodeURIComponent(cleanTarget)})`;
    });

    return text;
  }, [content]);

  return (
    <div className={`markdown-body prose prose-invert prose-indigo max-w-none text-slate-200 text-sm leading-relaxed p-6 curie-view-mode-${viewMode}`}>
      <style>{`
        .curie-view-mode-handwriting .curie-transcription {
          display: none !important;
        }
        .curie-view-mode-transcription .curie-handwriting-embed {
          display: none !important;
        }
      `}</style>

      {/* Dual-View Interactive Toolbar */}
      {hasHandwritingOrTranscription && (
        <div className="not-prose mb-6 p-2 rounded-xl bg-slate-900/90 border border-slate-800 flex flex-wrap items-center justify-between gap-2 shadow-lg">
          <div className="flex items-center space-x-2 text-xs text-slate-300 font-medium pl-2">
            <span className="inline-block w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
            <span>Samsung Note Dual-View:</span>
          </div>
          <div className="flex items-center space-x-1 bg-slate-950 p-1 rounded-lg border border-slate-800/80">
            <button
              type="button"
              onClick={() => setViewMode("handwriting")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                viewMode === "handwriting"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
              title="Display original handwritten vector stylus ink"
            >
              <LuPenTool className="w-3.5 h-3.5" />
              <span>Handwriting</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("transcription")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                viewMode === "transcription"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
              title="Display transcribed digital text"
            >
              <LuFileText className="w-3.5 h-3.5" />
              <span>Transcribed Text</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("split")}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition cursor-pointer ${
                viewMode === "split"
                  ? "bg-indigo-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white hover:bg-slate-900"
              }`}
              title="Display handwriting and transcription together"
            >
              <LuColumns2 className="w-3.5 h-3.5" />
              <span>Split View</span>
            </button>
          </div>
        </div>
      )}

      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw]}
        urlTransform={(url) => url}
        components={{
          img: ({ src, alt, ...props }: any) => {
            if (!src) return null;
            // Web / external URLs
            if (src.startsWith("http://") || src.startsWith("https://") || src.startsWith("data:")) {
              return (
                <img
                  src={src}
                  alt={alt || ""}
                  className="rounded-xl border border-slate-800 max-h-[650px] w-full object-contain bg-white/5 p-2 shadow-md my-3"
                  {...props}
                />
              );
            }
            // Vault image
            let cleanSrc = src;
            if (cleanSrc.startsWith("wikilink_embed:")) {
              cleanSrc = cleanSrc.slice(15);
            } else if (cleanSrc.startsWith("wikilink:")) {
              cleanSrc = cleanSrc.slice(9);
            }
            try {
              cleanSrc = decodeURIComponent(cleanSrc);
            } catch {}

            return activeVault ? (
              <InlineImageViewer
                vaultId={activeVault.id}
                filePath={cleanSrc}
                currentFilePath={currentFilePath}
                tree={tree}
                alt={alt}
              />
            ) : null;
          },
          a: ({ href, children, ...props }: any) => {
            if (!href || href === "" || href === "#" || href === "/") {
              return <span className="text-slate-300">{children}</span>;
            }

            // Mailto links: prepend mail icon
            if (href.startsWith("mailto:")) {
              return (
                <a
                  href={href}
                  className="inline text-sky-400 hover:text-sky-300 hover:underline"
                  {...props}
                >
                  <LuMail className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-sky-400 align-middle" />
                  {children}
                </a>
              );
            }

            // Tel links: prepend phone icon
            if (href.startsWith("tel:")) {
              return (
                <a
                  href={href}
                  className="inline text-emerald-400 hover:text-emerald-300 hover:underline"
                  {...props}
                >
                  <LuPhone className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-emerald-400 align-middle" />
                  {children}
                </a>
              );
            }

            // Wikilink embeds and backlinks: [[target]] or ![[target]]
            if (href.startsWith("wikilink_embed:") || href.startsWith("wikilink:")) {
              const prefix = href.startsWith("wikilink_embed:") ? "wikilink_embed:" : "wikilink:";
              let target = href.slice(prefix.length);
              try {
                target = decodeURIComponent(target);
              } catch {}
              const ext = target.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
              if (["m4a", "mp3", "wav", "aac", "ogg", "amr"].includes(ext || "")) {
                return activeVault ? (
                  <InlineAudioPlayer
                    vaultId={activeVault.id}
                    filePath={target}
                    currentFilePath={currentFilePath}
                    tree={tree}
                  />
                ) : (
                  <span className="text-xs text-purple-400">Audio: {target}</span>
                );
              }
              if (
                ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif", "tiff"].includes(
                  ext || ""
                )
              ) {
                return activeVault ? (
                  <InlineImageViewer
                    vaultId={activeVault.id}
                    filePath={target}
                    currentFilePath={currentFilePath}
                    tree={tree}
                    alt={typeof children === "string" ? children : target}
                  />
                ) : (
                  <span className="text-xs text-emerald-400">Image: {target}</span>
                );
              }

              // Determine if backlink resolves to a PDF or note
              const resolved = resolveAssetPath(target, tree, currentFilePath);
              const resolvedExt = resolved.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
              const isPdf = ext === "pdf" || resolvedExt === "pdf";

              if (isPdf) {
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onNavigateWikiLink(target);
                    }}
                    title={`Open PDF: ${target}`}
                    className="inline text-rose-400 hover:text-rose-300 font-medium underline underline-offset-2 decoration-rose-500/40 hover:decoration-rose-400 transition cursor-pointer bg-transparent border-0 p-0 text-left font-inherit"
                  >
                    <TbFileTypePdf className="w-4 h-4 inline mr-1 -mt-0.5 text-rose-400 align-middle" />
                    {children}
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onNavigateWikiLink(target);
                  }}
                  title={`Go to ${target}`}
                  className="inline text-indigo-400 hover:text-indigo-300 font-medium underline underline-offset-2 decoration-indigo-500/40 hover:decoration-indigo-400 transition cursor-pointer bg-transparent border-0 p-0 text-left font-inherit"
                >
                  <LuFileText className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-indigo-400 align-middle" />
                  {children}
                </button>
              );
            }

            // Same-page heading anchor links: #heading
            if (href.startsWith("#")) {
              const anchor = href.slice(1);
              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    const el =
                      document.getElementById(anchor) ||
                      document.getElementById(anchor.toLowerCase().replace(/\s+/g, "-")) ||
                      document.querySelector(`[data-heading="${anchor}"]`);
                    el?.scrollIntoView({ behavior: "smooth" });
                  }}
                  className="inline text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer bg-transparent border-0 p-0 text-left font-inherit"
                >
                  {children}
                </button>
              );
            }

            // Internal relative link to other notes or vault documents
            if (
              !href.startsWith("http://") &&
              !href.startsWith("https://") &&
              !href.startsWith("mailto:") &&
              !href.startsWith("tel:")
            ) {
              let decodedHref = href;
              try {
                decodedHref = decodeURIComponent(href);
              } catch {}
              const ext = decodedHref.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
              if (
                ["png", "jpg", "jpeg", "gif", "svg", "webp", "ico", "bmp", "avif", "tiff"].includes(
                  ext || ""
                )
              ) {
                return activeVault ? (
                  <InlineImageViewer
                    vaultId={activeVault.id}
                    filePath={decodedHref}
                    currentFilePath={currentFilePath}
                    tree={tree}
                    alt={typeof children === "string" ? children : decodedHref}
                  />
                ) : null;
              }

              const resolvedRel = resolveAssetPath(decodedHref, tree, currentFilePath);
              const resolvedRelExt = resolvedRel.split("?")[0].split("#")[0].split(".").pop()?.toLowerCase();
              const isPdf = ext === "pdf" || resolvedRelExt === "pdf";

              if (isPdf) {
                return (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onNavigateWikiLink(decodedHref);
                    }}
                    className="inline text-rose-400 hover:text-rose-300 hover:underline cursor-pointer bg-transparent border-0 p-0 text-left font-inherit"
                  >
                    <TbFileTypePdf className="w-4 h-4 inline mr-1 -mt-0.5 text-rose-400 align-middle" />
                    {children}
                  </button>
                );
              }

              return (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onNavigateWikiLink(decodedHref);
                  }}
                  className="inline text-indigo-400 hover:text-indigo-300 hover:underline cursor-pointer bg-transparent border-0 p-0 text-left font-inherit"
                >
                  <LuFileText className="w-3.5 h-3.5 inline mr-1 -mt-0.5 text-indigo-400 align-middle" />
                  {children}
                </button>
              );
            }

            // External web link: show external site icon at the end of the text
            return (
              <a
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="inline text-indigo-400 hover:text-indigo-300 hover:underline"
                {...props}
              >
                {children}
                <LuExternalLink className="w-3.5 h-3.5 inline ml-1 -mt-0.5 text-indigo-400 opacity-80 align-middle" />
              </a>
            );
          },
          details: TranscriptionDetails,
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
          h1: ({ children, ...props }: any) => {
            const id = getHeadingId(children);
            return (
              <h1
                id={id || undefined}
                data-heading={id || undefined}
                className="text-2xl font-bold text-white tracking-tight mt-6 mb-4 pb-2 border-b border-slate-800"
                {...props}
              >
                {children}
              </h1>
            );
          },
          h2: ({ children, ...props }: any) => {
            const id = getHeadingId(children);
            return (
              <h2
                id={id || undefined}
                data-heading={id || undefined}
                className="text-xl font-semibold text-white tracking-tight mt-5 mb-3"
                {...props}
              >
                {children}
              </h2>
            );
          },
          h3: ({ children, ...props }: any) => {
            const id = getHeadingId(children);
            return (
              <h3
                id={id || undefined}
                data-heading={id || undefined}
                className="text-lg font-semibold text-slate-100 mt-4 mb-2"
                {...props}
              >
                {children}
              </h3>
            );
          },
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
