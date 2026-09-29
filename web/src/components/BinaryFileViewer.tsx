import { useState } from "react";
import { api } from "../api/client";
import {
  LuDownload,
  LuFile,
  LuFileText,
  LuFileCode,
  LuCopy,
  LuCheck,
  LuFolder,
} from "react-icons/lu";

interface BinaryFileViewerProps {
  vaultId: string;
  filePath: string;
}

export default function BinaryFileViewer({ vaultId, filePath }: BinaryFileViewerProps) {
  const [copied, setCopied] = useState(false);
  const downloadUrl = api.getDownloadUrl(vaultId, filePath);
  const fileName = filePath.split("/").pop() || "File";
  const ext = fileName.split(".").pop()?.toUpperCase() || "BIN";

  const handleCopyPath = () => {
    navigator.clipboard.writeText(filePath);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
      <div className="flex-1 flex items-center justify-center p-6">
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

          <div className="w-full bg-slate-950/80 border border-slate-800/80 rounded-xl p-4 text-xs space-y-2 mb-6 text-left">
            <div className="flex justify-between items-center text-slate-400">
              <span>File Type</span>
              <span className={`font-mono text-[11px] px-2 py-0.5 rounded border ${getFileBadgeColor()}`}>
                .{ext.toLowerCase()} file
              </span>
            </div>
            <div className="flex justify-between items-center text-slate-400">
              <span>Preview</span>
              <span className="text-slate-500 italic">No in-browser preview</span>
            </div>
          </div>

          <a
            href={downloadUrl}
            download={fileName}
            className="w-full py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white transition flex items-center justify-center space-x-2 text-xs font-semibold shadow-md shadow-indigo-600/20"
          >
            <LuDownload className="w-4 h-4" />
            <span>Download {fileName}</span>
          </a>
        </div>
      </div>
    </div>
  );
}
