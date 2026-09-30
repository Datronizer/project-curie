import React, { useState, useRef, useEffect } from "react";
import { api } from "../api/client";
import {
  LuZoomIn,
  LuZoomOut,
  LuMaximize2,
  LuDownload,
  LuImage as LuImageIcon,
  LuLoaderCircle,
  LuTriangleAlert,
} from "react-icons/lu";

interface ImageViewerProps {
  vaultId: string;
  filePath: string;
}

export default function ImageViewer({ vaultId, filePath }: ImageViewerProps) {
  const [scale, setScale] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const downloadUrl = api.getDownloadUrl(vaultId, filePath);
  const fileName = filePath.split("/").pop() || "Image";

  useEffect(() => {
    // Reset view when file changes
    setScale(1);
    setPosition({ x: 0, y: 0 });
    setLoading(true);
    setError(null);
    setDimensions(null);

    let active = true;
    let urlToRevoke: string | null = null;

    async function fetchImage() {
      try {
        const blob = await api.getBlob(vaultId, filePath);
        if (!active) return;
        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setBlobUrl(url);
      } catch (err: any) {
        if (!active) return;
        // Fall back to downloadUrl directly
        setBlobUrl(downloadUrl);
      }
    }

    fetchImage();

    return () => {
      active = false;
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
    };
  }, [vaultId, filePath, downloadUrl]);

  const handleZoomIn = () => {
    setScale((prev) => Math.min(prev * 1.25, 5));
  };

  const handleZoomOut = () => {
    setScale((prev) => Math.max(prev / 1.25, 0.2));
  };

  const handleResetZoom = () => {
    setScale(1);
    setPosition({ x: 0, y: 0 });
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (scale <= 1) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      setScale((prev) => Math.min(prev * 1.1, 5));
    } else {
      setScale((prev) => Math.max(prev / 1.1, 0.2));
    }
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    setDimensions({ width: img.naturalWidth, height: img.naturalHeight });
    setLoading(false);
  };

  const handleImageError = () => {
    setError("Failed to load image from server.");
    setLoading(false);
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950 select-none overflow-hidden">
      {/* Header Toolbar */}
      <div className="h-12 px-4 border-b border-slate-800 bg-slate-900/60 flex items-center justify-between flex-shrink-0 z-10">
        <div className="flex items-center space-x-2.5 truncate mr-4">
          <LuImageIcon className="w-4 h-4 text-emerald-400 flex-shrink-0" />
          <span className="text-xs font-semibold text-white truncate">{fileName}</span>
          {dimensions && (
            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
              ({dimensions.width} × {dimensions.height} px)
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1.5 flex-shrink-0">
          <span className="text-[11px] font-mono text-slate-400 w-12 text-center">
            {Math.round(scale * 100)}%
          </span>

          <button
            onClick={handleZoomOut}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom Out"
          >
            <LuZoomOut className="w-4 h-4" />
          </button>

          <button
            onClick={handleZoomIn}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Zoom In"
          >
            <LuZoomIn className="w-4 h-4" />
          </button>

          <button
            onClick={handleResetZoom}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
            title="Fit to Screen"
          >
            <LuMaximize2 className="w-4 h-4" />
          </button>

          <div className="h-4 w-px bg-slate-800 mx-1" />

          <a
            href={downloadUrl}
            download={fileName}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition flex items-center space-x-1"
            title="Download Image"
          >
            <LuDownload className="w-4 h-4 text-indigo-400" />
          </a>
        </div>
      </div>

      {/* Viewport Canvas */}
      <div
        ref={containerRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        className={`flex-1 relative flex items-center justify-center overflow-hidden p-4 ${
          scale > 1 ? (isDragging ? "cursor-grabbing" : "cursor-grab") : "cursor-default"
        }`}
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.05) 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      >
        {loading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 z-20">
            <LuLoaderCircle className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <span className="text-xs">Loading image...</span>
          </div>
        )}

        {error ? (
          <div className="flex flex-col items-center justify-center p-6 text-center text-rose-400">
            <LuTriangleAlert className="w-10 h-10 mb-2 opacity-80" />
            <p className="text-sm font-semibold">{error}</p>
            <p className="text-xs text-slate-500 mt-1">Path: {filePath}</p>
          </div>
        ) : (
          <img
            src={blobUrl || downloadUrl}
            alt={fileName}
            onLoad={handleImageLoad}
            onError={handleImageError}
            draggable={false}
            style={{
              transform: `translate(${position.x}px, ${position.y}px) scale(${scale})`,
              transition: isDragging ? "none" : "transform 0.15s ease-out",
              maxWidth: "100%",
              maxHeight: "100%",
              objectFit: "contain",
            }}
            className="rounded-lg shadow-2xl transition-opacity duration-200"
          />
        )}
      </div>
    </div>
  );
}
