import React, { useState, useEffect, useRef, useCallback } from "react";
import MarkdownViewer from "./MarkdownViewer";
import {
  Eye,
  Edit3,
  Columns,
  Save,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
} from "lucide-react";

interface NoteEditorProps {
  filePath: string;
  initialContent: string;
  onSave: (content: string) => Promise<void>;
  onNavigateWikiLink: (target: string) => void;
}

export default function NoteEditor({
  filePath,
  initialContent,
  onSave,
  onNavigateWikiLink,
}: NoteEditorProps) {
  const [content, setContent] = useState(initialContent);
  const [savedContent, setSavedContent] = useState(initialContent);
  const [mode, setMode] = useState<"edit" | "preview" | "split">("preview");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);

  const autoSaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Sync content when filePath changes
  useEffect(() => {
    setContent(initialContent);
    setSavedContent(initialContent);
    setSaveError(null);
  }, [filePath, initialContent]);

  const isDirty = content !== savedContent;

  const performSave = useCallback(async (textToSave: string) => {
    if (isSaving) return;
    try {
      setIsSaving(true);
      setSaveError(null);
      await onSave(textToSave);
      setSavedContent(textToSave);
      setLastSavedTime(new Date());
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save note");
    } finally {
      setIsSaving(false);
    }
  }, [isSaving, onSave]);

  // Debounced auto-save (1.5 seconds after last change)
  useEffect(() => {
    if (!isDirty) return;

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    autoSaveTimerRef.current = setTimeout(() => {
      performSave(content);
    }, 1500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [content, isDirty, performSave]);

  // Handle Ctrl+S / Cmd+S
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (isDirty) {
          performSave(content);
        }
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [content, isDirty, performSave]);

  // Handle Tab key in textarea for indentation
  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const textarea = textareaRef.current;
      if (!textarea) return;

      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText =
        content.substring(0, start) + "  " + content.substring(end);
      setContent(newText);

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
    }
  };

  const fileName = filePath.split("/").pop() || filePath;

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 overflow-hidden">
      {/* Top Toolbar */}
      <div className="h-11 px-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between select-none">
        {/* Note Name & Dirty State */}
        <div className="flex items-center space-x-2">
          <FileText className="w-4 h-4 text-indigo-400" />
          <span className="font-semibold text-xs text-white truncate max-w-[200px] sm:max-w-md">
            {fileName}
          </span>

          {isDirty ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/15 text-amber-300 border border-amber-500/30">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse" />
              Unsaved
            </span>
          ) : isSaving ? (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-indigo-500/15 text-indigo-300 border border-indigo-500/30">
              <Clock className="w-2.5 h-2.5 mr-1 animate-spin" />
              Saving...
            </span>
          ) : (
            <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
              <CheckCircle2 className="w-2.5 h-2.5 mr-1" />
              Saved
            </span>
          )}

          {lastSavedTime && !isDirty && (
            <span className="text-[10px] text-slate-500 hidden md:inline">
              at {lastSavedTime.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950/70 p-0.5 rounded-lg border border-slate-800 text-slate-400">
            <button
              onClick={() => setMode("edit")}
              title="Edit Mode"
              className={`p-1 rounded text-xs transition ${
                mode === "edit"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "hover:text-slate-200"
              }`}
            >
              <Edit3 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setMode("split")}
              title="Split Mode"
              className={`p-1 rounded text-xs transition hidden sm:block ${
                mode === "split"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "hover:text-slate-200"
              }`}
            >
              <Columns className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setMode("preview")}
              title="Preview Mode"
              className={`p-1 rounded text-xs transition ${
                mode === "preview"
                  ? "bg-slate-800 text-white shadow-sm"
                  : "hover:text-slate-200"
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Manual Save Button */}
          <button
            onClick={() => performSave(content)}
            disabled={!isDirty || isSaving}
            className="flex items-center space-x-1 px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed shadow-sm"
          >
            <Save className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Save</span>
          </button>
        </div>
      </div>

      {saveError && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-red-400 text-xs flex items-center space-x-2">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>Save Error: {saveError}</span>
        </div>
      )}

      {/* Editor / Preview Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Editor Pane */}
        {(mode === "edit" || mode === "split") && (
          <div
            className={`flex-1 flex flex-col h-full bg-slate-950 ${
              mode === "split" ? "border-r border-slate-800" : ""
            }`}
          >
            <textarea
              ref={textareaRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              placeholder="Write your markdown note here... Tip: use [[Note Name]] for internal links"
              className="w-full flex-1 p-6 bg-transparent text-slate-200 font-mono text-xs md:text-sm leading-relaxed outline-none resize-none placeholder-slate-600 selection:bg-indigo-500/30"
              spellCheck={false}
            />
          </div>
        )}

        {/* Preview Pane */}
        {(mode === "preview" || mode === "split") && (
          <div className="flex-1 overflow-y-auto bg-slate-950/90">
            <MarkdownViewer
              content={content}
              onNavigateWikiLink={onNavigateWikiLink}
            />
          </div>
        )}
      </div>
    </div>
  );
}
