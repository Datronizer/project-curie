import { useState, useRef, useEffect } from "react";
import { api } from "../api/client";
import {
  LuPlay,
  LuPause,
  LuVolume2,
  LuVolumeX,
  LuRotateCcw,
  LuRotateCw,
  LuMusic,
  LuLoaderCircle,
  LuCircleAlert,
  LuDownload,
} from "react-icons/lu";

interface AudioPlayerProps {
  vaultId: string;
  filePath: string;
  autoPlay?: boolean;
}

export default function AudioPlayer({
  vaultId,
  filePath,
  autoPlay = false,
}: AudioPlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const progressBarRef = useRef<HTMLDivElement | null>(null);

  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  const fileName = filePath.split("/").pop() || filePath;

  // Load audio blob via authenticated API
  useEffect(() => {
    let active = true;
    let urlToRevoke: string | null = null;

    async function loadAudio() {
      try {
        setLoading(true);
        setError(null);
        const blob = await api.getBlob(vaultId, filePath);
        if (!active) return;

        const url = URL.createObjectURL(blob);
        urlToRevoke = url;
        setBlobUrl(url);
      } catch (err: any) {
        if (!active) return;
        setError(err.message || "Failed to load audio");
      } finally {
        if (active) setLoading(false);
      }
    }

    loadAudio();

    return () => {
      active = false;
      if (urlToRevoke) {
        URL.revokeObjectURL(urlToRevoke);
      }
    };
  }, [vaultId, filePath]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
      if (autoPlay) {
        audioRef.current.play().catch(() => {});
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!progressBarRef.current || !audioRef.current || !duration) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const newTime = pos * duration;
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const skipSeconds = (seconds: number) => {
    if (!audioRef.current || !duration) return;
    const newTime = Math.max(0, Math.min(duration, currentTime + seconds));
    audioRef.current.currentTime = newTime;
    setCurrentTime(newTime);
  };

  const cycleSpeed = () => {
    const rates = [1, 1.25, 1.5, 2];
    const nextIdx = (rates.indexOf(playbackRate) + 1) % rates.length;
    const nextRate = rates[nextIdx];
    setPlaybackRate(nextRate);
    if (audioRef.current) {
      audioRef.current.playbackRate = nextRate;
    }
  };

  const toggleMute = () => {
    if (!audioRef.current) return;
    const nextMuted = !isMuted;
    audioRef.current.muted = nextMuted;
    setIsMuted(nextMuted);
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  const formatTime = (timeInSec: number): string => {
    if (isNaN(timeInSec)) return "00:00";
    const minutes = Math.floor(timeInSec / 60);
    const seconds = Math.floor(timeInSec % 60);
    return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  };

  const progressPercent = duration ? (currentTime / duration) * 100 : 0;

  if (loading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-slate-400">
        <LuLoaderCircle className="w-8 h-8 animate-spin text-indigo-500 mb-3" />
        <p className="text-xs">Buffering audio recording...</p>
      </div>
    );
  }

  if (error || !blobUrl) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-rose-400">
        <LuCircleAlert className="w-10 h-10 mb-2 opacity-80" />
        <p className="text-sm font-medium">Failed to play audio</p>
        <p className="text-xs text-slate-500 mt-1">{error || "File unavailable"}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-slate-950">
      <audio
        ref={audioRef}
        src={blobUrl}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
      />

      {/* Top Header */}
      <div className="h-10 px-4 border-b border-slate-800 bg-slate-900/50 flex items-center justify-between">
        <div className="flex items-center space-x-2 text-xs text-slate-300 truncate">
          <LuMusic className="w-4 h-4 text-purple-400 flex-shrink-0" />
          <span className="font-medium text-white truncate">{fileName}</span>
          <span className="text-slate-500 text-[11px] truncate">({filePath})</span>
        </div>

        <a
          href={blobUrl}
          download={fileName}
          className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          title="Download audio recording"
        >
          <LuDownload className="w-4 h-4" />
        </a>
      </div>

      {/* Center Audio Deck */}
      <div className="flex-1 flex flex-col items-center justify-center p-8 max-w-xl mx-auto w-full">
        <div className="w-24 h-24 rounded-3xl bg-gradient-to-tr from-purple-600/30 to-indigo-600/20 border border-purple-500/30 flex items-center justify-center text-purple-400 shadow-xl shadow-purple-900/20 mb-6">
          <LuMusic className="w-12 h-12" />
        </div>

        <h3 className="text-lg font-semibold text-white text-center mb-1 truncate max-w-full">
          {fileName}
        </h3>
        <p className="text-xs text-slate-500 mb-8">Audio Lecture / Note Recording</p>

        {/* Progress Bar */}
        <div className="w-full mb-3">
          <div
            ref={progressBarRef}
            onClick={handleSeek}
            className="w-full h-2.5 bg-slate-800 rounded-full overflow-hidden cursor-pointer relative group"
          >
            <div
              className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-75"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 mt-1.5 px-0.5">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>

        {/* Playback Controls */}
        <div className="flex items-center justify-center space-x-6 my-4">
          <button
            onClick={() => skipSeconds(-15)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
            title="Rewind 15 seconds"
          >
            <LuRotateCcw className="w-5 h-5" />
          </button>

          <button
            onClick={togglePlay}
            className="w-14 h-14 rounded-2xl bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 transition transform active:scale-95"
            title={isPlaying ? "Pause" : "Play"}
          >
            {isPlaying ? (
              <LuPause className="w-6 h-6" />
            ) : (
              <LuPlay className="w-6 h-6 ml-0.5" />
            )}
          </button>

          <button
            onClick={() => skipSeconds(15)}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition"
            title="Fast forward 15 seconds"
          >
            <LuRotateCw className="w-5 h-5" />
          </button>
        </div>

        {/* Footer controls: Speed and Volume */}
        <div className="flex items-center justify-between w-full pt-6 border-t border-slate-800/60 mt-4 text-xs text-slate-400">
          <button
            onClick={cycleSpeed}
            className="px-2.5 py-1 rounded-lg bg-slate-800/70 hover:bg-slate-800 text-slate-300 font-mono transition"
            title="Playback speed"
          >
            {playbackRate}x
          </button>

          <div className="flex items-center space-x-2">
            <button
              onClick={toggleMute}
              className="text-slate-400 hover:text-white transition"
            >
              {isMuted || volume === 0 ? (
                <LuVolumeX className="w-4 h-4" />
              ) : (
                <LuVolume2 className="w-4 h-4" />
              )}
            </button>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={isMuted ? 0 : volume}
              onChange={handleVolumeChange}
              className="w-20 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
