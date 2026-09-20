import { useState, useEffect } from "react";
import { api } from "../api/client";
import { Download, Loader2, AlertCircle, FileCode } from "lucide-react";

interface PdfViewerProps {
  vaultId: string;
  filePath: string;
}

export default function PdfViewer({ vaultId, filePath }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fileName = filePath.split("/").pop() || filePath;

  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function loadPdf() {
      try {
        setLoading(true);
        setError(null);
        const blob = await api.getBlob(vaultId, filePath);
        if (!active) return;

        // Ensure blob has application/pdf MIME type
        const pdfBlob = new Blob([blob], { type: "application/pdf" });
        const url = URL.createObjectURL(pdfBlob);
        urlToRevoke = url;
        setBlobUrl(url);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load PDF");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadPdf();

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [vaultId, filePath]);

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950">
      {/* Top action bar */}
      <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-slate-300">
          <FileCode className="w-4 h-4 text-rose-400" />
          <span className="font-medium text-white">{fileName}</span>
          <span className="text-slate-500">({filePath})</span>
        </div>

        {blobUrl && (
          <a
            href={blobUrl}
            download={fileName}
            className="flex items-center space-x-1 px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 hover:text-white transition"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download PDF</span>
          </a>
        )}
      </div>

      {/* PDF Content Area */}
      <div className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-rose-500 mb-2" />
            <span className="text-xs">Loading PDF document...</span>
          </div>
        )}

        {error && (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950 text-slate-400 p-6 text-center">
            <AlertCircle className="w-8 h-8 text-rose-400 mb-2" />
            <span className="text-sm font-medium text-white mb-1">
              Failed to display PDF
            </span>
            <span className="text-xs text-slate-500 max-w-sm">{error}</span>
          </div>
        )}

        {blobUrl && !loading && (
          <iframe
            src={blobUrl}
            title={fileName}
            className="w-full h-full border-0 bg-slate-900"
          />
        )}
      </div>
    </div>
  );
}
