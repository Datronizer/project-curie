import { useState, useMemo } from "react";
import { TreeNode } from "../api/client";
import { FilePlus, Folder, X } from "lucide-react";

interface NewNoteModalProps {
  tree: TreeNode[];
  isOpen: boolean;
  onClose: () => void;
  onCreate: (filePath: string) => Promise<void>;
}

export default function NewNoteModal({
  tree,
  isOpen,
  onClose,
  onCreate,
}: NewNoteModalProps) {
  const [noteTitle, setNoteTitle] = useState("");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Collect all directories in the vault tree
  const folders = useMemo(() => {
    const list: string[] = [];
    const extractDirs = (nodes: TreeNode[]) => {
      for (const node of nodes) {
        if (node.type === "dir") {
          list.push(node.path);
          if (node.children) extractDirs(node.children);
        }
      }
    };
    extractDirs(tree);
    return list;
  }, [tree]);

  if (!isOpen) return null;

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const cleanTitle = noteTitle.trim();
    if (!cleanTitle) {
      setError("Please enter a note title");
      return;
    }

    const fileName = cleanTitle.endsWith(".md") ? cleanTitle : `${cleanTitle}.md`;
    const fullPath = selectedFolder ? `${selectedFolder}/${fileName}` : fileName;

    try {
      setLoading(true);
      setError(null);
      await onCreate(fullPath);
      setNoteTitle("");
      setSelectedFolder("");
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create note");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl animate-fadeIn">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-2 text-white">
            <div className="w-8 h-8 rounded-lg bg-indigo-600/30 border border-indigo-500/40 flex items-center justify-center text-indigo-400">
              <FilePlus className="w-4 h-4" />
            </div>
            <h2 className="text-base font-bold">Create New Note</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {error && (
          <div className="mb-4 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Note Title
            </label>
            <input
              type="text"
              autoFocus
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              placeholder="e.g. Sprint Retrospective"
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5 uppercase tracking-wider">
              Destination Folder
            </label>
            <div className="relative">
              <Folder className="absolute left-3 top-2.5 w-4 h-4 text-slate-500 pointer-events-none" />
              <select
                value={selectedFolder}
                onChange={(e) => setSelectedFolder(e.target.value)}
                className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">Vault Root (/)</option>
                {folders.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="pt-2 flex justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !noteTitle.trim()}
              className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-medium text-white transition disabled:opacity-50 shadow-sm"
            >
              {loading ? "Creating..." : "Create Note"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
