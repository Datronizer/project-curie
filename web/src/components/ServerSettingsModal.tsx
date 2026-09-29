import { useState, useEffect } from "react";
import { api } from "../api/client";
import {
  LuServer,
  LuCircleCheck,
  LuCircleX,
  LuLoaderCircle,
  LuX,
} from "react-icons/lu";

interface ServerSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export default function ServerSettingsModal({
  isOpen,
  onClose,
  onSaved,
}: ServerSettingsModalProps) {
  const [serverUrl, setServerUrl] = useState("");
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message?: string;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setServerUrl(api.getBaseUrl() || "");
      setTestResult(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleTestConnection = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.testConnection(serverUrl);
      setTestResult(res);
    } catch (err: any) {
      setTestResult({
        success: false,
        message: err.message || "Failed to reach server",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleSave = () => {
    api.setBaseUrl(serverUrl);
    if (onSaved) onSaved();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-white transition"
        >
          <LuX className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <LuServer className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white">
              Curie Server Connection
            </h3>
            <p className="text-xs text-slate-400">
              Configure host for mobile or remote clients
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Server URL
            </label>
            <input
              type="url"
              placeholder="e.g. http://192.168.1.100:3000 or https://curie.myhome.net"
              value={serverUrl}
              onChange={(e) => {
                setServerUrl(e.target.value);
                setTestResult(null);
              }}
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/50"
            />
            <p className="text-[11px] text-slate-500 mt-1">
              Leave blank if accessing Curie Web hosted directly on the same domain/port.
            </p>
          </div>

          {testResult && (
            <div
              className={`p-3 rounded-xl border text-xs flex items-start space-x-2 ${
                testResult.success
                  ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                  : "bg-rose-500/10 border-rose-500/30 text-rose-400"
              }`}
            >
              {testResult.success ? (
                <LuCircleCheck className="w-4 h-4 flex-shrink-0 mt-0.5" />
              ) : (
                <LuCircleX className="w-4 h-4 flex-shrink-0 mt-0.5" />
              )}
              <span>
                {testResult.success
                  ? "Connection established! Curie API responded healthy."
                  : `Connection failed: ${testResult.message}`}
              </span>
            </div>
          )}

          <div className="flex items-center justify-between pt-2">
            <button
              type="button"
              onClick={handleTestConnection}
              disabled={testing}
              className="px-3 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 transition flex items-center space-x-1.5 disabled:opacity-50"
            >
              {testing ? (
                <>
                  <LuLoaderCircle className="w-3.5 h-3.5 animate-spin" />
                  <span>Testing...</span>
                </>
              ) : (
                <span>Test Connection</span>
              )}
            </button>

            <div className="flex items-center space-x-2">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-2 text-xs font-medium rounded-lg text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                className="px-4 py-2 text-xs font-medium rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition shadow-sm"
              >
                Save Server URL
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
