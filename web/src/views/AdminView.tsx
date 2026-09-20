import { useState, useEffect, useCallback, useMemo } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api, Device, TreeNode } from "../api/client";
import {
  Laptop,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Loader2,
  Shield,
  GitMerge,
  ArrowRight,
} from "lucide-react";

interface ConflictInfo {
  conflictPath: string;
  conflictFileName: string;
  primaryPath: string;
  deviceOrigin: string;
  timestamp: string;
}

export default function AdminView() {
  const { device: currentDevice, activeVault, logout } = useAuth();
  const [activeTab, setActiveTab] = useState<"devices" | "conflicts">("devices");

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

  // Extract all conflict files matching `* (Conflict from *)*.md`
  const conflictList: ConflictInfo[] = useMemo(() => {
    const list: ConflictInfo[] = [];
    const conflictRegex = /^(.*) \(Conflict from (.*) (\d{4}-\d{2}-\d{2}[^)]*)\)\.md$/;

    const findConflicts = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "file") {
          const match = node.name.match(conflictRegex);
          if (match) {
            const baseName = match[1];
            const deviceOrigin = match[2];
            const timestamp = match[3];

            // Resolve primary file path in the same directory
            const dir = node.path.includes("/")
              ? node.path.substring(0, node.path.lastIndexOf("/"))
              : "";
            const primaryPath = dir ? `${dir}/${baseName}.md` : `${baseName}.md`;

            list.push({
              conflictPath: node.path,
              conflictFileName: node.name,
              primaryPath,
              deviceOrigin,
              timestamp,
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
        await api.saveFileContent(activeVault.id, selectedConflict.primaryPath, conflictContent);
        await api.deleteFile(activeVault.id, selectedConflict.conflictPath);
        setResolutionSuccess(`Replaced primary with conflict version from ${selectedConflict.deviceOrigin}.`);
      } else if (action === "keep_both") {
        // Save conflict file as a permanent clean copy: e.g. "Note (Archived Copy).md"
        const cleanName = selectedConflict.conflictPath.replace(
          / \(Conflict from .*\)\.md$/,
          ` (Conflict Copy ${selectedConflict.deviceOrigin}).md`
        );
        await api.saveFileContent(activeVault.id, cleanName, conflictContent);
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
            <Shield className="w-5 h-5 text-indigo-400" />
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
            <Laptop className="w-3.5 h-3.5" />
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
            <GitMerge className="w-3.5 h-3.5" />
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
                <RefreshCw className={`w-3 h-3 ${loadingDevices ? "animate-spin" : ""}`} />
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
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-indigo-500" />
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
                          <Laptop className="w-5 h-5 text-indigo-400" />
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
                        <Trash2 className="w-3.5 h-3.5" />
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
                <RefreshCw className={`w-3 h-3 ${loadingConflicts ? "animate-spin" : ""}`} />
                <span>Rescan Vault</span>
              </button>
            </div>

            {resolutionSuccess && (
              <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-xs flex items-center space-x-2">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                <span>{resolutionSuccess}</span>
              </div>
            )}

            {conflictList.length === 0 ? (
              <div className="p-10 text-center border border-dashed border-slate-800 rounded-2xl bg-slate-900/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto mb-2 opacity-80" />
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
                          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0 text-amber-400" />
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
                      <Loader2 className="w-6 h-6 animate-spin text-indigo-500 mb-2" />
                      <span className="text-xs">Loading note versions...</span>
                    </div>
                  ) : selectedConflict ? (
                    <div className="flex-1 flex flex-col space-y-4">
                      {/* Resolution Actions Bar */}
                      <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-xl flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-slate-300 font-medium">
                          Choose Resolution:
                        </div>
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleResolve("keep_primary")}
                            disabled={resolving}
                            className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition disabled:opacity-50"
                          >
                            Keep Primary
                          </button>
                          <button
                            onClick={() => handleResolve("keep_conflict")}
                            disabled={resolving}
                            className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white transition disabled:opacity-50 shadow-sm"
                          >
                            Keep Conflict ({selectedConflict.deviceOrigin})
                          </button>
                          <button
                            onClick={() => handleResolve("keep_both")}
                            disabled={resolving}
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition disabled:opacity-50 shadow-sm"
                          >
                            Keep Both
                          </button>
                        </div>
                      </div>

                      {/* Side-by-Side Comparison */}
                      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 min-h-[250px]">
                        {/* Primary Note Box */}
                        <div className="flex flex-col border border-slate-800 rounded-xl bg-slate-950 overflow-hidden">
                          <div className="px-3 py-1.5 bg-slate-900/90 border-b border-slate-800 text-[11px] font-semibold text-slate-300">
                            Primary Note ({selectedConflict.primaryPath})
                          </div>
                          <pre className="flex-1 p-3 text-xs font-mono text-slate-300 overflow-y-auto whitespace-pre-wrap">
                            {primaryContent}
                          </pre>
                        </div>

                        {/* Conflict Note Box */}
                        <div className="flex flex-col border border-amber-500/30 rounded-xl bg-slate-950 overflow-hidden">
                          <div className="px-3 py-1.5 bg-amber-500/10 border-b border-amber-500/20 text-[11px] font-semibold text-amber-300 flex items-center justify-between">
                            <span>Conflict Copy ({selectedConflict.deviceOrigin})</span>
                            <span className="text-[10px] text-slate-400">{selectedConflict.timestamp}</span>
                          </div>
                          <pre className="flex-1 p-3 text-xs font-mono text-amber-200/90 overflow-y-auto whitespace-pre-wrap">
                            {conflictContent}
                          </pre>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs text-center p-6">
                      <ArrowRight className="w-8 h-8 text-slate-600 mb-2" />
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
