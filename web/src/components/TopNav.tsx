import { useState, useRef, useEffect } from "react";
import { useAuth } from "../contexts/AuthContext";
import {
  Database,
  ChevronDown,
  LogOut,
  User as UserIcon,
  Shield,
  FileText,
  Plus,
  Laptop,
} from "lucide-react";
import { api } from "../api/client";

interface TopNavProps {
  currentView: "notes" | "admin";
  onViewChange: (view: "notes" | "admin") => void;
}

export default function TopNav({ currentView, onViewChange }: TopNavProps) {
  const { user, device, vaults, activeVault, setActiveVault, refreshVaults, logout } =
    useAuth();
  const [vaultDropdownOpen, setVaultDropdownOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [newVaultName, setNewVaultName] = useState("");
  const [creatingVault, setCreatingVault] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  const vaultDropdownRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        vaultDropdownRef.current &&
        !vaultDropdownRef.current.contains(event.target as Node)
      ) {
        setVaultDropdownOpen(false);
      }
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleCreateVault = async () => {
    if (!newVaultName.trim()) return;
    try {
      setCreatingVault(true);
      const newV = await api.createVault(newVaultName.trim());
      await refreshVaults();
      setActiveVault(newV);
      setNewVaultName("");
      setShowCreateModal(false);
      setVaultDropdownOpen(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create vault");
    } finally {
      setCreatingVault(false);
    }
  };

  return (
    <>
      <header className="h-14 border-b border-slate-800 bg-slate-900/80 backdrop-blur-md px-4 flex items-center justify-between select-none z-30">
        {/* Left: Brand + Vault Selector */}
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-indigo-400 font-bold text-base tracking-wide">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <svg
                className="w-4 h-4"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <circle cx="12" cy="12" r="10" />
                <path d="m4.93 4.93 4.24 4.24" />
                <path d="m14.83 9.17 4.24-4.24" />
                <path d="m14.83 14.83 4.24 4.24" />
                <path d="m9.17 14.83-4.24 4.24" />
                <circle cx="12" cy="12" r="4" />
              </svg>
            </div>
            <span className="hidden sm:inline text-white">Curie</span>
          </div>

          <div className="h-5 w-px bg-slate-800 hidden sm:block" />

          {/* Active Vault Dropdown */}
          <div className="relative" ref={vaultDropdownRef}>
            <button
              onClick={() => setVaultDropdownOpen(!vaultDropdownOpen)}
              className="flex items-center space-x-2 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-800 text-slate-200 hover:text-white border border-slate-700/60 transition text-xs font-medium"
            >
              <Database className="w-3.5 h-3.5 text-indigo-400" />
              <span className="max-w-[140px] truncate">
                {activeVault ? activeVault.name : "Select Vault"}
              </span>
              <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
            </button>

            {vaultDropdownOpen && (
              <div className="absolute left-0 mt-2 w-56 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-fadeIn">
                <div className="px-3 py-1.5 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                  Vaults
                </div>
                {vaults.map((vault) => (
                  <button
                    key={vault.id}
                    onClick={() => {
                      setActiveVault(vault);
                      setVaultDropdownOpen(false);
                    }}
                    className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between transition ${
                      activeVault?.id === vault.id
                        ? "bg-indigo-600/20 text-indigo-300 font-medium"
                        : "text-slate-300 hover:bg-slate-800 hover:text-white"
                    }`}
                  >
                    <span className="truncate">{vault.name}</span>
                    {activeVault?.id === vault.id && (
                      <span className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    )}
                  </button>
                ))}
                {vaults.length === 0 && (
                  <div className="px-3 py-2 text-xs text-slate-500 italic">
                    No vaults found
                  </div>
                )}
                <div className="border-t border-slate-800 mt-1 pt-1">
                  <button
                    onClick={() => {
                      setShowCreateModal(true);
                      setVaultDropdownOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs text-indigo-400 hover:bg-slate-800 flex items-center space-x-2 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Create New Vault</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Center: View Navigation */}
        <div className="flex items-center space-x-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800/80">
          <button
            onClick={() => onViewChange("notes")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
              currentView === "notes"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            <span>Notes</span>
          </button>
          <button
            onClick={() => onViewChange("admin")}
            className={`flex items-center space-x-1.5 px-3 py-1 rounded-lg text-xs font-medium transition ${
              currentView === "admin"
                ? "bg-indigo-600 text-white shadow-sm"
                : "text-slate-400 hover:text-slate-200"
            }`}
          >
            <Shield className="w-3.5 h-3.5" />
            <span>Admin</span>
          </button>
        </div>

        {/* Right: User Profile & Device & Logout */}
        <div className="flex items-center space-x-3">
          {device && (
            <div className="hidden md:flex items-center space-x-1.5 px-2.5 py-1 rounded-full bg-slate-800/50 border border-slate-700/50 text-[11px] text-slate-400">
              <Laptop className="w-3 h-3 text-emerald-400" />
              <span className="max-w-[120px] truncate">{device.name}</span>
            </div>
          )}

          <div className="relative" ref={userMenuRef}>
            <button
              onClick={() => setUserMenuOpen(!userMenuOpen)}
              className="flex items-center space-x-2 p-1.5 rounded-lg hover:bg-slate-800 text-slate-300 hover:text-white transition"
            >
              <div className="w-7 h-7 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-xs font-semibold text-white">
                {user?.name?.[0]?.toUpperCase() || <UserIcon className="w-4 h-4" />}
              </div>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>

            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-52 bg-slate-900 border border-slate-800 rounded-xl shadow-xl py-1 z-50 animate-fadeIn">
                <div className="px-3 py-2 border-b border-slate-800">
                  <p className="text-xs font-medium text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-[11px] text-slate-400 truncate mt-0.5">
                    {user?.email}
                  </p>
                </div>

                <button
                  onClick={() => {
                    setUserMenuOpen(false);
                    logout();
                  }}
                  className="w-full text-left px-3 py-2 text-xs text-red-400 hover:bg-red-500/10 flex items-center space-x-2 transition"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  <span>Sign Out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* New Vault Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-base font-bold text-white mb-1">
              Create New Vault
            </h2>
            <p className="text-xs text-slate-400 mb-4">
              Enter a name for the new markdown vault.
            </p>

            <input
              type="text"
              autoFocus
              value={newVaultName}
              onChange={(e) => setNewVaultName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreateVault();
              }}
              placeholder="e.g., Personal Notes"
              className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
            />

            <div className="flex justify-end space-x-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleCreateVault}
                disabled={creatingVault || !newVaultName.trim()}
                className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition disabled:opacity-50"
              >
                {creatingVault ? "Creating..." : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
