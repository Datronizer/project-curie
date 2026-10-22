import { useState, useMemo } from "react";
import { api, TreeNode } from "../api/client";
import {
  LuDownload,
  LuFile,
  LuFileText,
  LuFileCode,
  LuCopy,
  LuCheck,
  LuFolder,
  LuLoaderCircle,
  LuArrowRight,
  LuRefreshCw,
  LuSparkles,
} from "react-icons/lu";

interface BinaryFileViewerProps {
  vaultId: string;
  filePath: string;
  tree?: TreeNode[];
  onOpenNote?: (path: string) => void;
  onConverted?: () => void;
}

export default function BinaryFileViewer({
  vaultId,
  filePath,
  tree = [],
  onOpenNote,
  onConverted,
}: BinaryFileViewerProps) {
  const [copied, setCopied] = useState(false);
  const [isConverting, setIsConverting] = useState(false);
  const [convertStatus, setConvertStatus] = useState<string | null>(null);

  const downloadUrl = api.getDownloadUrl(vaultId, filePath);
  const fileName = filePath.split("/").pop() || "File";
  const ext = fileName.split(".").pop()?.toUpperCase() || "BIN";

  // Check if a converted markdown note already exists in the vault tree
  const potentialNotePath = useMemo(() => {
    if (ext !== "SDOCX") return null;

    const baseName = fileName.replace(/\.sdocx$/i, "");
    // Normalize e.g. Aging 1_261020_100009 -> aging_1
    const cleanSlug = baseName
      .toLowerCase()
      .replace(/_\d{6}_\d{6}$/, "")
      .replace(/[^a-z0-9_-]/g, "_")
      .replace(/_+/g, "_")
      .replace(/^_|_$/g, "");

    function findInTree(nodes: TreeNode[]): string | null {
      for (const node of nodes) {
        if (node.type === "file") {
          const nodeName = node.name.toLowerCase();
          if (
            nodeName === `${cleanSlug}.md` ||
            nodeName === `${baseName.toLowerCase()}.md` ||
            nodeName.replace(/\.md$/, "") === cleanSlug
          ) {
            return node.path;
          }
        }
        if (node.children) {
          const found = findInTree(node.children);
          if (found) return found;
        }
      }
      return null;
    }

    return findInTree(tree);
  }, [tree, fileName, ext]);

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleConvertSdocx = async () => {
    if (ext !== "SDOCX") return;
    try {
      setIsConverting(true);
      setConvertStatus("Enqueuing ingestion job...");

      const url = api.resolveUrl(`/vaults/${vaultId}/ingest/sdocx`);
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(api.getToken() ? { authorization: `Bearer ${api.getToken()}` } : {}),
        },
        body: JSON.stringify({ filePath, originalFileName: fileName }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error?.message || "Failed to start ingestion job");
      }

      const { jobId } = await res.json();
      setConvertStatus("Converting stylus strokes & OCR...");

      // Poll for job completion
      let targetNote: string | undefined;
      for (let i = 0; i < 15; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        const job = await api.getIngestionJob(vaultId, jobId);
        if (job.status === "completed") {
          targetNote = job.targetNotePath;
          break;
        }
        if (job.status === "failed") {
          throw new Error(job.error || "Ingestion job failed");
        }
        if (job.stage) {
          setConvertStatus(`Stage: ${job.stage} (${job.progress}%)`);
        }
      }

      setConvertStatus("Note converted successfully!");
      if (onConverted) {
        onConverted();
      }
      if (targetNote && onOpenNote) {
        onOpenNote(targetNote);
      }
    } catch (err: any) {
      console.error("Conversion failed:", err);
      alert(`Conversion error: ${err.message || String(err)}`);
    } finally {
      setIsConverting(false);
      setConvertStatus(null);
    }
  };

  const getFileBadgeColor = () => {
    switch (ext) {
      case "CANVAS":
        return "bg-purple-500/20 text-purple-400 border-purple-500/30";
      case "BASE":
        return "bg-blue-500/20 text-blue-400 border-blue-500/30";
      case "SDOCX":
        return "bg-amber-500/20 text-amber-400 border-amber-500/30";
      case "ZIP":
      case "TAR":
      case "GZ":
        return "bg-rose-500/20 text-rose-400 border-rose-500/30";
      default:
        return "bg-slate-500/20 text-slate-400 border-slate-500/30";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 select-none overflow-hidden">
      {/* Header Toolbar */}
      <div className="h-12 px-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center space-x-2.5 truncate mr-4">
          <LuFile className="w-4 h-4 text-indigo-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-white truncate">{fileName}</span>
          <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded border ${getFileBadgeColor()}`}>
            {ext}
          </span>
        </div>

        <div className="flex items-center space-x-2">
          {potentialNotePath && onOpenNote && (
            <button
              onClick={() => onOpenNote(potentialNotePath)}
              className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 border border-emerald-500/30 hover:bg-emerald-600/30 text-emerald-300 transition flex items-center space-x-1.5 text-xs font-medium"
              title="Open Converted Markdown Note"
            >
              <LuFileText className="w-3.5 h-3.5 text-emerald-400" />
              <span>Open Note</span>
              <LuArrowRight className="w-3 h-3" />
            </button>
          )}

          <button
            onClick={handleCopyPath}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center space-x-1 text-xs"
            title="Copy Path"
          >
            {copied ? (
              <LuCheck className="w-4 h-4 text-emerald-400" />
            ) : (
              <LuCopy className="w-4 h-4" />
            )}
          </button>

          <a
            href={downloadUrl}
            download={fileName}
            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center space-x-1.5 text-xs font-medium shadow-sm"
          >
            <LuDownload className="w-3.5 h-3.5" />
            <span>Download</span>
          </a>
        </div>
      </div>

      {/* Central File Info Card */}
      <div className="flex-1 flex items-center justify-center p-6 overflow-y-auto">
        <div className="max-w-md w-full bg-slate-900/80 border border-slate-800 rounded-2xl p-8 shadow-2xl flex flex-col items-center text-center">
          <div className="w-20 h-20 rounded-2xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mb-5 text-indigo-400">
            {ext === "CANVAS" ? (
              <LuFileCode className="w-10 h-10" />
            ) : ext === "SDOCX" ? (
              <LuFileText className="w-10 h-10 text-amber-400" />
            ) : (
              <LuFile className="w-10 h-10" />
            )}
          </div>

          <h3 className="text-base font-semibold text-white break-all mb-1">{fileName}</h3>
          <p className="text-xs text-slate-400 mb-6 flex items-center gap-1 font-mono">
            <LuFolder className="w-3 h-3 text-slate-500" />
            <span className="truncate">{filePath}</span>
          </p>

          {ext === "SDOCX" && (
            <div className="w-full bg-amber-500/10 border border-amber-500/20 rounded-xl p-4 text-xs mb-6 text-left">
              <div className="flex items-center space-x-2 text-amber-300 font-semibold mb-1">
                <LuSparkles className="w-4 h-4 flex-shrink-0" />
                <span>Samsung Notes Ingestion</span>
              </div>
              <p className="text-slate-300 text-[11px] leading-relaxed mb-3">
                Curie extracts vector S Pen stylus drawings, audio lecture recordings, and OCR transcriptions into clean Obsidian Markdown.
              </p>

              {potentialNotePath ? (
                <div className="space-y-2">
                  <div className="text-[11px] text-emerald-400 flex items-center space-x-1">
                    <LuCheck className="w-3.5 h-3.5" />
                    <span>Converted note available:</span>
                    <span className="font-mono font-medium text-white">{potentialNotePath}</span>
                  </div>
                  <div className="flex gap-2 mt-2">
                    {onOpenNote && (
                      <button
                        onClick={() => onOpenNote(potentialNotePath)}
                        className="flex-1 py-2 px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs transition flex items-center justify-center space-x-1.5 shadow-sm"
                      >
                        <LuFileText className="w-3.5 h-3.5" />
                        <span>Open Converted Note</span>
                        <LuArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    <button
                      onClick={handleConvertSdocx}
                      disabled={isConverting}
                      className="py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition flex items-center justify-center space-x-1"
                      title="Re-convert note from raw archive"
                    >
                      <LuRefreshCw className={`w-3.5 h-3.5 ${isConverting ? "animate-spin" : ""}`} />
                      <span>Re-convert</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div>
                  <button
                    onClick={handleConvertSdocx}
                    disabled={isConverting}
                    className="w-full py-2.5 px-4 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white font-medium text-xs transition flex items-center justify-center space-x-2 shadow-md shadow-amber-600/20"
                  >
                    {isConverting ? (
                      <>
                        <LuLoaderCircle className="w-4 h-4 animate-spin" />
                        <span>{convertStatus || "Converting note..."}</span>
                      </>
                    ) : (
                      <>
                        <LuSparkles className="w-4 h-4" />
                        <span>Convert to Obsidian Note</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          )}

          <div className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs space-y-2 mb-6 text-left">
            <div className="flex justify-between items-center text-slate-400">
              <span>File Type</span>
              <span className={`font-mono text-[11px] px-2 py-0.5 rounded border ${getFileBadgeColor()}`}>
                .{ext.toLowerCase()} file
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Raw Archive</span>
              <span className="text-slate-400">Preserved in vault</span>
            </div>
          </div>

          <a
            href={downloadUrl}
            download={fileName}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center justify-center space-x-2 text-xs font-semibold shadow-md shadow-indigo-600/20"
          >
            <LuDownload className="w-4 h-4" />
            <span>Download Raw Archive</span>
          </a>
        </div>
      </div>
    </div>
  );
}
