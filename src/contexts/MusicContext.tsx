import React, { createContext, useContext, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Play,
  Pause,
  X,
  Music,
  ChevronDown,
  Heart,
  Shuffle,
  Repeat,
  SkipBack,
  SkipForward,
  Volume2,
  Youtube,
  Disc3,
  ListMusic,
  Download,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  WifiOff,
  Loader2,
  Gauge,
} from 'lucide-react';
import { getApiBaseUrl } from '../lib/apiBase.ts';
import { isApkWebView, safeApiFetch } from '../lib/zeDataSync.ts';
import {
  loadVNMusicSettings,
  saveVNMusicSettings,
  loadOfflineMetaIndexSync,
  getAllOfflineTrackMeta,
  getOfflineTrackRecord,
  deleteOfflineTrackRecord,
  clearAllOfflineTracks,
  downloadFullSongToOffline,
  isWifiConnection,
  type VNMusicSettings,
  type OfflineTrackMeta,
  type DownloadProgressState,
} from '../lib/offlineMusicDb.ts';

declare global {
  interface Window {
    mainAudio?: HTMLAudioElement;
    __zeMusicControl?: (action: string) => void;
  }
}

if (typeof window !== 'undefined') {
  if (!window.mainAudio) {
    window.mainAudio = new Audio();
  }
}

export type TrackSourceType =
  | 'tiktok'
  | 'youtube'
  | 'web'
  | 'itunes'
  | 'deezer'
  | 'jamendo'
  | 'soundcloud'
  | 'audius'
  | 'offline';

export interface TrackData {
  id?: string;
  title: string;
  thumbnail?: string;
  cover?: string;
  url?: string;
  videoUrl?: string;
  audioUrl?: string;
  previewUrl?: string;
  fullAudioUrl?: string;
  youtubeId?: string;
  youtubeDurationSec?: number;
  playbackMode?: 'full' | 'youtube' | 'preview' | 'offline';
  isPreviewFallback?: boolean;
  isCatalogSearch?: boolean;
  resolvedSourceLabel?: string;
  album?: string;
  durationMs?: number;
  source: TrackSourceType;
  sourceType?: TrackSourceType;
  author?: string;
  artist?: string;
  sourceUrl?: string;
  isrc?: string;
  releaseYear?: string;
  genre?: string;
  lyrics?: any;
}

export interface MusicProgressContextType {
  currentTimeSec: number;
  durationSec: number;
}

const MusicProgressContext = createContext<MusicProgressContextType>({
  currentTimeSec: 0,
  durationSec: 0,
});

export function useMusicProgress() {
  return useContext(MusicProgressContext);
}

export function toMusicThumbUrl(url?: string): string {
  if (!url) return '';
  return url
    .replace(/600x600bb/gi, '100x100bb')
    .replace(/600x600/gi, '100x100')
    .replace(/320x320bb/gi, '100x100bb');
}

export function toMusicHdUrl(url?: string): string {
  if (!url) return '';
  return url
    .replace(/100x100bb/gi, '320x320bb')
    .replace(/100x100/gi, '320x320')
    .replace(/600x600bb/gi, '320x320bb')
    .replace(/600x600/gi, '320x320');
}

const PRELOADED_COVER_SET = new Set<string>();

export interface MusicContextType {
  currentTrack: TrackData | null;
  isPlaying: boolean;
  playlist: TrackData[];
  volume: number;
  playbackRate: number;
  isLoop: boolean;
  isShuffle: boolean;
  youtubeId: string | null;
  playNonce: number;
  likedTrackIds: string[];
  likedTracks: TrackData[];
  isFullPlayerOpen: boolean;
  ytStatusText: string;
  musicSettings: VNMusicSettings;
  offlineTracks: OfflineTrackMeta[];
  offlineTrackIds: Set<string>;
  downloadProgressMap: Record<string, DownloadProgressState>;
  downloadNotice: string | null;
  setDownloadNotice: (msg: string | null) => void;
  updateMusicSettings: (patch: Partial<VNMusicSettings>) => void;
  downloadTrackOffline: (track: TrackData, skipWifiCheck?: boolean) => Promise<boolean>;
  removeOfflineTrack: (trackId: string) => Promise<void>;
  clearAllOfflineDownloads: () => Promise<void>;
  refreshOfflineTracks: () => Promise<void>;
  findAnotherFullVersion: () => Promise<void>;
  setPlaylist: React.Dispatch<React.SetStateAction<TrackData[]>>;
  playMusic: (urlOrTrack: string | TrackData, trackDetails?: Partial<TrackData>) => void;
  pauseMusic: () => void;
  resumeMusic: () => void;
  togglePlay: () => void;
  closePlayer: () => void;
  playNext: () => void;
  playPrevious: () => void;
  seekTo: (seconds: number) => void;
  setVolume: (vol: number) => void;
  setPlaybackRate: (rate: number) => void;
  setIsLoop: (loop: boolean) => void;
  setIsShuffle: (shuffle: boolean) => void;
  setCurrentTrack: (track: TrackData | null) => void;
  setIsPlaying: (playing: boolean) => void;
  setDurationSec: (sec: number) => void;
  setCurrentTimeSec: (sec: number) => void;
  toggleLikeTrack: (track: TrackData) => void;
  isTrackLiked: (trackId?: string) => boolean;
  setIsFullPlayerOpen: (open: boolean) => void;
  setYtStatusText: (txt: string) => void;
  switchPlaybackMode: (mode: 'full' | 'youtube' | 'preview') => Promise<void>;
  preloadTracksAudio: (tracks: TrackData[]) => void;
}

const DEFAULT_PLAYLIST: TrackData[] = [];

const MusicContext = createContext<MusicContextType | null>(null);

export function extractYoutubeIdFromUrl(rawUrl?: string): string | null {
  if (!rawUrl) return null;
  const match = rawUrl.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|music\/)|youtu\.be\/)([A-Za-z0-9_-]{6,15})/i
  );
  return match ? match[1] : null;
}

export function isShortPreviewUrl(url?: string): boolean {
  if (!url) return false;
  return /mzstatic\.com|dzcdn\.net\/stream\/c-/i.test(url);
}

export function formatBytesMb(bytes: number): string {
  const mb = (Math.max(0, bytes) || 0) / (1024 * 1024);
  return `${mb.toFixed(1)} MB`;
}

export function MusicProvider({ children }: { children: React.ReactNode }) {
  const [musicSettings, setMusicSettings] = useState<VNMusicSettings>(() => loadVNMusicSettings());
  const [currentTrack, setCurrentTrack] = useState<TrackData | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playlist, setPlaylist] = useState<TrackData[]>(DEFAULT_PLAYLIST);
  const [trackIndex, setTrackIndex] = useState<number>(0);
  const [currentTimeSec, setCurrentTimeSec] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [volume, setVolumeState] = useState<number>(0.9);
  const [playbackRate, setPlaybackRateState] = useState<number>(1.0);
  const [isLoop, setIsLoopState] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = window.localStorage.getItem('ze_music_loop_v1');
        if (stored === 'true') return true;
        if (stored === 'false') return false;
      } catch {}
    }
    return loadVNMusicSettings().repeatDefault;
  });
  const [isShuffle, setIsShuffle] = useState<boolean>(() => loadVNMusicSettings().shuffleDefault);

  const setIsLoop = useCallback((loop: boolean) => {
    const next = Boolean(loop);
    setIsLoopState(next);
    isLoopRef.current = next;
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem('ze_music_loop_v1', String(next));
      } catch {}
      if (window.mainAudio) {
        window.mainAudio.loop = next;
      }
    }
    setMusicSettings((prev) => {
      const updated = { ...prev, repeatDefault: next };
      saveVNMusicSettings(updated);
      return updated;
    });
  }, []);
  const [youtubeId, setYoutubeId] = useState<string | null>(null);
  const [playNonce, setPlayNonce] = useState<number>(0);
  const [isFullPlayerOpen, setIsFullPlayerOpen] = useState<boolean>(false);
  const [ytStatusText, setYtStatusText] = useState<string>('');
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  const [offlineTracks, setOfflineTracks] = useState<OfflineTrackMeta[]>(() =>
    loadOfflineMetaIndexSync()
  );
  const [downloadProgressMap, setDownloadProgressMap] = useState<
    Record<string, DownloadProgressState>
  >({});

  const [likedTracks, setLikedTracks] = useState<TrackData[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = JSON.parse(window.localStorage.getItem('ze_liked_tracks_v1') || '[]');
      return Array.isArray(raw) ? raw : [];
    } catch {
      return [];
    }
  });

  const offlineTrackIds = React.useMemo(
    () => new Set(offlineTracks.map((t) => t.id)),
    [offlineTracks]
  );

  const refreshOfflineTracks = useCallback(async () => {
    const metas = await getAllOfflineTrackMeta();
    setOfflineTracks(metas);
  }, []);

  useEffect(() => {
    refreshOfflineTracks();
  }, [refreshOfflineTracks]);

  const updateMusicSettings = useCallback((patch: Partial<VNMusicSettings>) => {
    setMusicSettings((prev) => {
      const next = { ...prev, ...patch };
      saveVNMusicSettings(next);
      if (patch.repeatDefault !== undefined) {
        const loopNext = Boolean(patch.repeatDefault);
        setIsLoopState(loopNext);
        isLoopRef.current = loopNext;
        try {
          window.localStorage.setItem('ze_music_loop_v1', String(loopNext));
        } catch {}
        if (typeof window !== 'undefined' && window.mainAudio) {
          window.mainAudio.loop = loopNext;
        }
      }
      if (patch.shuffleDefault !== undefined) setIsShuffle(Boolean(patch.shuffleDefault));
      return next;
    });
  }, []);

  const likedTrackIds = useMemo(
    () => likedTracks.map((t) => t.id || `${t.title}__${t.artist || t.author || ''}`),
    [likedTracks]
  );

  const likedTrackIdSet = useMemo(() => new Set(likedTrackIds), [likedTrackIds]);

  const isTrackLiked = useCallback(
    (trackId?: string) => {
      if (!trackId) return false;
      return likedTrackIdSet.has(trackId);
    },
    [likedTrackIdSet]
  );

  const toggleLikeTrack = useCallback((track: TrackData) => {
    const key = track.id || `${track.title}__${track.artist || track.author || ''}`;
    if (!key) return;
    setLikedTracks((prev) => {
      const exists = prev.some(
        (item) => (item.id || `${item.title}__${item.artist || item.author || ''}`) === key
      );
      const next = exists
        ? prev.filter(
            (item) => (item.id || `${item.title}__${item.artist || item.author || ''}`) !== key
          )
        : [{ ...track, id: track.id || key }, ...prev].slice(0, 200);
      try {
        window.localStorage.setItem('ze_liked_tracks_v1', JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const ytIframeRef = useRef<HTMLIFrameElement | null>(null);
  const activeObjectUrlRef = useRef<string | null>(null);
  const offlineBlobCacheRef = useRef<
    Map<string, { url: string; durationSec: number; qualityKbps: number }>
  >(new Map());
  const preloadedAudioMapRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const playSessionRef = useRef<number>(0);
  const expectedPlayingRef = useRef<boolean>(false);
  const watchdogLastTimeRef = useRef<number>(0);
  const watchdogLastMoveTsRef = useRef<number>(0);
  const watchdogRetriedForStallRef = useRef<boolean>(false);

  const isLoopRef = useRef(isLoop);
  const isShuffleRef = useRef(isShuffle);
  const playlistRef = useRef(playlist);
  const trackIndexRef = useRef(trackIndex);
  const youtubeIdRef = useRef(youtubeId);
  const currentTrackRef = useRef(currentTrack);
  const musicSettingsRef = useRef(musicSettings);
  const volumeRef = useRef(volume);
  const playbackRateRef = useRef(playbackRate);
  const durationSecRef = useRef(durationSec);
  const lastYtInfoDeliveryTsRef = useRef<number>(0);
  const playNextRef = useRef<() => void>(() => {});

  isLoopRef.current = isLoop;
  isShuffleRef.current = isShuffle;
  playlistRef.current = playlist;
  trackIndexRef.current = trackIndex;
  youtubeIdRef.current = youtubeId;
  currentTrackRef.current = currentTrack;
  musicSettingsRef.current = musicSettings;
  volumeRef.current = volume;
  playbackRateRef.current = playbackRate;
  durationSecRef.current = durationSec;

  const stopOtherDomMedia = useCallback(() => {
    if (typeof document === 'undefined') return;
    document.querySelectorAll('video, audio').forEach((el: any) => {
      if (
        el !== window.mainAudio &&
        !el.hasAttribute('data-bg-video') &&
        el.id !== 'bg-water-video' &&
        !el.hasAttribute('data-feed-video') &&
        !el.muted
      ) {
        try {
          el.pause();
        } catch {}
      }
    });
  }, []);

  // Stop/reset global AudioPlayer cleanly WITHOUT disposing or removing src permanently
  const stopAndResetMainAudio = useCallback(() => {
    expectedPlayingRef.current = false;
    if (typeof window === 'undefined' || !window.mainAudio) return;
    const audio = window.mainAudio;
    try {
      audio.pause();
      audio.currentTime = 0;
    } catch {}
  }, []);

  const setVolume = useCallback((vol: number) => {
    const clamped = Math.max(0, Math.min(1, Number(vol) || 0));
    setVolumeState(clamped);
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.volume = clamped;
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setVolume',
            args: [Math.round(clamped * 100)],
          }),
          '*'
        );
      } catch {}
    }
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    const clamped = Math.max(0.5, Math.min(2.0, Number((Math.round(rate * 20) / 20).toFixed(2)) || 1.0));
    setPlaybackRateState(clamped);
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.playbackRate = clamped;
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({
            event: 'command',
            func: 'setPlaybackRate',
            args: [clamped],
          }),
          '*'
        );
      } catch {}
    }
  }, []);

  const mountAudioPlayback = useCallback(
    (
      audioPlayUrl: string,
      trackObj: TrackData,
      modeLabel?: {
        isPreviewFallback?: boolean;
        playbackMode?: TrackData['playbackMode'];
        statusText?: string;
      }
    ) => {
      if (typeof window === 'undefined') return;
      if (!window.mainAudio) {
        window.mainAudio = new Audio();
      }
      const audio = window.mainAudio;
      setYoutubeId(null);

      const normalizePlayableSrc = (raw: string) => {
        if (raw.startsWith('/') && isApkWebView()) {
          return `${getApiBaseUrl()}${raw}`;
        }
        return raw;
      };

      const finalAudioSrc = normalizePlayableSrc(audioPlayUrl);
      const prevBlobUrl = activeObjectUrlRef.current;

      // Global player lifecycle: stop() -> reset() -> setUrl() -> play() synchronously
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}

      audio.preload = 'auto';
      audio.volume = volumeRef.current;
      audio.playbackRate = playbackRateRef.current;
      audio.loop = isLoopRef.current;
      if (audio.src !== finalAudioSrc) {
        audio.src = finalAudioSrc;
      }

      if (prevBlobUrl && prevBlobUrl !== finalAudioSrc) {
        let isCachedOfflineUrl = false;
        offlineBlobCacheRef.current.forEach((v) => {
          if (v.url === prevBlobUrl) isCachedOfflineUrl = true;
        });
        if (!isCachedOfflineUrl) {
          try {
            URL.revokeObjectURL(prevBlobUrl);
          } catch {}
        }
        activeObjectUrlRef.current = finalAudioSrc.startsWith('blob:') ? finalAudioSrc : null;
      } else if (finalAudioSrc.startsWith('blob:')) {
        activeObjectUrlRef.current = finalAudioSrc;
      }

      expectedPlayingRef.current = true;
      watchdogLastTimeRef.current = 0;
      watchdogLastMoveTsRef.current = Date.now();
      watchdogRetriedForStallRef.current = false;

      const resolvedMode =
        modeLabel?.playbackMode ||
        (modeLabel?.isPreviewFallback || isShortPreviewUrl(audioPlayUrl) ? 'preview' : 'full');

      const nextTrackState: TrackData = {
        ...trackObj,
        playbackMode: resolvedMode,
        isPreviewFallback: Boolean(modeLabel?.isPreviewFallback ?? resolvedMode === 'preview'),
      };
      setCurrentTrack(nextTrackState);
      if (modeLabel?.statusText !== undefined) {
        setYtStatusText(modeLabel.statusText);
      }
      setIsPlaying(true);

      audio
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          if (finalAudioSrc.startsWith('http') && !finalAudioSrc.includes('/api/')) {
            const proxyEndpoint = normalizePlayableSrc(
              trackObj.source === 'tiktok'
                ? `/api/tiktok/stream?url=${encodeURIComponent(finalAudioSrc)}`
                : `/api/music/audio-stream?url=${encodeURIComponent(finalAudioSrc)}`
            );
            audio.src = proxyEndpoint;
            audio.load();
            audio
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => {
                expectedPlayingRef.current = false;
                setIsPlaying(false);
              });
          } else {
            expectedPlayingRef.current = false;
            setIsPlaying(false);
          }
        });
    },
    []
  );

  // Synchronize single global window.mainAudio element (NO auto-next on end!)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!window.mainAudio) {
      window.mainAudio = new Audio();
    }
    const audio = window.mainAudio;
    audio.preload = 'auto';
    audio.volume = volumeRef.current;
    audio.loop = isLoopRef.current;

    const handleAudioPlay = () => {
      if (!youtubeIdRef.current) {
        setIsPlaying(true);
      }
    };
    const handleAudioPause = () => {
      if (!youtubeIdRef.current && audio.src) {
        setIsPlaying(false);
      }
    };
    const handleLoadedMetadata = () => {
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDurationSec(Math.round(audio.duration));
      }
    };
    const handleTimeUpdate = () => {
      if (!youtubeIdRef.current && audio.src) {
        const cur = audio.currentTime || 0;
        if (Math.abs(cur - watchdogLastTimeRef.current) >= 0.05) {
          watchdogLastTimeRef.current = cur;
          watchdogLastMoveTsRef.current = Date.now();
          watchdogRetriedForStallRef.current = false;
        }
        setCurrentTimeSec(Math.floor(cur));
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          setDurationSec(Math.round(audio.duration));
        }
      }
      if (
        'mediaSession' in navigator &&
        typeof navigator.mediaSession.setPositionState === 'function'
      ) {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          try {
            navigator.mediaSession.setPositionState({
              duration: audio.duration,
              playbackRate: audio.playbackRate || 1,
              position: Math.min(audio.currentTime || 0, audio.duration),
            });
          } catch {}
        }
      }
    };

    const handleAudioEnded = () => {
      if (isLoopRef.current && audio.src) {
        try {
          audio.loop = true;
          audio.currentTime = 0;
          expectedPlayingRef.current = true;
          setCurrentTimeSec(0);
          setIsPlaying(true);
          audio.play().catch(() => {});
        } catch {}
        return;
      }

      // STRICT NO-AUTOPLAY RULE: Stop silently at track end (never advance queue or TikTok->list)
      expectedPlayingRef.current = false;
      try {
        audio.pause();
        audio.currentTime = 0;
      } catch {}
      setCurrentTimeSec(0);
      setIsPlaying(false);
    };

    const handleAudioError = () => {
      const tr = currentTrackRef.current;
      const src = audio.src || '';
      if (!tr || !src) return;

      // Never hijack offline object URLs
      if (src.startsWith('blob:')) {
        setIsPlaying(false);
        return;
      }

      // If TikTok or external audio URL failed directly, try backend stream proxy once
      if (src.startsWith('http') && !src.includes('/api/')) {
        const proxyUrl =
          tr.source === 'tiktok'
            ? `/api/tiktok/stream?url=${encodeURIComponent(src)}`
            : `/api/music/audio-stream?url=${encodeURIComponent(src)}`;
        audio.src = proxyUrl;
        audio.load();
        audio.play().catch(() => setIsPlaying(false));
        return;
      }

      // NEVER silently downgrade to 30s preview without telling the user!
      setIsPlaying(false);
      if (tr.previewUrl && !src.includes(tr.previewUrl) && isShortPreviewUrl(tr.previewUrl)) {
        setCurrentTrack((prev) =>
          prev ? { ...prev, isPreviewFallback: true, playbackMode: 'preview' } : prev
        );
        setYtStatusText('⚠️ Full stream gagal dimuat — klik Cari Full Lain');
      }
    };

    audio.addEventListener('play', handleAudioPlay);
    audio.addEventListener('pause', handleAudioPause);
    audio.addEventListener('loadedmetadata', handleLoadedMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('ended', handleAudioEnded);
    audio.addEventListener('error', handleAudioError);

    const handleVideoPlay = (e: Event) => {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'VIDEO') {
        const videoEl = target as HTMLVideoElement;
        if (
          videoEl.muted ||
          videoEl.hasAttribute('data-bg-video') ||
          videoEl.id === 'bg-water-video' ||
          videoEl.hasAttribute('data-feed-video')
        ) {
          return;
        }
        if (window.mainAudio && !window.mainAudio.paused) {
          window.mainAudio.pause();
          setIsPlaying(false);
        }
      }
    };

    document.addEventListener('play', handleVideoPlay, true);

    // 3-second stuck watchdog: ONLY triggers when user already pressed Play (expectedPlayingRef === true)
    const watchdogTimer = window.setInterval(() => {
      if (youtubeIdRef.current || !expectedPlayingRef.current) return;
      const a = window.mainAudio;
      if (!a || !a.src || a.paused || a.ended) return;
      const cur = a.currentTime || 0;
      if (Math.abs(cur - watchdogLastTimeRef.current) >= 0.05) {
        watchdogLastTimeRef.current = cur;
        watchdogLastMoveTsRef.current = Date.now();
        watchdogRetriedForStallRef.current = false;
        return;
      }
      if (
        !watchdogRetriedForStallRef.current &&
        Date.now() - watchdogLastMoveTsRef.current > 3000
      ) {
        watchdogRetriedForStallRef.current = true;
        watchdogLastMoveTsRef.current = Date.now();
        try {
          const resumeAt = watchdogLastTimeRef.current || 0;
          a.pause();
          a.load();
          if (resumeAt > 0) {
            try {
              a.currentTime = resumeAt;
            } catch {}
          }
          a.play().catch(() => {});
        } catch {}
      }
    }, 1000);

    return () => {
      window.clearInterval(watchdogTimer);
      audio.removeEventListener('play', handleAudioPlay);
      audio.removeEventListener('pause', handleAudioPause);
      audio.removeEventListener('loadedmetadata', handleLoadedMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('ended', handleAudioEnded);
      audio.removeEventListener('error', handleAudioError);
      document.removeEventListener('play', handleVideoPlay, true);
    };
  }, []);

  useEffect(() => {
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.loop = isLoop;
    }
  }, [isLoop]);

  // Monitor YouTube Full Player events cleanly (including duration, seeking & playlist auto-next)
  useEffect(() => {
    if (!youtubeId) return;

    const handleYtMessage = (event: MessageEvent) => {
      if (typeof event.origin === 'string' && !event.origin.includes('youtube.com')) return;
      try {
        const parsed = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (!parsed || typeof parsed !== 'object') return;
        const playerState =
          parsed.event === 'onStateChange'
            ? parsed.info
            : parsed.event === 'infoDelivery' &&
              parsed.info &&
              typeof parsed.info.playerState === 'number'
            ? parsed.info.playerState
            : null;

        if (playerState === 0) {
          if (isLoopRef.current) {
            ytIframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'seekTo', args: [0, true] }),
              '*'
            );
            ytIframeRef.current?.contentWindow?.postMessage(
              JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
              '*'
            );
            setCurrentTimeSec(0);
            setIsPlaying(true);
          } else if (playlistRef.current.length > 1) {
            playNextRef.current();
          } else {
            expectedPlayingRef.current = false;
            setIsPlaying(false);
            setCurrentTimeSec(0);
          }
          return;
        }

        if (playerState === 1) {
          setIsPlaying(true);
        } else if (playerState === 2) {
          setIsPlaying(false);
        }

        if (
          parsed.event === 'infoDelivery' &&
          parsed.info &&
          typeof parsed.info.currentTime === 'number'
        ) {
          lastYtInfoDeliveryTsRef.current = Date.now();
          setCurrentTimeSec(Math.floor(parsed.info.currentTime));
        }
        if (
          parsed.event === 'infoDelivery' &&
          parsed.info &&
          typeof parsed.info.duration === 'number' &&
          parsed.info.duration > 0
        ) {
          setDurationSec(Math.round(parsed.info.duration));
        }
      } catch {}
    };

    window.addEventListener('message', handleYtMessage);
    return () => {
      window.removeEventListener('message', handleYtMessage);
    };
  }, [youtubeId]);

  useEffect(() => {
    if (!youtubeId || !isPlaying) return;
    const timer = window.setInterval(() => {
      if (Date.now() - lastYtInfoDeliveryTsRef.current < 1200) return;
      const maxDur = durationSecRef.current;
      setCurrentTimeSec((prev) => {
        if (maxDur > 0 && prev + 1 >= maxDur) {
          if (isLoopRef.current) return 0;
          return maxDur;
        }
        return prev + 1;
      });
    }, 1000);
    return () => {
      window.clearInterval(timer);
    };
  }, [youtubeId, isPlaying]);

  const playMusic = useCallback(
    (urlOrTrack: string | TrackData, trackDetails?: Partial<TrackData>) => {
      if (typeof window === 'undefined') return;
      if (!window.mainAudio) {
        window.mainAudio = new Audio();
      }

      const sessionToken = ++playSessionRef.current;
      stopOtherDomMedia();

      let trackObj: TrackData;
      if (typeof urlOrTrack === 'string') {
        trackObj = {
          title: trackDetails?.title || 'Musik Audio',
          author: trackDetails?.author || 'VNJAVA Music',
          artist: trackDetails?.artist || trackDetails?.author || 'VNJAVA Official',
          thumbnail: trackDetails?.thumbnail || '',
          url: urlOrTrack,
          videoUrl: trackDetails?.videoUrl,
          audioUrl: urlOrTrack,
          source: trackDetails?.source || 'web',
          sourceType: trackDetails?.sourceType || trackDetails?.source || 'web',
          ...trackDetails,
        };
      } else {
        trackObj = {
          ...urlOrTrack,
          ...trackDetails,
          source: (trackDetails?.source || urlOrTrack.source || 'web') as TrackSourceType,
        };
      }

      // 1. Pause & reset current position cleanly (keep single global window.mainAudio alive!)
      stopAndResetMainAudio();
      setYoutubeId(null);
      setCurrentTimeSec(0);

      const estDuration =
        trackObj.durationMs && trackObj.durationMs > 0
          ? Math.max(5, Math.round(trackObj.durationMs / 1000))
          : trackObj.youtubeDurationSec && trackObj.youtubeDurationSec > 0
          ? trackObj.youtubeDurationSec
          : 0;
      setDurationSec(estDuration);

      // Keep playlist queue synced immediately
      setPlaylist((prev) => {
        const idx = prev.findIndex(
          (p) =>
            (p.id && trackObj.id && p.id === trackObj.id) ||
            (p.title === trackObj.title &&
              (p.artist || p.author) === (trackObj.artist || trackObj.author))
        );
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = trackObj;
          setTrackIndex(idx);
          return updated;
        }
        setTrackIndex(0);
        return [trackObj, ...prev].slice(0, 80);
      });

      // Helper to execute online playback after checking offline cache (Full YouTube / Full Audio, NEVER 30s previews)
      const runOnlinePlayback = () => {
        if (playSessionRef.current !== sessionToken) return;

        const directYoutubeId =
          trackObj.youtubeId ||
          extractYoutubeIdFromUrl(trackObj.videoUrl || trackObj.url || trackObj.sourceUrl);

        const preferredFullAudio =
          trackObj.fullAudioUrl ||
          (trackObj.audioUrl && !isShortPreviewUrl(trackObj.audioUrl) ? trackObj.audioUrl : '');

        if (
          directYoutubeId &&
          (trackObj.playbackMode === 'youtube' ||
            trackObj.source === 'youtube' ||
            !preferredFullAudio)
        ) {
          lastYtInfoDeliveryTsRef.current = Date.now();
          setPlayNonce((n) => n + 1);
          setCurrentTrack({
            ...trackObj,
            youtubeId: directYoutubeId,
            playbackMode: 'youtube',
            isPreviewFallback: false,
          });
          setYoutubeId(directYoutubeId);
          setYtStatusText('YouTube Full Audio');
          setIsPlaying(true);
          return;
        }

        const audioPlayUrl =
          preferredFullAudio ||
          (trackObj.audioUrl && !isShortPreviewUrl(trackObj.audioUrl) ? trackObj.audioUrl : '') ||
          (trackObj.videoUrl && !isShortPreviewUrl(trackObj.videoUrl) ? trackObj.videoUrl : '') ||
          (trackObj.url && !isShortPreviewUrl(trackObj.url) ? trackObj.url : '') ||
          '';

        if (!audioPlayUrl) {
          // Resolve YouTube full song on the fly when track lacks youtubeId/full stream
          setCurrentTrack({
            ...trackObj,
            playbackMode: 'youtube',
            isPreviewFallback: false,
          });
          setYtStatusText('Memuat YouTube Full...');
          setIsPlaying(true);
          const durTarget = trackObj.durationMs ? Math.round(trackObj.durationMs / 1000) : 0;
          safeApiFetch<{
            success?: boolean;
            top?: { videoId: string; durationSec?: number; thumbnail?: string };
          }>(
            `/api/music/youtube-search?title=${encodeURIComponent(trackObj.title)}&artist=${encodeURIComponent(trackObj.artist || trackObj.author || '')}&targetDurationSec=${durTarget}`,
            { timeoutMs: 10000 }
          )
            .then((ytRes) => {
              if (playSessionRef.current !== sessionToken) return;
              const vid = ytRes.data?.top?.videoId;
              if (vid) {
                const durSec = ytRes.data?.top?.durationSec || 0;
                if (durSec > 0) setDurationSec(durSec);
                lastYtInfoDeliveryTsRef.current = Date.now();
                setPlayNonce((n) => n + 1);
                setCurrentTrack((prev) =>
                  prev
                    ? {
                        ...prev,
                        youtubeId: vid,
                        playbackMode: 'youtube',
                        isPreviewFallback: false,
                        ...(durSec > 0 ? { durationMs: durSec * 1000 } : {}),
                        ...(!prev.thumbnail && ytRes.data?.top?.thumbnail
                          ? { thumbnail: ytRes.data.top.thumbnail, cover: ytRes.data.top.thumbnail }
                          : {}),
                      }
                    : prev
                );
                setYoutubeId(vid);
                setYtStatusText('YouTube Full Audio');
                setIsPlaying(true);
              } else {
                setYtStatusText('Lagu YouTube tidak ditemukan');
                setIsPlaying(false);
              }
            })
            .catch(() => {
              if (playSessionRef.current === sessionToken) {
                setYtStatusText('Gagal memuat YouTube');
                setIsPlaying(false);
              }
            });
          return;
        }

        mountAudioPlayback(audioPlayUrl, trackObj, {
          playbackMode: 'full',
          isPreviewFallback: false,
          statusText:
            trackObj.resolvedSourceLabel ||
            (trackObj.source === 'tiktok' ? 'TikTok Full Audio' : 'Full Audio Aktif'),
        });
      };

      // Step 0: Synchronous fast-path for cached offline blobs & online audio (0ms inside user tap gesture!)
      if (trackObj.id) {
        const cachedOffline = offlineBlobCacheRef.current.get(trackObj.id);
        if (cachedOffline) {
          const offlineDur = cachedOffline.durationSec || estDuration;
          if (offlineDur > 0) setDurationSec(offlineDur);
          mountAudioPlayback(
            cachedOffline.url,
            {
              ...trackObj,
              durationMs: offlineDur * 1000,
              fullAudioUrl: cachedOffline.url,
              audioUrl: cachedOffline.url,
              resolvedSourceLabel: `Offline (${cachedOffline.qualityKbps}kbps)`,
            },
            {
              playbackMode: 'offline',
              isPreviewFallback: false,
              statusText: `⬇️ Memutar Offline (${cachedOffline.qualityKbps}kbps)`,
            }
          );
          return;
        }

        if (offlineTrackIds.has(trackObj.id)) {
          getOfflineTrackRecord(trackObj.id)
            .then((offlineRec) => {
              if (playSessionRef.current !== sessionToken) return;
              if (offlineRec && offlineRec.blob) {
                const objUrl = URL.createObjectURL(offlineRec.blob);
                const offlineDur = offlineRec.durationSec || estDuration;
                offlineBlobCacheRef.current.set(trackObj.id!, {
                  url: objUrl,
                  durationSec: offlineDur,
                  qualityKbps: offlineRec.qualityKbps,
                });
                activeObjectUrlRef.current = objUrl;
                if (offlineDur > 0) setDurationSec(offlineDur);
                mountAudioPlayback(
                  objUrl,
                  {
                    ...trackObj,
                    durationMs: offlineDur * 1000,
                    fullAudioUrl: objUrl,
                    audioUrl: objUrl,
                    resolvedSourceLabel: `Offline (${offlineRec.qualityKbps}kbps)`,
                  },
                  {
                    playbackMode: 'offline',
                    isPreviewFallback: false,
                    statusText: `⬇️ Memutar Offline (${offlineRec.qualityKbps}kbps)`,
                  }
                );
                return;
              }
              runOnlinePlayback();
            })
            .catch(() => {
              runOnlinePlayback();
            });
          return;
        }
      }

      runOnlinePlayback();
    },
    [stopAndResetMainAudio, mountAudioPlayback, stopOtherDomMedia, offlineTrackIds]
  );

  // Preload up to 16 track audio streams in memory/browser cache for 0ms tap playback
  const preloadTracksAudio = useCallback((tracks: TrackData[]) => {
    if (typeof window === 'undefined' || !Array.isArray(tracks) || tracks.length === 0) return;

    const toNormUrl = (raw?: string) => {
      if (!raw) return '';
      if (raw.startsWith('blob:') || raw.startsWith('data:')) return '';
      if (raw.startsWith('/') && isApkWebView()) return `${getApiBaseUrl()}${raw}`;
      return raw;
    };

    const pool = tracks.slice(0, 16);
    let coverCount = 0;
    for (const tr of pool) {
      if (!tr) continue;

      if (coverCount < 12) {
        const rawCover = tr.thumbnail || tr.cover;
        const thumbCover = rawCover ? toMusicThumbUrl(rawCover) : '';
        if (thumbCover && !PRELOADED_COVER_SET.has(thumbCover) && !thumbCover.startsWith('data:')) {
          PRELOADED_COVER_SET.add(thumbCover);
          coverCount += 1;
          try {
            const img = new Image();
            img.referrerPolicy = 'no-referrer';
            img.decoding = 'async';
            img.src = thumbCover;
          } catch {}
        }
      }

      // Warm offline blob synchronously in RAM if downloaded
      if (tr.id && offlineTrackIds.has(tr.id) && !offlineBlobCacheRef.current.has(tr.id)) {
        getOfflineTrackRecord(tr.id)
          .then((rec) => {
            if (rec?.blob && tr.id && !offlineBlobCacheRef.current.has(tr.id)) {
              offlineBlobCacheRef.current.set(tr.id, {
                url: URL.createObjectURL(rec.blob),
                durationSec: rec.durationSec || 0,
                qualityKbps: rec.qualityKbps,
              });
            }
          })
          .catch(() => {});
        continue;
      }

      const rawUrl =
        tr.fullAudioUrl ||
        (tr.audioUrl && !isShortPreviewUrl(tr.audioUrl) ? tr.audioUrl : '') ||
        tr.previewUrl ||
        tr.url ||
        '';
      const finalUrl = toNormUrl(rawUrl);
      if (!finalUrl || preloadedAudioMapRef.current.has(finalUrl)) continue;

      if (preloadedAudioMapRef.current.size >= 20) {
        const firstKey = preloadedAudioMapRef.current.keys().next().value;
        if (firstKey) {
          const oldEl = preloadedAudioMapRef.current.get(firstKey);
          try {
            if (oldEl) {
              oldEl.src = '';
              oldEl.remove();
            }
          } catch {}
          preloadedAudioMapRef.current.delete(firstKey);
        }
      }

      try {
        const preAudio = new Audio();
        preAudio.preload = 'auto';
        preAudio.src = finalUrl;
        preAudio.load();
        preloadedAudioMapRef.current.set(finalUrl, preAudio);
      } catch {}
    }
  }, [offlineTrackIds]);

  // Pre-warm offline blobs & preload likedTracks from the start!
  useEffect(() => {
    if (likedTracks.length > 0) {
      preloadTracksAudio(likedTracks);
    }
    if (offlineTracks.length > 0) {
      offlineTracks.slice(0, 16).forEach((meta) => {
        if (!offlineBlobCacheRef.current.has(meta.id)) {
          getOfflineTrackRecord(meta.id)
            .then((rec) => {
              if (rec?.blob && !offlineBlobCacheRef.current.has(meta.id)) {
                offlineBlobCacheRef.current.set(meta.id, {
                  url: URL.createObjectURL(rec.blob),
                  durationSec: rec.durationSec || meta.durationSec || 0,
                  qualityKbps: rec.qualityKbps,
                });
              }
            })
            .catch(() => {});
        }
      });
    }
  }, [likedTracks, offlineTracks, preloadTracksAudio]);

  const pauseMusic = useCallback(() => {
    expectedPlayingRef.current = false;
    setIsPlaying(false);
    if (typeof window !== 'undefined' && window.mainAudio) {
      window.mainAudio.pause();
    }
    if (ytIframeRef.current?.contentWindow) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
          '*'
        );
      } catch {}
    }
  }, []);

  const resumeMusic = useCallback(() => {
    if (typeof window === 'undefined') return;
    stopOtherDomMedia();
    if (youtubeIdRef.current) {
      expectedPlayingRef.current = true;
      setIsPlaying(true);
      if (ytIframeRef.current?.contentWindow) {
        try {
          ytIframeRef.current.contentWindow.postMessage(
            JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
            '*'
          );
        } catch {}
      } else {
        setPlayNonce((n) => n + 1);
      }
      return;
    }
    if (window.mainAudio && window.mainAudio.src) {
      expectedPlayingRef.current = true;
      setIsPlaying(true);
      watchdogLastMoveTsRef.current = Date.now();
      watchdogRetriedForStallRef.current = false;
      window.mainAudio.play().catch(() => {
        expectedPlayingRef.current = false;
        setIsPlaying(false);
      });
    } else if (currentTrackRef.current) {
      playMusic(currentTrackRef.current);
    }
  }, [playMusic, stopOtherDomMedia]);

  const togglePlay = useCallback(() => {
    if (isPlaying) {
      pauseMusic();
    } else {
      if (!currentTrackRef.current) {
        if (playlistRef.current[0]) {
          playMusic(playlistRef.current[0]);
        }
        return;
      }
      resumeMusic();
    }
  }, [isPlaying, pauseMusic, playMusic, resumeMusic]);

  const findCurrentQueueIndex = (list: TrackData[]) => {
    const cur = currentTrackRef.current;
    if (!cur) return trackIndexRef.current;
    const found = list.findIndex(
      (p) =>
        (p.id && cur.id && p.id === cur.id) ||
        (p.youtubeId && cur.youtubeId && p.youtubeId === cur.youtubeId) ||
        (p.title === cur.title &&
          (p.artist || p.author || '') === (cur.artist || cur.author || ''))
    );
    return found !== -1 ? found : Math.max(0, Math.min(list.length - 1, trackIndexRef.current));
  };

  const playNext = useCallback(() => {
    const list = playlistRef.current;
    if (list.length === 0) return;
    const curIdx = findCurrentQueueIndex(list);
    let nextIdx = (curIdx + 1) % list.length;
    if (isShuffleRef.current && list.length > 1) {
      let randIdx = Math.floor(Math.random() * list.length);
      if (randIdx === curIdx) randIdx = (curIdx + 1) % list.length;
      nextIdx = randIdx;
    }
    setTrackIndex(nextIdx);
    playMusic(list[nextIdx]);
  }, [playMusic]);

  playNextRef.current = playNext;

  const playPrevious = useCallback(() => {
    const list = playlistRef.current;
    if (list.length === 0) return;
    const curIdx = findCurrentQueueIndex(list);
    const prevIdx = (curIdx - 1 + list.length) % list.length;
    setTrackIndex(prevIdx);
    playMusic(list[prevIdx]);
  }, [playMusic]);

  const seekTo = useCallback((seconds: number) => {
    const clamped = Math.max(0, Math.floor(seconds));
    setCurrentTimeSec(clamped);
    if (typeof window !== 'undefined' && window.mainAudio && window.mainAudio.src) {
      try {
        window.mainAudio.currentTime = clamped;
      } catch {}
    }
    if (ytIframeRef.current?.contentWindow && youtubeIdRef.current) {
      try {
        ytIframeRef.current.contentWindow.postMessage(
          JSON.stringify({ event: 'command', func: 'seekTo', args: [clamped, true] }),
          '*'
        );
      } catch {}
    }
  }, []);

  const closePlayer = useCallback(() => {
    ++playSessionRef.current;
    stopAndResetMainAudio();
    setYoutubeId(null);
    setCurrentTrack(null);
    setIsPlaying(false);
    setIsFullPlayerOpen(false);
    setCurrentTimeSec(0);
    setDurationSec(0);
    if (typeof window !== 'undefined') {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
        try {
          navigator.mediaSession.setActionHandler('play', null);
          navigator.mediaSession.setActionHandler('pause', null);
          navigator.mediaSession.setActionHandler('nexttrack', null);
          navigator.mediaSession.setActionHandler('previoustrack', null);
          navigator.mediaSession.setActionHandler('stop', null);
        } catch {}
      }
      window.ZeNative?.stopMusicNotification?.();
      if ('serviceWorker' in navigator) {
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'DISMISS_MUSIC_NOTIFICATION' });
        } else {
          navigator.serviceWorker.ready
            .then((reg) => reg.active?.postMessage({ type: 'DISMISS_MUSIC_NOTIFICATION' }))
            .catch(() => {});
        }
      }
    }
  }, [stopAndResetMainAudio]);

  const switchPlaybackMode = useCallback(
    async (mode: 'full' | 'youtube' | 'preview') => {
      const tr = currentTrackRef.current;
      if (!tr) return;

      if (mode === 'preview') {
        mode = 'youtube';
      }

      if (mode === 'full') {
        setYtStatusText('Mencari Full Audio...');
        const durTarget = tr.durationMs ? Math.round(tr.durationMs / 1000) : 0;
        const quality =
          musicSettingsRef.current.streamingQuality === 'low'
            ? '128'
            : musicSettingsRef.current.streamingQuality === 'high'
            ? '320'
            : '256';
        const res = await safeApiFetch<any>(
          `/api/music/resolve-full?title=${encodeURIComponent(tr.title)}&artist=${encodeURIComponent(tr.artist || tr.author || '')}&durationSec=${durTarget}&quality=${quality}`,
          { timeoutMs: 20000 }
        );
        if (res.ok && res.data?.fullAudioUrl && !res.data.isPreviewOnly) {
          playMusic({
            ...tr,
            fullAudioUrl: res.data.fullAudioUrl,
            audioUrl: res.data.fullAudioUrl,
            youtubeId: res.data.youtubeId || tr.youtubeId,
            durationMs:
              res.data.resolvedDurationSec >= 60
                ? res.data.resolvedDurationSec * 1000
                : tr.durationMs,
            playbackMode: 'full',
            isPreviewFallback: false,
            resolvedSourceLabel: `Full Audio (${res.data.sourceUsed})`,
          });
          return;
        }
        if (res.ok && res.data?.youtubeId) {
          playMusic({
            ...tr,
            youtubeId: res.data.youtubeId,
            playbackMode: 'youtube',
            isPreviewFallback: false,
            durationMs:
              res.data.youtubeDurationSec >= 60
                ? res.data.youtubeDurationSec * 1000
                : tr.durationMs,
          });
          return;
        }
        setYtStatusText('Memutar via YouTube Full');
        return;
      }

      if (tr.youtubeId) {
        setYtStatusText('YouTube Full Audio Aktif');
        playMusic({
          ...tr,
          youtubeId: tr.youtubeId,
          playbackMode: 'youtube',
          isPreviewFallback: false,
        });
        return;
      }

      setYtStatusText('Mencari Full Audio di YouTube...');
      try {
        const durTarget = tr.durationMs ? Math.round(tr.durationMs / 1000) : 0;
        const ytRes = await safeApiFetch<{
          success?: boolean;
          top?: { videoId: string; durationSec?: number };
        }>(
          `/api/music/youtube-search?title=${encodeURIComponent(tr.title)}&artist=${encodeURIComponent(tr.artist || tr.author || '')}&targetDurationSec=${durTarget}`,
          { timeoutMs: 10000 }
        );
        if (ytRes.ok && ytRes.data?.top?.videoId) {
          const vid = ytRes.data.top.videoId;
          setYtStatusText('YouTube Full Audio Aktif');
          playMusic({
            ...tr,
            youtubeId: vid,
            playbackMode: 'youtube',
            isPreviewFallback: false,
            durationMs:
              ytRes.data.top.durationSec && ytRes.data.top.durationSec >= 60
                ? ytRes.data.top.durationSec * 1000
                : tr.durationMs,
          });
        } else {
          setYtStatusText('Lagu YouTube tidak ditemukan');
        }
      } catch {
        setYtStatusText('Gagal mencari lagu YouTube');
      }
    },
    [playMusic]
  );

  const findAnotherFullVersion = useCallback(async () => {
    await switchPlaybackMode('full');
  }, [switchPlaybackMode]);

  const downloadTrackOffline = useCallback(
    async (track: TrackData, skipWifiCheck = false): Promise<boolean> => {
      const id = track.id || `${track.title}__${track.artist || track.author || 'vn'}`;
      if (!id) return false;

      if (!skipWifiCheck && musicSettingsRef.current.wifiOnlyDownload) {
        const { isWifi, connectionType } = isWifiConnection();
        if (!isWifi) {
          setDownloadNotice(
            `Download diblokir (${connectionType}). Nonaktifkan "Download Hanya Pakai WiFi" di Pengaturan.`
          );
          return false;
        }
      }

      try {
        setDownloadNotice(null);
        await downloadFullSongToOffline(
          {
            id,
            title: track.title,
            artist: track.artist || track.author || 'Artis',
            album: track.album,
            thumbnail: track.thumbnail || track.cover,
            durationSec: track.durationMs ? Math.round(track.durationMs / 1000) : 0,
            fullAudioUrl:
              track.fullAudioUrl ||
              (track.audioUrl && !isShortPreviewUrl(track.audioUrl) ? track.audioUrl : undefined),
            source: track.source,
            youtubeId: track.youtubeId,
          },
          musicSettingsRef.current.downloadQuality,
          (prog) => {
            setDownloadProgressMap((prev) => ({ ...prev, [id]: prog }));
          }
        );
        await refreshOfflineTracks();
        setDownloadProgressMap((prev) => {
          const copy = { ...prev };
          delete copy[id];
          return copy;
        });
        return true;
      } catch (err: any) {
        setDownloadProgressMap((prev) => ({
          ...prev,
          [id]: {
            percent: 0,
            loadedBytes: 0,
            totalBytes: 0,
            status: 'error',
            errorMsg: err?.message || 'Gagal download offline',
          },
        }));
        setDownloadNotice(err?.message || 'Gagal download lagu offline');
        return false;
      }
    },
    [refreshOfflineTracks]
  );

  const removeOfflineTrack = useCallback(
    async (trackId: string) => {
      const cached = offlineBlobCacheRef.current.get(trackId);
      if (cached) {
        if (activeObjectUrlRef.current !== cached.url) {
          try {
            URL.revokeObjectURL(cached.url);
          } catch {}
        }
        offlineBlobCacheRef.current.delete(trackId);
      }
      await deleteOfflineTrackRecord(trackId);
      await refreshOfflineTracks();
    },
    [refreshOfflineTracks]
  );

  const clearAllOfflineDownloads = useCallback(async () => {
    offlineBlobCacheRef.current.forEach((v) => {
      if (activeObjectUrlRef.current !== v.url) {
        try {
          URL.revokeObjectURL(v.url);
        } catch {}
      }
    });
    offlineBlobCacheRef.current.clear();
    await clearAllOfflineTracks();
    setOfflineTracks([]);
  }, []);

  const musicHandlersRef = useRef({
    playMusic,
    pauseMusic,
    resumeMusic,
    togglePlay,
    playNext,
    playPrevious,
    closePlayer,
  });
  musicHandlersRef.current = {
    playMusic,
    pauseMusic,
    resumeMusic,
    togglePlay,
    playNext,
    playPrevious,
    closePlayer,
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    window.__zeMusicControl = (action) => {
      const h = musicHandlersRef.current;
      if (action === 'play') h.resumeMusic();
      else if (action === 'pause') h.pauseMusic();
      else if (action === 'toggle') h.togglePlay();
      else if (action === 'next') h.playNext();
      else if (action === 'prev') h.playPrevious();
      else if (action === 'stop') h.closePlayer();
    };

    const handleSwMessage = (event: MessageEvent) => {
      const data = event.data;
      if (data && data.type === 'NATIVE_MUSIC_CONTROL' && data.action) {
        window.__zeMusicControl?.(data.action);
      }
    };

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.addEventListener('message', handleSwMessage);
    }

    return () => {
      delete window.__zeMusicControl;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.removeEventListener('message', handleSwMessage);
      }
    };
  }, []);

  // ANDROID NATIVE MEDIASESSION + FOREGROUND SERVICE NOTIFICATION
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const toAbsoluteUrl = (rawUrl?: string) => {
      if (!rawUrl) return '';
      if (
        rawUrl.startsWith('http://') ||
        rawUrl.startsWith('https://') ||
        rawUrl.startsWith('data:') ||
        rawUrl.startsWith('blob:')
      ) {
        return rawUrl;
      }
      return `${window.location.origin}${rawUrl.startsWith('/') ? '' : '/'}${rawUrl}`;
    };

    if (currentTrack) {
      const trackTitle = currentTrack.title || 'VN MUSIC';
      const trackArtist = currentTrack.artist || currentTrack.author || 'VN MUSIC';
      const coverUrl = toAbsoluteUrl(
        currentTrack.thumbnail || currentTrack.cover || '/assets/vnjava_logo.jpg'
      );
      const audioUrl = toAbsoluteUrl(
        currentTrack.fullAudioUrl ||
          currentTrack.audioUrl ||
          currentTrack.previewUrl ||
          currentTrack.videoUrl ||
          currentTrack.url ||
          ''
      );

      if (!youtubeId) {
        window.ZeNative?.updateMusicNotification?.(
          trackTitle,
          trackArtist,
          coverUrl,
          audioUrl,
          isPlaying
        );
      }

      if ('mediaSession' in navigator) {
        const artwork = [
          { src: '/assets/vnjava_logo.jpg', sizes: '192x192', type: 'image/jpeg' },
          { src: '/assets/vnjava_logo.jpg', sizes: '512x512', type: 'image/jpeg' },
        ];
        if (currentTrack.thumbnail || currentTrack.cover) {
          artwork.unshift({
            src: currentTrack.thumbnail || currentTrack.cover || '',
            sizes: '512x512',
            type: 'image/jpeg',
          });
        }

        navigator.mediaSession.metadata = new MediaMetadata({
          title: trackTitle,
          artist: trackArtist,
          album: currentTrack.album || 'VN MUSIC',
          artwork,
        });

        navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';

        try {
          navigator.mediaSession.setActionHandler('play', () =>
            musicHandlersRef.current.resumeMusic()
          );
          navigator.mediaSession.setActionHandler('pause', () =>
            musicHandlersRef.current.pauseMusic()
          );
          navigator.mediaSession.setActionHandler('previoustrack', () =>
            musicHandlersRef.current.playPrevious()
          );
          navigator.mediaSession.setActionHandler('nexttrack', () =>
            musicHandlersRef.current.playNext()
          );
          navigator.mediaSession.setActionHandler('seekto', (details) => {
            if (details.seekTime !== undefined) seekTo(details.seekTime);
          });
          navigator.mediaSession.setActionHandler('stop', () =>
            musicHandlersRef.current.closePlayer()
          );
        } catch {}
      }

      if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
        const msgPayload = {
          type: 'SHOW_MUSIC_NOTIFICATION',
          title: trackTitle,
          artist: trackArtist,
          cover: currentTrack.thumbnail || currentTrack.cover || '/assets/vnjava_logo.jpg',
          isPlaying,
        };
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage(msgPayload);
        } else {
          navigator.serviceWorker.ready
            .then((reg) => {
              reg.active?.postMessage(msgPayload);
            })
            .catch(() => {});
        }
      }
    } else {
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null;
        navigator.mediaSession.playbackState = 'none';
      }
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'DISMISS_MUSIC_NOTIFICATION' });
      }
    }
  }, [currentTrack, isPlaying, youtubeId, seekTo]);

  const musicProgressValue = useMemo(
    () => ({ currentTimeSec, durationSec }),
    [currentTimeSec, durationSec]
  );

  const musicContextValue = useMemo<MusicContextType>(
    () => ({
      currentTrack,
      isPlaying,
      playlist,
      volume,
      playbackRate,
      isLoop,
      isShuffle,
      youtubeId,
      playNonce,
      likedTrackIds,
      likedTracks,
      isFullPlayerOpen,
      ytStatusText,
      musicSettings,
      offlineTracks,
      offlineTrackIds,
      downloadProgressMap,
      downloadNotice,
      setDownloadNotice,
      updateMusicSettings,
      downloadTrackOffline,
      removeOfflineTrack,
      clearAllOfflineDownloads,
      refreshOfflineTracks,
      findAnotherFullVersion,
      setPlaylist,
      playMusic,
      pauseMusic,
      resumeMusic,
      togglePlay,
      closePlayer,
      playNext,
      playPrevious,
      seekTo,
      setVolume,
      setPlaybackRate,
      setIsLoop,
      setIsShuffle,
      setCurrentTrack,
      setIsPlaying,
      setDurationSec,
      setCurrentTimeSec,
      toggleLikeTrack,
      isTrackLiked,
      setIsFullPlayerOpen,
      setYtStatusText,
      switchPlaybackMode,
      preloadTracksAudio,
    }),
    [
      currentTrack,
      isPlaying,
      playlist,
      volume,
      playbackRate,
      isLoop,
      isShuffle,
      youtubeId,
      playNonce,
      likedTrackIds,
      likedTracks,
      isFullPlayerOpen,
      ytStatusText,
      musicSettings,
      offlineTracks,
      offlineTrackIds,
      downloadProgressMap,
      downloadNotice,
      updateMusicSettings,
      downloadTrackOffline,
      removeOfflineTrack,
      clearAllOfflineDownloads,
      refreshOfflineTracks,
      findAnotherFullVersion,
      playMusic,
      pauseMusic,
      resumeMusic,
      togglePlay,
      closePlayer,
      playNext,
      playPrevious,
      seekTo,
      setVolume,
      setPlaybackRate,
      setIsLoop,
      toggleLikeTrack,
      isTrackLiked,
      switchPlaybackMode,
      preloadTracksAudio,
    ]
  );

  return (
    <MusicContext.Provider value={musicContextValue}>
      <MusicProgressContext.Provider value={musicProgressValue}>
        {youtubeId && (
          <div
            aria-hidden="true"
            className="fixed bottom-0 right-0 w-px h-px opacity-[0.01] pointer-events-none overflow-hidden z-[-1]"
          >
            <iframe
              ref={ytIframeRef}
              key={`${youtubeId}_${playNonce}`}
              src={`https://www.youtube.com/embed/${youtubeId}?autoplay=1&enablejsapi=1&playsinline=1&rel=0&widgetid=1${typeof window !== 'undefined' ? `&origin=${encodeURIComponent(window.location.origin)}` : ''}`}
              title="VN Music YouTube Player"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              onLoad={() => {
                const sendCmd = () => {
                  try {
                    const cw = ytIframeRef.current?.contentWindow;
                    if (!cw) return;
                    cw.postMessage(
                      JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }),
                      '*'
                    );
                    cw.postMessage(
                      JSON.stringify({
                        event: 'command',
                        func: 'setVolume',
                        args: [Math.round(volume * 100)],
                      }),
                      '*'
                    );
                    if (isPlaying) {
                      cw.postMessage(
                        JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
                        '*'
                      );
                    }
                  } catch {}
                };
                sendCmd();
                window.setTimeout(sendCmd, 350);
              }}
            />
          </div>
        )}
        {children}
        <GlobalMiniPlayer />
        <SpotifyFullPlayerModal />
      </MusicProgressContext.Provider>
    </MusicContext.Provider>
  );
}

const PLAYER_COVER_STATUS_CACHE = new Map<string, 'loaded' | 'error'>();

function PlayerCoverImg({
  src,
  alt,
  className = 'w-full h-full object-cover',
  iconSize = 20,
  draggable,
}: {
  src?: string;
  alt: string;
  className?: string;
  iconSize?: number;
  draggable?: boolean;
}) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const isBroken = !src || brokenSrc === src || PLAYER_COVER_STATUS_CACHE.get(src) === 'error';

  if (isBroken) {
    return (
      <div className="w-full h-full bg-[#383838] flex items-center justify-center pointer-events-none">
        <Music size={iconSize} className="text-white/70" strokeWidth={2} />
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      decoding="async"
      onLoad={() => {
        PLAYER_COVER_STATUS_CACHE.set(src, 'loaded');
      }}
      onError={() => {
        PLAYER_COVER_STATUS_CACHE.set(src, 'error');
        setBrokenSrc(src);
      }}
      className={className}
      draggable={draggable}
    />
  );
}

// COMPACT MINI PLAYER: #0A0A0A, 56px height, 40x40 cover, 13px/11px text, 32px buttons
export function GlobalMiniPlayer() {
  const {
    currentTrack,
    isPlaying,
    isLoop,
    togglePlay,
    setIsLoop,
    closePlayer,
    isTrackLiked,
    toggleLikeTrack,
    setIsFullPlayerOpen,
    offlineTrackIds,
  } = useMusic();
  const { currentTimeSec, durationSec } = useMusicProgress();
  const [isMinimized, setIsMinimized] = useState(false);
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const draggingRef = useRef(false);
  const startPosRef = useRef({ clientX: 0, clientY: 0, elemLeft: 0, elemTop: 0 });
  const hasDraggedRef = useRef(false);

  const bubbleElemRef = useRef<HTMLDivElement | null>(null);
  const liveDragPosRef = useRef<{ x: number; y: number } | null>(null);

  if (!currentTrack) return null;

  const coverImg = currentTrack.cover || currentTrack.thumbnail || '';
  const trackTitle = currentTrack.title || 'Memutar Musik';
  const trackArtist = currentTrack.artist || currentTrack.author || 'VN MUSIC';
  const miniProgress =
    durationSec > 0 ? Math.min(100, Math.max(0, (currentTimeSec / durationSec) * 100)) : 0;
  const liked = isTrackLiked(currentTrack.id || `${trackTitle}__${trackArtist}`);
  const isOfflineReady = currentTrack.id ? offlineTrackIds.has(currentTrack.id) : false;

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
    liveDragPosRef.current = { x: rect.left, y: rect.top };

    let dragRafId = 0;
    let pendingX = rect.left;
    let pendingY = rect.top;

    const applyTransform = () => {
      dragRafId = 0;
      const target = bubbleElemRef.current || elem;
      target.style.left = '0px';
      target.style.top = '0px';
      target.style.transform = `translate3d(${pendingX}px, ${pendingY}px, 0)`;
    };

    const onMove = (moveX: number, moveY: number) => {
      if (!draggingRef.current) return;
      const dx = moveX - startPosRef.current.clientX;
      const dy = moveY - startPosRef.current.clientY;
      if (Math.hypot(dx, dy) > 5) {
        hasDraggedRef.current = true;
      }
      pendingX = Math.max(8, Math.min(window.innerWidth - 64, startPosRef.current.elemLeft + dx));
      pendingY = Math.max(10, Math.min(window.innerHeight - 70, startPosRef.current.elemTop + dy));
      liveDragPosRef.current = { x: pendingX, y: pendingY };
      if (!dragRafId) {
        dragRafId = window.requestAnimationFrame(applyTransform);
      }
    };

    const finishDrag = () => {
      draggingRef.current = false;
      if (dragRafId) {
        window.cancelAnimationFrame(dragRafId);
        dragRafId = 0;
      }
      if (liveDragPosRef.current && hasDraggedRef.current) {
        setPosition({ ...liveDragPosRef.current });
      }
    };

    const handleMouseMove = (e: MouseEvent) => onMove(e.clientX, e.clientY);
    const handleMouseUp = () => {
      finishDrag();
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches[0]) onMove(e.touches[0].clientX, e.touches[0].clientY);
    };
    const handleTouchEnd = () => {
      finishDrag();
      window.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('touchend', handleTouchEnd);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('touchmove', handleTouchMove, { passive: true });
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
          left: '0px',
          top: '0px',
          transform: `translate3d(${position.x}px, ${position.y}px, 0)`,
          willChange: 'transform',
          touchAction: 'none',
          userSelect: 'none',
        }
      : {
          position: 'fixed',
          left: '0px',
          top: '0px',
          transform: 'translate3d(16px, 60px, 0)',
          willChange: 'transform',
          touchAction: 'none',
          userSelect: 'none',
        };

    return (
      <div
        ref={bubbleElemRef}
        onMouseDown={handleMouseDown}
        onTouchStart={handleTouchStart}
        onClick={handleClickCircle}
        style={bubbleStyle}
        className="z-[999] w-[56px] h-[56px] rounded-full bg-[#282828] border-2 border-[#1DB954] shadow-2xl overflow-hidden cursor-grab active:cursor-grabbing select-none group active:scale-95 transition-transform"
        title="Geser posisi • Klik untuk kembali jadi Mini Player"
      >
        <PlayerCoverImg
          src={coverImg}
          alt={trackTitle}
          iconSize={22}
          draggable={false}
          className={`w-full h-full object-cover pointer-events-none select-none ${
            isPlaying ? 'animate-[spin_10s_linear_infinite]' : ''
          }`}
        />

        <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
          <span className="text-white text-[10px] font-bold drop-shadow">▲</span>
        </div>
      </div>
    );
  }

  return (
    <div
      data-testid="spotify-mini-player"
      className="fixed bottom-[68px] left-0 right-0 w-full z-50 px-2 pointer-events-none"
    >
      <div className="w-full pointer-events-auto">
        <div
          onClick={() => setIsFullPlayerOpen(true)}
          className="ze-music-mini-player bg-[#0A0A0A] border border-white/10 rounded-xl min-h-[58px] px-2.5 py-1.5 relative overflow-hidden flex flex-col justify-center cursor-pointer"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 overflow-hidden min-w-0 flex-1">
              <div className="w-10 h-10 rounded-lg bg-[#262626] overflow-hidden flex items-center justify-center shrink-0 relative">
                <PlayerCoverImg src={toMusicThumbUrl(coverImg)} alt={trackTitle} iconSize={18} />
                {isOfflineReady && (
                  <span
                    className="absolute right-0.5 bottom-0.5 w-3.5 h-3.5 rounded-full bg-white text-black flex items-center justify-center"
                    title="Tersedia Offline"
                  >
                    <Download size={8} strokeWidth={3} />
                  </span>
                )}
              </div>

              <div className="overflow-hidden min-w-0 flex-1">
                <p className="text-[13px] font-bold text-white truncate leading-tight">
                  {trackTitle}
                </p>
                <p className="text-[11px] text-[#B3B3B3] truncate mt-0.5 leading-tight flex items-center gap-1">
                  <span className="truncate">{trackArtist}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => toggleLikeTrack(currentTrack)}
                className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
                title={liked ? 'Hapus dari Lagu Disukai' : 'Sukai Lagu'}
                aria-label="Sukai Lagu"
              >
                <Heart
                  size={16}
                  className={
                    liked ? 'text-white fill-white' : 'text-[#B3B3B3] hover:text-white'
                  }
                />
              </button>

              <button
                type="button"
                onClick={togglePlay}
                className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center cursor-pointer"
                title={isPlaying ? 'Pause' : 'Play'}
                aria-label={isPlaying ? 'Pause' : 'Play'}
              >
                {isPlaying ? (
                  <Pause className="w-4 h-4 fill-black" />
                ) : (
                  <Play className="w-4 h-4 fill-black ml-0.5" />
                )}
              </button>

              <button
                type="button"
                onClick={() => setIsLoop(!isLoop)}
                className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer border transition active:scale-95 ${
                  isLoop
                    ? 'bg-white text-black border-white shadow-[0_0_10px_rgba(255,255,255,0.45)]'
                    : 'bg-[#161616] text-white/45 border-white/15 hover:text-white/80'
                }`}
                title={isLoop ? 'Loop Aktif (Ulang Otomatis)' : 'Loop Nonaktif'}
                aria-label={isLoop ? 'Matikan Loop' : 'Aktifkan Loop'}
                aria-pressed={isLoop}
                data-testid="music-loop-toggle"
              >
                <Repeat className="w-4 h-4" strokeWidth={2.2} />
              </button>

              <button
                type="button"
                onClick={() => setIsMinimized(true)}
                className="w-8 h-8 rounded-full text-[#B3B3B3] hover:text-white flex items-center justify-center cursor-pointer"
                title="Perkecil jadi Bubble"
                aria-label="Perkecil Player"
              >
                <ChevronDown className="w-4 h-4" />
              </button>

              <button
                type="button"
                onClick={closePlayer}
                className="w-8 h-8 rounded-full text-[#B3B3B3] hover:text-white flex items-center justify-center cursor-pointer"
                title="Tutup Musik"
                aria-label="Tutup Musik"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="mt-1 flex items-center justify-between px-0.5 pb-0.5 pointer-events-none">
            <span
              data-testid="music-loop-status"
              className={`text-[9px] font-mono tracking-wider uppercase ${
                isLoop ? 'text-white font-bold' : 'text-white/45'
              }`}
            >
              {isLoop ? 'LOOP: ON' : 'LOOP: OFF'}
            </span>
          </div>

          <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-white/10">
            <div
              className="h-full bg-white"
              style={{ width: `${miniProgress}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// COMPACT FULL PLAYER MODAL (#0A0A0A, Cover 320x320 HD, 56px Play, 48px Prev/Next)
function SpotifyFullPlayerModal() {
  const {
    currentTrack,
    isPlaying,
    playlist,
    volume,
    playbackRate,
    isLoop,
    isShuffle,
    youtubeId,
    isFullPlayerOpen,
    setIsFullPlayerOpen,
    togglePlay,
    playMusic,
    playNext,
    playPrevious,
    seekTo,
    setVolume,
    setPlaybackRate,
    setIsLoop,
    setIsShuffle,
    isTrackLiked,
    toggleLikeTrack,
    switchPlaybackMode,
    findAnotherFullVersion,
    ytStatusText,
    offlineTrackIds,
    downloadProgressMap,
    downloadTrackOffline,
    removeOfflineTrack,
  } = useMusic();
  const { currentTimeSec, durationSec } = useMusicProgress();

  if (!isFullPlayerOpen || !currentTrack) return null;

  const coverImg = toMusicHdUrl(currentTrack.cover || currentTrack.thumbnail || '');
  const trackTitle = currentTrack.title || 'Memutar Musik';
  const trackArtist = currentTrack.artist || currentTrack.author || 'VN MUSIC';
  const trackKey = currentTrack.id || `${trackTitle}__${trackArtist}`;
  const liked = isTrackLiked(trackKey);
  const isDownloaded = Boolean(currentTrack.id && offlineTrackIds.has(currentTrack.id));
  const dlProgress = currentTrack.id ? downloadProgressMap[currentTrack.id] : undefined;
  const isYoutubeMode = Boolean(currentTrack.playbackMode === 'youtube' || youtubeId);
  const isFullAudioMode =
    currentTrack.playbackMode === 'full' || currentTrack.playbackMode === 'offline';

  const effectiveDuration = Math.max(
    durationSec || 0,
    currentTrack.durationMs ? Math.round(currentTrack.durationMs / 1000) : 0
  );
  const progressPercent =
    effectiveDuration > 0
      ? Math.min(100, Math.max(0, (currentTimeSec / effectiveDuration) * 100))
      : 0;

  const formatTime = (sec: number) => {
    const clean = Math.max(0, Math.floor(sec || 0));
    const m = Math.floor(clean / 60);
    const s = clean % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (effectiveDuration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekTo(pos * effectiveDuration);
  };

  const upNext = playlist.filter(
    (item) => (item.id || item.title) !== (currentTrack.id || currentTrack.title)
  );

  return (
    <div
      data-testid="spotify-full-player-modal"
      className="ze-music-full-player fixed inset-0 z-[10060] bg-[#0A0A0A] text-white overflow-y-auto flex flex-col"
    >
      {/* Top Bar */}
      <div className="sticky top-0 z-10 bg-[#0A0A0A] border-b border-white/10 px-3 py-2.5 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => setIsFullPlayerOpen(false)}
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          aria-label="Tutup Full Player"
        >
          <ChevronDown size={22} />
        </button>

        <div className="text-center min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#B3B3B3]">
            SEDANG DIPUTAR
          </p>
          <p className="text-xs font-bold text-white truncate max-w-[200px]">
            {currentTrack.album || 'VN Music Global'}
          </p>
        </div>

        <button
          type="button"
          onClick={() => toggleLikeTrack(currentTrack)}
          className="w-9 h-9 rounded-full flex items-center justify-center cursor-pointer"
          aria-label="Sukai Lagu"
        >
          <Heart
            size={18}
            className={liked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#B3B3B3]'}
          />
        </button>
      </div>

      {/* Main Content */}
      <div className="max-w-lg w-full mx-auto px-4 py-4 flex-1 flex flex-col items-center">
        {/* Cover 320x320 HD */}
        <div className="w-[min(320px,78vw)] h-[min(320px,78vw)] rounded-xl overflow-hidden bg-[#1C1C1C] flex items-center justify-center shrink-0 relative">
          <PlayerCoverImg src={coverImg} alt={trackTitle} iconSize={64} />
          {isDownloaded && (
            <span className="absolute right-2.5 bottom-2.5 px-2 py-0.5 rounded-full bg-[#1DB954] text-black text-[11px] font-bold flex items-center gap-1">
              <Download size={12} strokeWidth={3} />
              <span>Offline</span>
            </span>
          )}
        </div>

        {/* Title 20px + Artist 14px */}
        <div className="w-full mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[20px] font-bold text-white leading-tight truncate">
              {trackTitle}
            </h2>
            <p className="text-[14px] text-[#B3B3B3] mt-0.5 truncate">{trackArtist}</p>
            {ytStatusText && (
              <p
                className={`text-xs font-semibold mt-1 ${
                  currentTrack.isPreviewFallback ? 'text-red-400' : 'text-[#1DB954]'
                }`}
              >
                {ytStatusText}
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={() => toggleLikeTrack(currentTrack)}
            className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 cursor-pointer"
            aria-label={liked ? 'Hapus dari disukai' : 'Sukai'}
          >
            <Heart
              size={20}
              className={
                liked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#B3B3B3] hover:text-white'
              }
            />
          </button>
        </div>

        {/* Offline Status & Download Action Button */}
        {currentTrack.source !== 'tiktok' && currentTrack.id && (
          <div className="w-full mt-2.5 flex flex-wrap items-center gap-2">
            {dlProgress && dlProgress.status !== 'error' ? (
              <div className="w-full bg-[#141414] rounded-xl p-2 border border-[#1DB954]/40">
                <div className="flex items-center justify-between text-xs font-bold text-[#1DB954] mb-1">
                  <span className="flex items-center gap-1.5">
                    <Loader2 size={13} className="animate-spin" />
                    Mendownload {dlProgress.percent}% - {formatBytesMb(dlProgress.loadedBytes)} /{' '}
                    {formatBytesMb(dlProgress.totalBytes)}
                  </span>
                </div>
                <div className="h-1 bg-white/15 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-[#1DB954]"
                    style={{ width: `${dlProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : isDownloaded ? (
              <>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#1DB954]/20 border border-[#1DB954]/50 text-[#1DB954] text-xs font-bold">
                  <WifiOff size={12} />
                  <span>Tersedia Offline</span>
                </div>
                <button
                  type="button"
                  onClick={() => currentTrack.id && removeOfflineTrack(currentTrack.id)}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-[#1A1A1A] text-xs font-bold text-[#B3B3B3] hover:text-red-300 border border-white/10 cursor-pointer"
                >
                  <Trash2 size={12} />
                  <span>Hapus Download</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => downloadTrackOffline(currentTrack)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#1A1A1A] border border-white/15 text-xs font-bold text-white cursor-pointer"
              >
                <Download size={14} className="text-[#1DB954]" />
                <span>Download Untuk Offline</span>
              </button>
            )}
          </div>
        )}

        {/* Mode Switches (Full Audio vs YouTube Full) */}
        {currentTrack.source !== 'tiktok' && (
          <div className="w-full flex items-center gap-2 mt-3">
            <button
              type="button"
              onClick={() => switchPlaybackMode('full')}
              className={`flex-1 h-9 px-3 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 border cursor-pointer whitespace-nowrap ${
                isFullAudioMode
                  ? 'bg-[#1DB954] text-black border-[#1DB954]'
                  : 'bg-[#1A1A1A] border-white/10 text-white'
              }`}
            >
              <Disc3 size={14} />
              <span>Putar Full Audio</span>
            </button>
            <button
              type="button"
              onClick={() => switchPlaybackMode('youtube')}
              className={`flex-1 h-9 px-3 rounded-full text-xs font-bold flex items-center justify-center gap-1.5 border cursor-pointer whitespace-nowrap ${
                isYoutubeMode
                  ? 'bg-white text-black border-white'
                  : 'bg-[#1A1A1A] border-white/10 text-white'
              }`}
            >
              <Youtube size={14} />
              <span>Putar Full YouTube</span>
            </button>
          </div>
        )}

        {/* Seek Progress Slider */}
        <div className="w-full mt-4">
          <input
            type="range"
            min={0}
            max={Math.max(1, effectiveDuration)}
            step={1}
            value={Math.min(currentTimeSec, Math.max(1, effectiveDuration))}
            onChange={(e) => seekTo(Number(e.target.value))}
            aria-label="Progress & Seek Lagu"
            data-testid="music-seek-slider"
            className="w-full h-1.5 rounded-full accent-[#1DB954] cursor-pointer appearance-none bg-white/20"
            style={{
              background: `linear-gradient(to right, #1DB954 ${progressPercent}%, rgba(255,255,255,0.2) ${progressPercent}%)`,
            }}
          />
          <div className="flex justify-between text-[11px] text-[#B3B3B3] mt-1 font-mono tabular-nums">
            <span>{formatTime(currentTimeSec)}</span>
            <span>{formatTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Main Controls: Shuffle · Prev 48px · Play 56px · Next 48px · Repeat */}
        <div className="w-full flex items-center justify-between mt-3">
          <button
            type="button"
            onClick={() => setIsShuffle(!isShuffle)}
            className="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer"
            aria-label="Shuffle"
          >
            <Shuffle size={18} className={isShuffle ? 'text-[#1DB954]' : 'text-[#B3B3B3]'} />
          </button>

          <button
            type="button"
            onClick={playPrevious}
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
            aria-label="Sebelumnya"
          >
            <SkipBack size={24} className="text-white fill-white" />
          </button>

          <button
            type="button"
            onClick={togglePlay}
            className="w-14 h-14 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer"
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <Pause size={24} className="fill-black text-black" />
            ) : (
              <Play size={24} className="fill-black text-black ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            className="w-12 h-12 rounded-full flex items-center justify-center cursor-pointer"
            aria-label="Berikutnya"
          >
            <SkipForward size={24} className="text-white fill-white" />
          </button>

          <button
            type="button"
            onClick={() => setIsLoop(!isLoop)}
            className={`w-10 h-10 rounded-full flex items-center justify-center cursor-pointer border transition ${
              isLoop
                ? 'bg-white text-black border-white shadow-[0_0_12px_rgba(255,255,255,0.4)]'
                : 'bg-transparent text-white/45 border-transparent hover:text-white'
            }`}
            aria-label="Repeat"
            aria-pressed={isLoop}
          >
            <Repeat size={18} strokeWidth={2.2} />
          </button>
        </div>

        <div className="w-full flex justify-center mt-1.5">
          <span
            className={`text-[10px] font-mono tracking-wider uppercase ${
              isLoop ? 'text-white font-bold' : 'text-white/45'
            }`}
          >
            {isLoop ? 'LOOP: ON' : 'LOOP: OFF'}
          </span>
        </div>

        {/* Volume */}
        <div className="w-full flex items-center gap-2.5 mt-4">
          <Volume2 size={16} className="text-[#B3B3B3] shrink-0" />
          <input
            type="range"
            min={0}
            max={100}
            value={Math.round(volume * 100)}
            onChange={(e) => setVolume(Number(e.target.value) / 100)}
            aria-label="Volume"
            className="flex-1 h-1.5 accent-[#1DB954] cursor-pointer"
          />
          <span className="text-[11px] font-mono tabular-nums text-[#B3B3B3] w-9 text-right">
            {Math.round(volume * 100)}%
          </span>
        </div>

        {/* Lagu Berikutnya (Queue) */}
        {upNext.length > 0 && (
          <div className="w-full mt-5 pb-6">
            <div className="flex items-center gap-2 mb-2">
              <ListMusic size={16} className="text-[#1DB954]" />
              <h3 className="text-[14px] font-bold text-white">
                Antrean ({upNext.length})
              </h3>
            </div>
            <div className="space-y-2">
              {upNext.slice(0, 15).map((item, idx) => (
                <button
                  key={`${item.id || item.title}_${idx}`}
                  type="button"
                  onClick={() => playMusic(item)}
                  className="w-full p-2 rounded-lg bg-[#141414] hover:bg-[#1E1E1E] flex items-center gap-2.5 text-left cursor-pointer"
                >
                  <div className="w-12 h-12 rounded-md overflow-hidden bg-[#262626] shrink-0 flex items-center justify-center relative">
                    <PlayerCoverImg src={toMusicThumbUrl(item.thumbnail || item.cover)} alt={item.title} iconSize={16} />
                    {item.id && offlineTrackIds.has(item.id) && (
                      <span className="absolute right-0.5 bottom-0.5 w-3.5 h-3.5 rounded-full bg-[#1DB954] text-black flex items-center justify-center">
                        <Download size={8} strokeWidth={3} />
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[14px] font-bold text-white truncate">{item.title}</p>
                    <p className="text-[12px] text-[#B3B3B3] truncate">
                      {item.artist || item.author || 'VN Music'}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export { GlobalMiniPlayer as MiniPlayer, GlobalMiniPlayer as MusicPlayerBar };

export function useMusic() {
  const context = useContext(MusicContext);
  if (!context) {
    throw new Error('useMusic must be used within MusicProvider');
  }
  return context;
}
