import React, { useState, useRef } from 'react';
import { Music, ChevronDown, Repeat } from 'lucide-react';

export interface MiniPlayerProps {
  track?: {
    title?: string;
    artist?: string;
    author?: string;
    cover?: string;
    thumbnail?: string;
    source?: string;
  };
  isPlaying?: boolean;
  isLoop?: boolean;
  onPlayPause?: () => void;
  onToggleLoop?: () => void;
  onClose?: () => void;
}

export function MiniPlayer({
  track,
  isPlaying,
  isLoop = false,
  onPlayPause,
  onToggleLoop,
  onClose,
}: MiniPlayerProps) {
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const startPosRef = useRef({ clientX: 0, clientY: 0, elemLeft: 0, elemTop: 0 });
  const hasDraggedRef = useRef(false);

  if (!track) return null;

  const coverImg = track.cover || track.thumbnail || '';
  const trackTitle = track.title || 'Memutar Musik';
  const trackArtist = track.artist || track.author || 'VNJAVA Music';

  const startDrag = (clientX: number, clientY: number, elem: HTMLElement) => {
    draggingRef.current = true;
    hasDraggedRef.current = false;
    const rect = elem.getBoundingClientRect();
    startPosRef.current = {
      clientX,
      clientY,
      elemLeft: rect.left,
      elemTop: rect.top,
    };

    const onMove = (moveX: number, moveY: number) => {
      if (!draggingRef.current) return;
      const dx = moveX - startPosRef.current.clientX;
      const dy = moveY - startPosRef.current.clientY;
      if (Math.hypot(dx, dy) > 5) {
        hasDraggedRef.current = true;
      }
      const newX = Math.max(8, Math.min(window.innerWidth - 64, startPosRef.current.elemLeft + dx));
      const newY = Math.max(10, Math.min(window.innerHeight - 70, startPosRef.current.elemTop + dy));
      setPosition({ x: newX, y: newY });
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const handleMouseUp = () => {
      draggingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleTouchEnd = () => {
      draggingRef.current = false;
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('touchend', handleTouchEnd);
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    startDrag(e.clientX, e.clientY, e.currentTarget);
  };

  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (e.touches[0]) {
      startDrag(e.touches[0].clientX, e.touches[0].clientY, e.currentTarget);
    }
  };

  const handleClickCircle = () => {
    if (!hasDraggedRef.current) {
      setIsMinimized(false);
    }
  };

  if (isMinimized) {
    const bubbleStyle: React.CSSProperties = position
      ? {
          position: 'fixed',
          left: `${position.x}px`,
          top: `${position.y}px`,
          touchAction: 'none',
          userSelect: 'none',
        }
      : {
          position: 'fixed',
          top: '60px',
          left: '16px',
          touchAction: 'none',
          userSelect: 'none',
        };

    return (
      <div
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleClickCircle}
        style={bubbleStyle}
        className="z-[999] w-[56px] h-[56px] rounded-full bg-[#2a2a2a] border-2 border-zinc-600 shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none group active:scale-95 transition-transform"
        title="Geser posisi • Klik untuk kembali jadi bar panjang"
      >
        {coverImg ? (
          <img
            src={coverImg}
            alt={trackTitle}
            className={`w-full h-full object-cover pointer-events-none select-none ${
              isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''
            }`}
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-[#161616] flex items-center justify-center pointer-events-none">
            <Music className={`w-6 h-6 text-white ${isPlaying ? 'animate-pulse' : ''}`} />
          </div>
        )}

        {isPlaying && (
          <div className="absolute -top-1 -right-1 w-4 h-4 bg-sky-500 rounded-full border-2 border-black flex items-center justify-center z-20 shadow-[0_0_8px_rgba(56,189,248,0.6)] pointer-events-none">
            <div className="w-1.5 h-1.5 bg-white rounded-full" />
          </div>
        )}

        {isPlaying && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center pointer-events-none">
            <div className="w-2.5 h-2.5 bg-sky-400 rounded-full" />
          </div>
        )}

        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-white text-[10px] font-bold drop-shadow">▲</span>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full bg-[#0A0A0A] border border-white/10 rounded-2xl px-3 py-2 flex flex-col gap-1 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 overflow-hidden min-w-0 mr-2">
          <div
            onClick={() => setIsMinimized(true)}
            className="w-9 h-9 rounded-full bg-[#141414] overflow-hidden border border-white/10 flex items-center justify-center shrink-0 relative cursor-pointer"
            title="Klik untuk perkecil jadi bulet"
          >
            {coverImg ? (
              <img
                src={coverImg}
                alt={trackTitle}
                className="w-full h-full object-cover"
              />
            ) : (
              <Music className="w-4 h-4 text-white" />
            )}
          </div>

          <div className="overflow-hidden min-w-0">
            <p className="text-[13px] font-bold text-white truncate max-w-[170px]">
              {trackTitle}
            </p>
            <p className="text-[11px] text-[#B3B3B3] truncate">
              {trackArtist} · TikTok Sound
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            onClick={() => setIsMinimized(true)}
            className="w-8 h-8 rounded-full bg-[#1C1C1C] text-white flex items-center justify-center cursor-pointer"
            title="Minimize Player"
          >
            <ChevronDown className="w-4 h-4" />
          </button>

          <button
            onClick={onPlayPause}
            className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-pointer text-xs font-bold"
            title={isPlaying ? 'Jeda' : 'Putar'}
          >
            {isPlaying ? '❚❚' : '▶'}
          </button>

          {onToggleLoop && (
            <button
              type="button"
              onClick={onToggleLoop}
              className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border transition ${
                isLoop
                  ? 'bg-white text-black border-white shadow-[0_0_8px_rgba(255,255,255,0.45)]'
                  : 'bg-[#1C1C1C] text-white/45 border-white/15'
              }`}
              title={isLoop ? 'Loop Aktif' : 'Loop Nonaktif'}
              aria-pressed={isLoop}
            >
              <Repeat className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-[#1C1C1C] text-white flex items-center justify-center cursor-pointer text-xs"
            title="Tutup Musik"
          >
            ✕
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between px-0.5">
        <span className={`text-[9px] font-mono uppercase tracking-wider ${isLoop ? 'text-white font-bold' : 'text-white/45'}`}>
          {isLoop ? 'LOOP: ON' : 'LOOP: OFF'}
        </span>
      </div>
    </div>
  );
}

export default MiniPlayer;
export const MusicPlayerBar = MiniPlayer;
