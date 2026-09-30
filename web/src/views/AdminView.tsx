import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api, Device, TreeNode } from "../api/client";
import {
  LuLaptop,
  LuTrash2,
  LuTriangleAlert,
  LuCircleCheck,
  LuRefreshCw,
  LuLoaderCircle,
  LuShield,
  LuGitMerge,
  LuArrowRight,
  LuFileText,
  LuColumns2,
  LuRows2,
  LuDownload,
  LuImage as LuImageIcon,
} from "react-icons/lu";

interface ConflictInfo {
  conflictPath: string;
  conflictFileName: string;
  primaryPath: string;
  deviceOrigin: string;
  timestamp: string;
  extension: string;
  isBinary: boolean;
  isImage: boolean;
}

interface DiffLine {
  type: "same" | "added" | "removed";
  text: string;
  oldLineNum?: number;
  newLineNum?: number;
}

function computeLineDiff(textA: string, textB: string): {
  diffLines: DiffLine[];
  additions: number;
  deletions: number;
} {
  const linesA = textA ? textA.split(/\r?\n/) : [];
  const linesB = textB ? textB.split(/\r?\n/) : [];

  const m = linesA.length;
  const n = linesB.length;

  if (textA === textB) {
    return {
      diffLines: linesA.map((line, idx) => ({
        type: "same",
        text: line,
        oldLineNum: idx + 1,
        newLineNum: idx + 1,
      })),
      additions: 0,
      deletions: 0,
    };
  }

  if (m === 0) {
    return {
      diffLines: linesB.map((line, idx) => ({
        type: "added",
        text: line,
        newLineNum: idx + 1,
      })),
      additions: n,
      deletions: 0,
    };
  }

  if (n === 0) {
    return {
      diffLines: linesA.map((line, idx) => ({
        type: "removed",
        text: line,
        oldLineNum: idx + 1,
      })),
      additions: 0,
      deletions: m,
    };
  }

  // Cap DP size for extreme cases (>1500 lines) to avoid browser freeze
  if (m * n > 1500 * 1500) {
    const combined: DiffLine[] = [
      ...linesA.map((l, i) => ({ type: "removed" as const, text: l, oldLineNum: i + 1 })),
      ...linesB.map((l, i) => ({ type: "added" as const, text: l, newLineNum: i + 1 })),
    ];
    return { diffLines: combined, additions: n, deletions: m };
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (linesA[i] === linesB[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const reversedDiff: DiffLine[] = [];
  let i = m;
  let j = n;
  let additions = 0;
  let deletions = 0;

  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && linesA[i - 1] === linesB[j - 1]) {
      reversedDiff.push({
        type: "same",
        text: linesA[i - 1],
        oldLineNum: i,
        newLineNum: j,
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      reversedDiff.push({
        type: "added",
        text: linesB[j - 1],
        newLineNum: j,
      });
      additions++;
      j--;
    } else if (i > 0 && (j === 0 || dp[i][j - 1] < dp[i - 1][j])) {
      reversedDiff.push({
        type: "removed",
        text: linesA[i - 1],
        oldLineNum: i,
      });
      deletions++;
      i--;
    }
  }

  return { diffLines: reversedDiff.reverse(), additions, deletions };
}

export default function AdminView() {
  const { device: currentDevice, activeVault, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"devices" | "conflicts">("devices");
  const [diffMode, setDiffMode] = useState<"unified" | "split">("unified");

  // Device Management State
  const [devices, setDevices] = useState<Device[]>([]);
  const [loadingDevices, setLoadingDevices] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);

  // Conflicts State
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [loadingConflicts, setLoadingConflicts] = useState(false);
  const [selectedConflict, setSelectedConflict] = useState<ConflictInfo | null>(null);
  const [primaryContent, setPrimaryContent] = useState<string>("");
  const [conflictContent, setConflictContent] = useState<string>("");
  const [loadingDiff, setLoadingDiff] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [resolutionSuccess, setResolutionSuccess] = useState<string | null>(null);

  // Load Devices
  const loadDevices = useCallback(async () => {
    try {
      setLoadingDevices(true);
      setDeviceError(null);
      const data = await api.listDevices();
      setDevices(data);
    } catch (err) {
      setDeviceError(err instanceof Error ? err.message : "Failed to load devices");
    } finally {
      setLoadingDevices(false);
    }
  }, []);

  // Revoke Device
  const handleRevoke = async (deviceId: string, deviceName: string) => {
    if (!confirm(`Are you sure you want to revoke "${deviceName}"? It will immediately lose sync access.`)) {
      return;
    }

    try {
      setRevokingId(deviceId);
      await api.revokeDevice(deviceId);
      if (deviceId === currentDevice?.id) {
        alert("You revoked your current web session. Signing out...");
        logout();
        return;
      }
      await loadDevices();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to revoke device");
    } finally {
      setRevokingId(null);
    }
  };

  // Load Conflicts in Active Vault
  const loadConflicts = useCallback(async () => {
    if (!activeVault) return;
    try {
      setLoadingConflicts(true);
      const data = await api.getVaultTree(activeVault.id);
      setTree(data);
      setSelectedConflict(null);
    } catch (err) {
      console.error("Failed to load vault files for conflicts:", err);
    } finally {
      setLoadingConflicts(false);
    }
  }, [activeVault]);

  useEffect(() => {
    if (activeTab === "devices") {
      loadDevices();
    } else {
      loadConflicts();
    }
  }, [activeTab, loadDevices, loadConflicts]);

  // Extract all conflict files matching `* (Conflict from *)*`
  const conflictList: ConflictInfo[] = useMemo(() => {
    const list: ConflictInfo[] = [];
    const conflictRegex = /^(.*) \(Conflict from (.*) (\d{4}-\d{2}-\d{2}[^)]*)\)(\.[a-zA-Z0-9]+)?$/;

    const findConflicts = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") {
          const match = node.name.match(conflictRegex);
          if (match) {
            const baseName = match[1];
            const deviceOrigin = match[2];
            const timestamp = match[3];
            const extension = match[4] || ".md";
            const extLower = extension.toLowerCase();
            const isBinary = ![".md", ".markdown", ".txt", ".json", ".yaml", ".yml"].includes(extLower);
            const isImage = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico", ".bmp"].includes(extLower);

            // Resolve primary file path in the same directory
            const dir = node.path.includes("/")
              ? node.path.substring(0, node.path.lastIndexOf("/"))
              : "";
            const primaryPath = dir ? `${dir}/${baseName}${extension}` : `${baseName}${extension}`;

            list.push({
              conflictPath: node.path,
              conflictFileName: node.name,
              primaryPath,
              deviceOrigin,
              timestamp,
              extension,
              isBinary,
              isImage,
            });
          }
        } else if (node.type === "dir" && node.children) {
          findConflicts(node.children);
        }
      }
    };

    findConflicts(tree);
    return list;
  }, [tree]);

  // Load diff content for selected conflict
  const handleSelectConflict = async (c: ConflictInfo) => {
    if (!activeVault) return;
    setSelectedConflict(c);
    setResolutionSuccess(null);

    if (c.isBinary) {
      setPrimaryContent("");
      setConflictContent("");
      return;
    }

    try {
      setLoadingDiff(true);
      // Fetch conflict copy
      const confRes = await api.getFileContent(activeVault.id, c.conflictPath);
      setConflictContent(confRes.content);

      // Fetch primary file (might not exist if deleted)
      try {
        const primRes = await api.getFileContent(activeVault.id, c.primaryPath);
        setPrimaryContent(primRes.content);
      } catch {
        setPrimaryContent("(Primary file does not exist or was removed)");
      }
    } catch (err) {
      console.error("Failed to fetch conflict contents:", err);
    } finally {
      setLoadingDiff(false);
    }
  };

  // Automatically select first conflict when available
  useEffect(() => {
    if (activeTab === "conflicts" && conflictList.length > 0 && !selectedConflict) {
      handleSelectConflict(conflictList[0]);
    }
  }, [activeTab, conflictList, selectedConflict]);

  // Resolution Actions
  const handleResolve = async (
    action: "keep_primary" | "keep_conflict" | "keep_both"
  ) => {
    if (!activeVault || !selectedConflict) return;

    try {
      setResolving(true);
      if (action === "keep_primary") {
        // Discard conflict copy by deleting it
        await api.deleteFile(activeVault.id, selectedConflict.conflictPath);
        setResolutionSuccess(`Kept primary version. Discarded "${selectedConflict.conflictFileName}".`);
      } else if (action === "keep_conflict") {
        // Overwrite primary file with conflict content, then delete conflict copy
        if (selectedConflict.isBinary) {
          const blob = await api.getBlob(activeVault.id, selectedConflict.conflictPath);
          await api.uploadBinary(activeVault.id, selectedConflict.primaryPath, blob);
        } else {
          await api.saveFileContent(activeVault.id, selectedConflict.primaryPath, conflictContent);
        }
        await api.deleteFile(activeVault.id, selectedConflict.conflictPath);
        setResolutionSuccess(`Replaced primary with conflict version from ${selectedConflict.deviceOrigin}.`);
      } else if (action === "keep_both") {
        // Save conflict file as a permanent clean copy
        const cleanName = selectedConflict.conflictPath.replace(
          / \(Conflict from [^)]*\)(\.[a-zA-Z0-9]+)?$/,
          ` (Conflict Copy ${selectedConflict.deviceOrigin})$1`
        );
        if (selectedConflict.isBinary) {
          const blob = await api.getBlob(activeVault.id, selectedConflict.conflictPath);
          await api.uploadBinary(activeVault.id, cleanName, blob);
        } else {
          await api.saveFileContent(activeVault.id, cleanName, conflictContent);
        }
        await api.deleteFile(activeVault.id, selectedConflict.conflictPath);
        setResolutionSuccess(`Preserved both notes. Saved copy as "${cleanName}".`);
      }

      await loadConflicts();
      setSelectedConflict(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to resolve conflict");
    } finally {
      setResolving(false);
    }
  };

  const diffResult = useMemo(() => {
    if (!selectedConflict || selectedConflict.isBinary) {
      return { diffLines: [], additions: 0, deletions: 0 };
    }
    return computeLineDiff(primaryContent, conflictContent);
  }, [selectedConflict, primaryContent, conflictContent]);

  const getDeviceStatus = (lastSeenAt?: string) => {
    if (!lastSeenAt) return { label: "Offline", color: "bg-slate-500/20 text-slate-400 border-slate-700/40" };
    const diffMs = Date.now() - new Date(lastSeenAt).getTime();
    if (diffMs < 5 * 60 * 1000) {
      return { label: "Active", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" };
    }
    if (diffMs < 24 * 60 * 60 * 1000) {
      return { label: "Idle", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" };
    }
    return { label: "Offline", color: "bg-slate-500/20 text-slate-400 border-slate-700/40" };
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Header with Sub-tabs */}
      <div className="px-6 pt-5 pb-3 border-b border-slate-800 flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <LuShield className="w-5 h-5 text-indigo-400" />
            <span>Admin Portal</span>
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Audit connected client devices and resolve vault synchronization conflicts
          </p>
        </div>

        <div className="flex items-center space-x-1 bg-slate-900 p-1 rounded-xl border border-slate-800">
          <button
            onClick={() => setActiveTab("devices")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "devices"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <LuLaptop className="w-3.5 h-3.5" />
            <span>Devices ({devices.length})</span>
          </button>
          <button
            onClick={() => setActiveTab("conflicts")}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition ${
              activeTab === "conflicts"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-white"
            }`}
          >
            <LuGitMerge className="w-3.5 h-3.5" />
            <span>Sync Conflicts ({conflictList.length})</span>
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-6">
        {activeTab === "devices" ? (
          /* TAB 1: CONNECTED DEVICES INVENTORY */
          <div className="max-w-4xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Registered Client Devices
              </span>
              <button
                onClick={loadDevices}
                disabled={loadingDevices}
                className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                <LuRefreshCw className={`w-3 h-3 ${loadingDevices ? "animate-spin" : ""}`} />
                <span>Refresh</span>
              </button>
            </div>

            {deviceError && (
              <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
                {deviceError}
              </div>
            )}

            {loadingDevices ? (
              <div className="py-12 text-center text-slate-500">
                <LuLoaderCircle className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
                <span className="text-xs">Loading registered devices...</span>
              </div>
            ) : devices.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-slate-800 rounded-xl text-slate-500 text-xs">
                No registered devices found
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-3">
                {devices.map((d) => {
                  const status = getDeviceStatus(d.lastSeenAt);
                  const isCurrent = d.id === currentDevice?.id;

                  return (
                    <div
                      key={d.id}
                      className="flex items-center justify-between p-4 rounded-xl bg-slate-900/60 border border-slate-800 hover:border-slate-700/80 transition"
                    >
                      <div className="flex items-center space-x-3.5">
                        <div className="w-10 h-10 rounded-xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center text-slate-300">
                          <LuLaptop className="w-5 h-5 text-indigo-400" />
                        </div>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-semibold text-white">
                              {d.name}
                            </span>
                            {isCurrent && (
                              <span className="px-2 py-0.5 rounded text-[10px] font-medium bg-indigo-500/20 text-indigo-300 border border-indigo-500/40">
                                This Browser
                              </span>
                            )}
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-medium border ${status.color}`}
                            >
                              {status.label}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500 mt-1 flex items-center space-x-4">
                            <span>ID: {d.id.slice(0, 8)}...</span>
                            <span>
                              Registered:{" "}
                              {d.createdAt
                                ? new Date(d.createdAt).toLocaleDateString()
                                : "N/A"}
                            </span>
                            <span>
                              Last seen:{" "}
                              {d.lastSeenAt
                                ? new Date(d.lastSeenAt).toLocaleString()
                                : "N/A"}
                            </span>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleRevoke(d.id, d.name)}
                        disabled={revokingId === d.id}
                        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10 text-xs font-medium transition disabled:opacity-50"
                      >
                        <LuTrash2 className="w-3.5 h-3.5" />
                        <span>{revokingId === d.id ? "Revoking..." : "Revoke"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* TAB 2: CONFLICT RESOLUTION CENTER */
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                  Detected Sync Conflicts ({activeVault?.name})
                </span>
                <p className="text-[11px] text-slate-500">
                  Side-by-side conflict files created during concurrent desktop/mobile sync
                </p>
              </div>
              <button
                onClick={loadConflicts}
                disabled={loadingConflicts}
                className="flex items-center space-x-1 text-xs text-indigo-400 hover:text-indigo-300 transition"
              >
                <LuRefreshCw className={`w-3 h-3 ${loadingConflicts ? "animate-spin" : ""}`} />
                <span>Rescan Vault</span>
              </button>
            </div>

            {resolutionSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2">
                <LuCircleCheck className="w-4 h-4 flex-shrink-0" />
                <span>{resolutionSuccess}</span>
              </div>
            )}

            {conflictList.length === 0 ? (
              <div className="p-10 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                <LuCircleCheck className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
                <h3 className="text-sm font-semibold text-white">No Sync Conflicts</h3>
                <p className="text-xs text-slate-500 mt-1">
                  All notes in vault "{activeVault?.name}" are fully synchronized and up to date.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Conflict List Sidebar */}
                <div className="border border-slate-800 rounded-xl bg-slate-900/40 p-2 space-y-1">
                  <span className="px-2 py-1 text-[11px] font-semibold text-slate-400 uppercase tracking-wider block">
                    Conflicted Notes
                  </span>
                  {conflictList.map((c) => {
                    const isSelected = selectedConflict?.conflictPath === c.conflictPath;
                    return (
                      <button
                        key={c.conflictPath}
                        onClick={() => handleSelectConflict(c)}
                        className={`w-full text-left p-2.5 rounded-lg text-xs transition block ${
                          isSelected
                            ? "bg-indigo-600/20 border border-indigo-500/40 text-white"
                            : "hover:bg-slate-800/60 text-slate-300"
                        }`}
                      >
                        <div className="flex items-center space-x-1.5 font-medium text-amber-300">
                          <LuTriangleAlert className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
                          <span className="truncate">{c.primaryPath}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 mt-1 truncate">
                          Origin: {c.deviceOrigin}
                        </div>
                      </button>
                    );
                  })}
                </div>

                {/* Diff & Resolution Panel */}
                <div className="md:col-span-2 border border-slate-800 rounded-xl bg-slate-900/60 p-4 flex flex-col min-h-[400px]">
                  {loadingDiff ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                      <LuLoaderCircle className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                      <span className="text-xs">Loading note versions...</span>
                    </div>
                  ) : selectedConflict ? (
                    <div className="flex-1 flex flex-col space-y-4">
                      {/* Resolution Actions & Diff Mode Bar */}
                      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs font-semibold text-white truncate max-w-[200px] md:max-w-xs">
                            {selectedConflict.primaryPath}
                          </span>
                          {!selectedConflict.isBinary && (
                            <div className="flex items-center space-x-1.5 text-[11px] font-mono">
                              <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                                +{diffResult.additions}
                              </span>
                              <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/30">
                                -{diffResult.deletions}
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="flex items-center space-x-2">
                          {!selectedConflict.isBinary && (
                            <div className="flex items-center bg-slate-900 border border-slate-800 rounded-lg p-0.5 mr-2">
                              <button
                                type="button"
                                onClick={() => setDiffMode("unified")}
                                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition ${
                                  diffMode === "unified"
                                    ? "bg-indigo-600 text-white shadow-xs font-medium"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="Unified diff view"
                              >
                                <LuRows2 className="w-3.5 h-3.5" />
                                <span>Unified</span>
                              </button>
                              <button
                                type="button"
                                onClick={() => setDiffMode("split")}
                                className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs transition ${
                                  diffMode === "split"
                                    ? "bg-indigo-600 text-white shadow-xs font-medium"
                                    : "text-slate-400 hover:text-white"
                                }`}
                                title="Side-by-side diff view"
                              >
                                <LuColumns2 className="w-3.5 h-3.5" />
                                <span>Split</span>
                              </button>
                            </div>
                          )}

                          <button
                            onClick={() => handleResolve("keep_primary")}
                            disabled={resolving}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition disabled:opacity-50 cursor-pointer"
                            title="Keep the original primary note and delete the conflict copy"
                          >
                            Keep Primary
                          </button>
                          <button
                            onClick={() => handleResolve("keep_conflict")}
                            disabled={resolving}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition disabled:opacity-50 shadow-sm cursor-pointer"
                            title={`Overwrite primary note with the conflict copy from ${selectedConflict.deviceOrigin}`}
                          >
                            Keep Conflict ({selectedConflict.deviceOrigin})
                          </button>
                          <button
                            onClick={() => handleResolve("keep_both")}
                            disabled={resolving}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition disabled:opacity-50 shadow-sm cursor-pointer"
                            title="Keep both notes by renaming the conflict copy to a permanent file"
                          >
                            Keep Both
                          </button>
                        </div>
                      </div>

                      {/* Origin Banner */}
                      <div className="px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs flex items-center justify-between">
                        <span>
                          Conflict created during sync from <strong>{selectedConflict.deviceOrigin}</strong> on{" "}
                          <strong>{selectedConflict.timestamp}</strong>
                        </span>
                        <span className="text-[10px] text-amber-400/80 font-mono uppercase">
                          {selectedConflict.extension.replace(".", "") || "FILE"}
                        </span>
                      </div>

                      {/* Conflict Content & Visual Diff */}
                      {selectedConflict.isBinary ? (
                        selectedConflict.isImage ? (
                          /* Visual Side-by-Side Image Comparison */
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[300px]">
                            <div className="flex flex-col border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                              <div className="px-3 py-2 bg-slate-900 border-b border-slate-800 text-xs font-semibold text-slate-300 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <LuImageIcon className="w-3.5 h-3.5 text-indigo-400" />
                                  <span>Primary Image</span>
                                </span>
                                <a
                                  href={api.getDownloadUrl(activeVault?.id || "", selectedConflict.primaryPath)}
                                  download
                                  className="text-indigo-400 hover:text-indigo-300 flex items-center gap-1 text-[11px]"
                                >
                                  <LuDownload className="w-3 h-3" />
                                  <span>Download</span>
                                </a>
                              </div>
                              <div className="flex-1 flex items-center justify-center p-4 bg-slate-950/60">
                                <img
                                  src={api.getDownloadUrl(activeVault?.id || "", selectedConflict.primaryPath)}
                                  alt="Primary Version"
                                  className="max-h-[350px] w-full object-contain rounded-lg border border-slate-800"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              </div>
                            </div>

                            <div className="flex flex-col border border-amber-500/30 rounded-xl bg-slate-950 overflow-hidden">
                              <div className="px-3 py-2 bg-amber-500/10 border-b border-amber-500/20 text-xs font-semibold text-amber-300 flex items-center justify-between">
                                <span className="flex items-center gap-1.5">
                                  <LuImageIcon className="w-3.5 h-3.5 text-amber-400" />
                                  <span>Conflict Copy ({selectedConflict.deviceOrigin})</span>
                                </span>
                                <a
                                  href={api.getDownloadUrl(activeVault?.id || "", selectedConflict.conflictPath)}
                                  download
                                  className="text-amber-400 hover:text-amber-300 flex items-center gap-1 text-[11px]"
                                >
                                  <LuDownload className="w-3 h-3" />
                                  <span>Download</span>
                                </a>
                              </div>
                              <div className="flex-1 flex items-center justify-center p-4 bg-slate-950/60">
                                <img
                                  src={api.getDownloadUrl(activeVault?.id || "", selectedConflict.conflictPath)}
                                  alt="Conflict Version"
                                  className="max-h-[350px] w-full object-contain rounded-lg border border-slate-800"
                                  onError={(e) => {
                                    (e.target as HTMLElement).style.display = "none";
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        ) : (
                          /* Non-image Binary Comparison */
                          <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-4 min-h-[250px]">
                            <div className="p-6 border border-slate-800 rounded-xl bg-slate-950 flex flex-col items-center justify-center text-center">
                              <LuFileText className="w-12 h-12 text-slate-500 mb-3" />
                              <h4 className="text-sm font-semibold text-white mb-1">Primary Version</h4>
                              <p className="text-xs text-slate-400 mb-4">{selectedConflict.primaryPath}</p>
                              <a
                                href={api.getDownloadUrl(activeVault?.id || "", selectedConflict.primaryPath)}
                                download
                                className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center space-x-1.5"
                              >
                                <LuDownload className="w-3.5 h-3.5" />
                                <span>Download Primary File</span>
                              </a>
                            </div>

                            <div className="p-6 border border-amber-500/30 rounded-xl bg-slate-950 flex flex-col items-center justify-center text-center">
                              <LuFileText className="w-12 h-12 text-amber-400 mb-3" />
                              <h4 className="text-sm font-semibold text-white mb-1">
                                Conflict Copy ({selectedConflict.deviceOrigin})
                              </h4>
                              <p className="text-xs text-slate-400 mb-4">{selectedConflict.conflictFileName}</p>
                              <a
                                href={api.getDownloadUrl(activeVault?.id || "", selectedConflict.conflictPath)}
                                download
                                className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium flex items-center space-x-1.5"
                              >
                                <LuDownload className="w-3.5 h-3.5" />
                                <span>Download Conflict Copy</span>
                              </a>
                            </div>
                          </div>
                        )
                      ) : diffMode === "unified" ? (
                        /* Unified Diff View */
                        <div className="flex-1 border border-slate-800 rounded-xl bg-slate-950 overflow-hidden flex flex-col">
                          <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                            <span>Unified Difference (Red: Primary Removed, Green: Conflict Added)</span>
                            <span className="text-[10px] text-slate-500">
                              Total diff lines: {diffResult.diffLines.length}
                            </span>
                          </div>
                          <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[600px] font-mono text-xs select-text">
                            <table className="w-full border-collapse">
                              <tbody>
                                {diffResult.diffLines.map((line, idx) => {
                                  const isAdded = line.type === "added";
                                  const isRemoved = line.type === "removed";
                                  const rowBg = isAdded
                                    ? "bg-emerald-950/40 hover:bg-emerald-950/60 text-emerald-200"
                                    : isRemoved
                                    ? "bg-rose-950/40 hover:bg-rose-950/60 text-rose-200"
                                    : "hover:bg-slate-900/50 text-slate-300";

                                  return (
                                    <tr key={idx} className={`${rowBg} transition-colors leading-relaxed`}>
                                      {/* Old line number */}
                                      <td className="w-10 px-2 py-0.5 text-right text-[10px] text-slate-600 select-none border-r border-slate-800/40 font-mono">
                                        {line.oldLineNum ?? ""}
                                      </td>
                                      {/* New line number */}
                                      <td className="w-10 px-2 py-0.5 text-right text-[10px] text-slate-600 select-none border-r border-slate-800/40 font-mono">
                                        {line.newLineNum ?? ""}
                                      </td>
                                      {/* Marker (+ / - / space) */}
                                      <td className="w-6 px-1.5 py-0.5 text-center select-none font-bold">
                                        {isAdded ? (
                                          <span className="text-emerald-400">+</span>
                                        ) : isRemoved ? (
                                          <span className="text-rose-400">-</span>
                                        ) : (
                                          <span className="text-slate-700"> </span>
                                        )}
                                      </td>
                                      {/* Code Content */}
                                      <td className="px-2 py-0.5 whitespace-pre-wrap break-all font-mono">
                                        {line.text || "\u00A0"}
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      ) : (
                        /* Split Side-by-Side Diff View */
                        <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[300px]">
                          {/* Primary Note Box */}
                          <div className="flex flex-col border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                            <div className="px-3 py-1.5 bg-slate-900 border-b border-slate-800 text-[11px] font-semibold text-slate-300 flex items-center justify-between">
                              <span>Primary Note ({selectedConflict.primaryPath})</span>
                              <span className="text-[10px] text-rose-400">-{diffResult.deletions} lines</span>
                            </div>
                            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[550px] font-mono text-xs select-text">
                              <table className="w-full border-collapse">
                                <tbody>
                                  {diffResult.diffLines
                                    .filter((l) => l.type !== "added")
                                    .map((line, idx) => (
                                      <tr
                                        key={idx}
                                        className={
                                          line.type === "removed"
                                            ? "bg-rose-950/40 text-rose-200"
                                            : "hover:bg-slate-900/50 text-slate-300"
                                        }
                                      >
                                        <td className="w-10 px-2 py-0.5 text-right text-[10px] text-slate-600 select-none border-r border-slate-800/40 font-mono">
                                          {line.oldLineNum}
                                        </td>
                                        <td className="w-5 px-1 text-center select-none font-bold text-rose-400">
                                          {line.type === "removed" ? "-" : " "}
                                        </td>
                                        <td className="px-2 py-0.5 whitespace-pre-wrap break-all font-mono">
                                          {line.text || "\u00A0"}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>

                          {/* Conflict Note Box */}
                          <div className="flex flex-col border border-amber-500/30 rounded-xl bg-slate-950 overflow-hidden">
                            <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                              <span>Conflict Copy ({selectedConflict.deviceOrigin})</span>
                              <span className="text-[10px] text-emerald-400">+{diffResult.additions} lines</span>
                            </div>
                            <div className="flex-1 overflow-x-auto overflow-y-auto max-h-[550px] font-mono text-xs select-text">
                              <table className="w-full border-collapse">
                                <tbody>
                                  {diffResult.diffLines
                                    .filter((l) => l.type !== "removed")
                                    .map((line, idx) => (
                                      <tr
                                        key={idx}
                                        className={
                                          line.type === "added"
                                            ? "bg-emerald-950/40 text-emerald-200"
                                            : "hover:bg-slate-900/50 text-slate-300"
                                        }
                                      >
                                        <td className="w-10 px-2 py-0.5 text-right text-[10px] text-slate-600 select-none border-r border-slate-800/40 font-mono">
                                          {line.newLineNum}
                                        </td>
                                        <td className="w-5 px-1 text-center select-none font-bold text-emerald-400">
                                          {line.type === "added" ? "+" : " "}
                                        </td>
                                        <td className="px-2 py-0.5 whitespace-pre-wrap break-all font-mono">
                                          {line.text || "\u00A0"}
                                        </td>
                                      </tr>
                                    ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6">
                      <LuArrowRight className="w-8 h-8 text-slate-600 mb-2" />
                      <span>Select a conflict note from the left list to inspect differences and resolve</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
