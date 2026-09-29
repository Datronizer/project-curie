import { useState, useEffect } from "react";
import { SharedFile, readSharedFileAsBlob, clearSharedFiles } from "../services/shareReceiver";
import { useAuth } from "../contexts/AuthContext";
import { api } from "../api/client";
import {
  LuCloudUpload,
  LuFileCheck,
  LuFolder,
  LuLoaderCircle,
  LuCircleAlert,
  LuFileText,
  LuFileCode,
  LuMusic,
  LuX,
} from "react-icons/lu";

interface ShareImportModalProps {
  files: SharedFile[];
  isOpen: boolean;
  onClose: () => void;
  onImportComplete?: () => void;
}

export default function ShareImportModal({
  files,
  isOpen,
  onClose,
  onImportComplete,
}: ShareImportModalProps) {
  const { vaults, activeVault, setActiveVault } = useAuth();
  const [selectedVaultId, setSelectedVaultId] = useState<string>("");
  const [targetFolder, setTargetFolder] = useState<string>("");
  const [importing, setImporting] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [successCount, setSuccessCount] = useState<number>(0);

  useEffect(() => {
    if (activeVault) {
      setSelectedVaultId(activeVault.id);
    } else if (vaults.length > 0) {
      setSelectedVaultId(vaults[0].id);
    }
  }, [activeVault, vaults]);

  if (!isOpen || files.length === 0) return null;

  const getIconForFile = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "sdocx") {
      return <LuFileText className="w-5 h-5 text-amber-400" />;
    }
    if (ext === "pdf") {
      return <LuFileCode className="w-5 h-5 text-rose-400" />;
    }
    if (["m4a", "mp3", "wav", "aac"].includes(ext || "")) {
      return <LuMusic className="w-5 h-5 text-purple-400" />;
    }
    return <LuFileCheck className="w-5 h-5 text-indigo-400" />;
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const handleImport = async () => {
    if (!selectedVaultId) {
      setError("Please select a target vault.");
      return;
    }

    try {
      setImporting(true);
      setError(null);
      let count = 0;

      for (const file of files) {
        const blob = await readSharedFileAsBlob(file);
        const folderPrefix = targetFolder.trim()
          ? `${targetFolder.trim().replace(/^\/+|\/+$/g, "")}/`
          : "";
        const destinationPath = `${folderPrefix}${file.name}`;

        await api.uploadBinary(
          selectedVaultId,
          destinationPath,
          blob,
          file.mimeType || "application/octet-stream"
        );
        count++;
        setSuccessCount(count);
      }

      await clearSharedFiles();
      if (onImportComplete) {
        onImportComplete();
      }
      onClose();
    } catch (err: any) {
      setError(err.message || "Failed to import shared file to vault");
    } finally {
      setImporting(false);
    }
  };

  const handleDismiss = async () => {
    await clearSharedFiles();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={handleDismiss}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <LuX className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <LuCloudUpload className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Import Shared Note
            </h3>
            <p className="text-xs text-slate-400">
              Received {files.length} file{files.length > 1 ? "s" : ""} from Samsung Notes / Device
            </p>
          </div>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-rose-400 text-xs">
            <LuCircleAlert className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {/* File List */}
        <div className="mb-4 max-h-48 overflow-y-auto space-y-2 pr-1">
          {files.map((f, i) => (
            <div
              key={i}
              className="flex items-center justify-between p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs"
            >
              <div className="flex items-center space-x-2.5 truncate mr-3">
                {getIconForFile(f.name)}
                <span className="font-medium text-slate-200 truncate">
                  {f.name}
                </span>
              </div>
              <span className="text-slate-500 flex-shrink-0 font-mono">
                {formatFileSize(f.size)}
              </span>
            </div>
          ))}
        </div>

        {/* Vault & Folder Selection */}
        <div className="space-y-3 mb-6">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Target Vault
            </label>
            <select
              value={selectedVaultId}
              onChange={(e) => {
                setSelectedVaultId(e.target.value);
                const found = vaults.find((v) => v.id === e.target.value);
                if (found) setActiveVault(found);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            >
              {vaults.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Destination Folder (Optional)
            </label>
            <div className="relative">
              <LuFolder className="absolute left-3 top-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              <input
                type="text"
                placeholder="e.g. notes or attachments (leave blank for root)"
                value={targetFolder}
                onChange={(e) => setTargetFolder(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700 rounded-xl pl-9 pr-3.5 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={handleDismiss}
            disabled={importing}
            className="px-4 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white transition disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={importing}
            className="px-5 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm flex items-center space-x-2 disabled:opacity-50"
          >
            {importing ? (
              <>
                <LuLoaderCircle className="w-3.5 h-3.5 animate-spin" />
                <span>
                  Importing ({successCount}/{files.length})...
                </span>
              </>
            ) : (
              <span>Import to Vault</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
