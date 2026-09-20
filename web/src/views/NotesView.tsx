import { useState, useEffect, useCallback } from "react";
import { useAuth } from "../contexts/AuthContext";
import { api, TreeNode } from "../api/client";
import FileTreeSidebar from "../components/FileTreeSidebar";
import NoteEditor from "../components/NoteEditor";
import PdfViewer from "../components/PdfViewer";
import NewNoteModal from "../components/NewNoteModal";
import { FileText, Loader2, BookOpen } from "lucide-react";

export default function NotesView() {
  const { activeVault } = useAuth();
  const [tree, setTree] = useState<TreeNode[]>([]);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>("");
  const [loadingTree, setLoadingTree] = useState(false);
  const [loadingFile, setLoadingFile] = useState(false);
  const [showNewNoteModal, setShowNewNoteModal] = useState(false);

  // Load vault directory tree
  const loadTree = useCallback(async () => {
    if (!activeVault) return;
    try {
      setLoadingTree(true);
      const data = await api.getVaultTree(activeVault.id);
      setTree(data);
    } catch (err) {
      console.error("Failed to load vault tree:", err);
    } finally {
      setLoadingTree(false);
    }
  }, [activeVault]);

  useEffect(() => {
    loadTree();
    setActivePath(null);
    setFileContent("");
  }, [activeVault, loadTree]);

  // Load selected file
  const handleSelectFile = async (path: string) => {
    if (!activeVault) return;
    setActivePath(path);

    if (path.toLowerCase().endsWith(".pdf")) {
      // PDF handled by PdfViewer component directly
      return;
    }

    try {
      setLoadingFile(true);
      const res = await api.getFileContent(activeVault.id, path);
      setFileContent(res.content);
    } catch (err) {
      console.error("Failed to read file:", err);
      setFileContent(`# Error\n\nFailed to load note: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLoadingFile(false);
    }
  };

  // Save current note
  const handleSaveNote = async (newContent: string) => {
    if (!activeVault || !activePath) return;
    await api.saveFileContent(activeVault.id, activePath, newContent);
    setFileContent(newContent);
  };

  // Helper to find file in tree matching a wikilink target
  const resolveWikiLink = (target: string, nodes: TreeNode[]): string | null => {
    const cleanTarget = target.trim().toLowerCase();
    const targetWithMd = cleanTarget.endsWith(".md") ? cleanTarget : `${cleanTarget}.md`;

    for (const node of nodes) {
      if (node.type === "file") {
        const nodeName = node.name.toLowerCase();
        const nodePath = node.path.toLowerCase();
        if (nodeName === targetWithMd || nodeName === cleanTarget || nodePath === targetWithMd || nodePath === cleanTarget) {
          return node.path;
        }
      } else if (node.type === "dir" && node.children) {
        const found = resolveWikiLink(target, node.children);
        if (found) return found;
      }
    }
    return null;
  };

  // Wikilink navigation handler
  const handleNavigateWikiLink = (target: string) => {
    const resolved = resolveWikiLink(target, tree);
    if (resolved) {
      handleSelectFile(resolved);
    } else {
      // Note doesn't exist yet, ask to create it
      if (confirm(`Note "[[${target}]]" was not found in vault. Create it now?`)) {
        const path = target.endsWith(".md") ? target : `${target}.md`;
        handleCreateNote(path);
      }
    }
  };

  // Create new note
  const handleCreateNote = async (fullPath: string) => {
    if (!activeVault) return;
    const baseName = fullPath.split("/").pop()?.replace(/\.md$/, "") || "Untitled";
    const initialContent = `# ${baseName}\n\n`;

    await api.saveFileContent(activeVault.id, fullPath, initialContent);
    await loadTree();
    await handleSelectFile(fullPath);
  };

  if (!activeVault) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
        <BookOpen className="w-12 h-12 text-slate-600 mb-3" />
        <p className="text-sm font-medium text-slate-300">No Active Vault</p>
        <p className="text-xs mt-1">Please select or create a vault in the top bar</p>
      </div>
    );
  }

  const isPdf = activePath?.toLowerCase().endsWith(".pdf");

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Sidebar Explorer */}
      <FileTreeSidebar
        tree={tree}
        activePath={activePath}
        onSelectFile={handleSelectFile}
        onNewNote={() => setShowNewNoteModal(true)}
        onRefresh={loadTree}
        isLoading={loadingTree}
      />

      {/* Main Content Workspace */}
      <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
        {loadingFile ? (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
            <Loader2 className="w-7 h-7 animate-spin text-indigo-500 mb-2" />
            <span className="text-xs">Loading note...</span>
          </div>
        ) : activePath ? (
          isPdf ? (
            <PdfViewer vaultId={activeVault.id} filePath={activePath} />
          ) : (
            <NoteEditor
              key={activePath}
              filePath={activePath}
              initialContent={fileContent}
              onSave={handleSaveNote}
              onNavigateWikiLink={handleNavigateWikiLink}
            />
          )
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
            <FileText className="w-12 h-12 text-slate-700 mb-3" />
            <h3 className="text-base font-medium text-slate-300">No Note Selected</h3>
            <p className="text-xs mt-1 text-slate-500 max-w-sm">
              Select a note or document from the explorer sidebar, or create a new note to start writing.
            </p>
            <button
              onClick={() => setShowNewNoteModal(true)}
              className="mt-4 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-sm"
            >
              Create Note
            </button>
          </div>
        )}
      </div>

      {/* New Note Dialog */}
      <NewNoteModal
        tree={tree}
        isOpen={showNewNoteModal}
        onClose={() => setShowNewNoteModal(false)}
        onCreate={handleCreateNote}
      />
    </div>
  );
}
