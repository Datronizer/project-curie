import { useState, useMemo } from "react";
import { TreeNode } from "../api/client";
import {
  LuChevronDown,
  LuChevronRight,
  LuFolder,
  LuFolderOpen,
  LuFileText,
  LuFileCode,
  LuImage as LuImageIcon,
  LuFile,
  LuSearch,
  LuPlus,
  LuRefreshCw,
  LuMusic,
} from "react-icons/lu";

interface FileTreeSidebarProps {
  tree: TreeNode[];
  activePath: string | null;
  onSelectFile: (path: string) => void;
  onNewNote: () => void;
  onRefresh: () => void;
  isLoading: boolean;
}

export default function FileTreeSidebar({
  tree,
  activePath,
  onSelectFile,
  onNewNote,
  onRefresh,
  isLoading,
}: FileTreeSidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());

  const toggleDir = (dirPath: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(dirPath)) {
        next.delete(dirPath);
      } else {
        next.add(dirPath);
      }
      return next;
    });
  };

  // Filter tree recursively based on search query
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;

    const query = searchQuery.toLowerCase();
    const filterNodes = (nodes: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        if (node.type === "file") {
          if (node.name.toLowerCase().includes(query)) {
            result.push(node);
          }
        } else if (node.type === "dir") {
          const matchingChildren = node.children
            ? filterNodes(node.children)
            : [];
          if (node.name.toLowerCase().includes(query) || matchingChildren.length > 0) {
            result.push({
              ...node,
              children: matchingChildren.length > 0 ? matchingChildren : node.children,
            });
          }
        }
      }
      return result;
    };

    return filterNodes(tree);
  }, [tree, searchQuery]);

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split(".").pop()?.toLowerCase();
    if (ext === "md") {
      return <LuFileText className="w-4 h-4 text-indigo-400 flex-shrink-0" />;
    }
    if (ext === "pdf") {
      return <LuFileCode className="w-4 h-4 text-rose-400 flex-shrink-0" />;
    }
    if (["m4a", "mp3", "wav", "aac", "ogg", "amr"].includes(ext || "")) {
      return <LuMusic className="w-4 h-4 text-purple-400 flex-shrink-0" />;
    }
    if (ext === "sdocx") {
      return <LuFileText className="w-4 h-4 text-amber-400 flex-shrink-0" />;
    }
    if (["png", "jpg", "jpeg", "gif", "svg", "webp"].includes(ext || "")) {
      return <LuImageIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />;
    }
    return <LuFile className="w-4 h-4 text-slate-400 flex-shrink-0" />;
  };

  const renderNode = (node: TreeNode, depth: number = 0) => {
    const isExpanded =
      searchQuery.trim().length > 0 || expandedDirs.has(node.path);
    const isSelected = activePath === node.path;

    if (node.type === "dir") {
      return (
        <div key={node.path} className="select-none">
          <button
            onClick={() => toggleDir(node.path)}
            className="w-full flex items-center space-x-1.5 px-2 py-1 rounded-md text-xs text-slate-300 hover:text-white hover:bg-slate-800/60 transition group text-left"
            style={{ paddingLeft: `${depth * 14 + 8}px` }}
          >
            {isExpanded ? (
              <LuChevronDown className="w-3.5 h-3.5 text-slate-400 group-hover:text-slate-200" />
            ) : (
              <LuChevronRight className="w-3.5 h-3.5 text-slate-500 group-hover:text-slate-300" />
            )}
            {isExpanded ? (
              <LuFolderOpen className="w-4 h-4 text-indigo-400/80" />
            ) : (
              <LuFolder className="w-4 h-4 text-slate-400" />
            )}
            <span className="font-medium truncate">{node.name}</span>
          </button>

          {isExpanded && node.children && node.children.length > 0 && (
            <div>
              {node.children.map((child) => renderNode(child, depth + 1))}
            </div>
          )}
        </div>
      );
    }

    return (
      <div key={node.path} className="select-none">
        <button
          onClick={() => onSelectFile(node.path)}
          className={`w-full flex items-center space-x-2 px-2 py-1 rounded-md text-xs transition text-left ${
            isSelected
              ? "bg-indigo-600/20 text-indigo-200 font-medium border-l-2 border-indigo-500"
              : "text-slate-300 hover:text-white hover:bg-slate-800/50"
          }`}
          style={{ paddingLeft: `${depth * 14 + 16}px` }}
        >
          {getFileIcon(node.name)}
          <span className="truncate">{node.name}</span>
        </button>
      </div>
    );
  };

  return (
    <aside className="w-64 border-r border-slate-800 bg-slate-900/40 flex flex-col h-full select-none">
      {/* Search & Actions Bar */}
      <div className="p-3 border-b border-slate-800 space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Explorer
          </span>
          <div className="flex items-center space-x-1">
            <button
              onClick={onNewNote}
              title="New Note"
              className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition"
            >
              <LuPlus className="w-4 h-4 text-indigo-400" />
            </button>
            <button
              onClick={onRefresh}
              disabled={isLoading}
              title="Refresh tree"
              className="p-1 rounded-md hover:bg-slate-800 text-slate-400 hover:text-white transition disabled:opacity-50"
            >
              <LuRefreshCw
                className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`}
              />
            </button>
          </div>
        </div>

        <div className="relative">
          <LuSearch className="absolute left-2.5 top-2 w-3.5 h-3.5 text-slate-500 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search notes & files..."
            className="w-full bg-slate-950/70 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500 transition"
          />
        </div>
      </div>

      {/* Directory Tree */}
      <div className="flex-1 overflow-y-auto p-2 space-y-0.5">
        {filteredTree.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 italic">
            {searchQuery ? "No matching files" : "Vault is empty"}
          </div>
        ) : (
          filteredTree.map((node) => renderNode(node, 0))
        )}
      </div>
    </aside>
  );
}
