import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  Music,
  Play,
  Pause,
  Shuffle,
  Link as LinkIcon,
  Trash2,
  ListMusic,
  Search,
  SlidersHorizontal,
  Heart,
  ChevronLeft,
  Disc3,
  Loader2,
  X,
  Volume2,
  CheckCircle2,
  Maximize2,
  Download,
  WifiOff,
  RefreshCw,
  AlertTriangle,
  Wifi,
} from 'lucide-react';
import { db, collection, doc, setDoc, deleteDoc, getDocs, query, where } from '../firebase.ts';
import { resolveTikTokVideo, safeApiFetch } from '../lib/zeDataSync.ts';
import {
  useMusic,
  formatBytesMb,
  toMusicThumbUrl,
  type TrackData,
  type TrackSourceType,
} from '../contexts/MusicContext.tsx';
import type { DownloadQualityKbps } from '../lib/offlineMusicDb.ts';
import releaseRadarCoverImg from '../assets/images/release_radar_cover_1795673970438.jpg';
import mixGalauCoverImg from '../assets/images/mix_galau_cover_1795673970596.jpg';
import mixSemangatCoverImg from '../assets/images/mix_semangat_cover_1795673970974.jpg';

export interface ConvertedTrack {
  id: string;
  title: string;
  author: string;
  thumbnail: string;
  sourceUrl: string;
  sourceType: TrackSourceType;
  videoUrl?: string;
  audioUrl?: string;
  previewUrl?: string;
  fullAudioUrl?: string;
  youtubeId?: string;
  playbackMode?: 'full' | 'youtube' | 'preview' | 'offline';
  isPreviewFallback?: boolean;
  isCatalogSearch?: boolean;
  album?: string;
  durationMs?: number;
  streamUrl?: string;
  createdAt: number;
}

export interface CatalogSong {
  id: string;
  trackId?: string;
  isrc?: string;
  title: string;
  artist: string;
  artistId?: string;
  album: string;
  albumId?: string;
  releaseYear?: string;
  genre?: string;
  thumbnail: string;
  previewUrl: string;
  fullAudioUrl?: string;
  durationMs: number;
  source: 'youtube' | 'itunes' | 'deezer' | 'jamendo' | 'soundcloud' | 'audius' | 'offline';
  sourceUrl: string;
  youtubeId?: string;
}

interface CuratedPlaylistDef {
  id: string;
  title: string;
  subtitle: string;
  keywords: string[];
  isLikedCollection?: boolean;
  customCoverSrc?: string;
  fallbackGradient: string;
  artistPriorityKeywords?: string[];
}

interface ArtistBucket {
  name: string;
  photo: string;
  songs: CatalogSong[];
  albums: AlbumBucket[];
}

interface AlbumBucket {
  key: string;
  title: string;
  artist: string;
  year: string;
  cover: string;
  songs: CatalogSong[];
}

const CATALOG_CACHE_STORAGE_KEY = 'ze_music_catalog_yt_v3';
const CATALOG_CACHE_TTL_MS = 60 * 60 * 1000;

function readCachedCatalogSync(): { tracks: CatalogSong[]; total: number } {
  if (typeof window === 'undefined') return { tracks: [], total: 100000 };
  try {
    const raw = window.localStorage.getItem(CATALOG_CACHE_STORAGE_KEY);
    if (!raw) return { tracks: [], total: 100000 };
    const parsed = JSON.parse(raw);
    if (
      parsed &&
      Array.isArray(parsed.tracks) &&
      parsed.tracks.length > 0 &&
      Date.now() - (Number(parsed.ts) || 0) < CATALOG_CACHE_TTL_MS
    ) {
      return {
        tracks: parsed.tracks,
        total: Number(parsed.total) || Math.max(100000, parsed.tracks.length),
      };
    }
  } catch {}
  return { tracks: [], total: 100000 };
}

function writeCachedCatalogSync(tracks: CatalogSong[], total: number) {
  if (typeof window === 'undefined' || tracks.length === 0) return;
  try {
    window.localStorage.setItem(
      CATALOG_CACHE_STORAGE_KEY,
      JSON.stringify({ ts: Date.now(), total, tracks: tracks.slice(0, 250) })
    );
  } catch {}
}

const MUSIC_COVER_STATUS_CACHE = new Map<string, 'loaded' | 'error'>();

const MusicCoverImg = React.memo(function MusicCoverImg({
  src,
  alt,
  className = 'w-full h-full object-cover',
  iconSize = 18,
  loading = 'lazy',
}: {
  src?: string;
  alt: string;
  className?: string;
  iconSize?: number;
  loading?: 'lazy' | 'eager';
}) {
  const optimizedSrc = useMemo(() => toMusicThumbUrl(src), [src]);
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const isBroken =
    !optimizedSrc ||
    brokenSrc === optimizedSrc ||
    MUSIC_COVER_STATUS_CACHE.get(optimizedSrc) === 'error';

  if (isBroken) {
    return (
      <div className="w-full h-full bg-[#1C1C1C] flex items-center justify-center">
        <Music size={iconSize} className="text-white/40" strokeWidth={2} />
      </div>
    );
  }

  return (
    <img
      src={optimizedSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={loading}
      decoding="async"
      onLoad={() => {
        MUSIC_COVER_STATUS_CACHE.set(optimizedSrc, 'loaded');
      }}
      onError={() => {
        MUSIC_COVER_STATUS_CACHE.set(optimizedSrc, 'error');
        setBrokenSrc(optimizedSrc);
      }}
      className={className}
    />
  );
});

const formatCompactTime = (seconds: number) => {
  const clean = Math.max(0, Math.floor(seconds || 0));
  const m = Math.floor(clean / 60);
  const s = Math.floor(clean % 60);
  return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
};

type QueuePoolKey = 'catalog' | 'trending' | 'viral' | 'offline' | 'playlist' | 'artist' | 'album';

interface MemoRowProps {
  song: CatalogSong;
  idx: number;
  poolKey?: QueuePoolKey;
  isSelected: boolean;
  isPlaying: boolean;
  isResolving: boolean;
  isLiked: boolean;
  isDownloaded: boolean;
  dlProg?: { percent: number; loadedBytes: number; totalBytes: number; status: string };
  onSelectSong: (song: CatalogSong, poolKey?: QueuePoolKey) => void;
  onTogglePlay: () => void;
  onArtistClick: (artist: string) => void;
  onDownloadClick: (song: CatalogSong, isDownloaded: boolean) => void;
  onToggleLike: (song: CatalogSong) => void;
}

const MemoSpotifyTrackRow = React.memo(function MemoSpotifyTrackRow({
  song,
  idx,
  poolKey,
  isSelected,
  isPlaying,
  isResolving,
  isLiked,
  isDownloaded,
  dlProg,
  onSelectSong,
  onTogglePlay,
  onArtistClick,
  onDownloadClick,
  onToggleLike,
}: MemoRowProps) {
  const durSec = Math.max(0, Math.round((song.durationMs || 0) / 1000));
  const isDownloading = Boolean(dlProg && dlProg.status !== 'error');

  return (
    <div
      onClick={() => onSelectSong(song, poolKey)}
      className={`ze-music-row-surface ze-cv-row p-2 rounded-lg flex items-center justify-between gap-2 cursor-pointer ${
        isSelected ? 'bg-[#1F1F1F]' : 'bg-[#121212] hover:bg-[#191919]'
      }`}
    >
      <div className="flex items-center gap-2 min-w-0 flex-1">
        <span
          className={`w-5 text-center text-[12px] font-bold tabular-nums shrink-0 ${
            isSelected ? 'text-[#1DB954]' : 'text-[#8E8E93]'
          }`}
        >
          {idx + 1}
        </span>

        <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1C1C1C] shrink-0 flex items-center justify-center relative">
          <MusicCoverImg src={song.thumbnail} alt={song.title} iconSize={18} loading="lazy" />
          {isDownloaded && (
            <span
              className="absolute right-0.5 bottom-0.5 w-3.5 h-3.5 rounded-full bg-[#1DB954] text-black flex items-center justify-center"
              title="Sudah Didownload Offline"
            >
              <Download size={9} strokeWidth={3} />
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 min-w-0">
            <p
              className={`text-[14px] font-bold truncate leading-tight ${
                isSelected ? 'text-[#1DB954]' : 'text-white'
              }`}
            >
              {song.title}
            </p>
          </div>
          <p
            onClick={(e) => {
              e.stopPropagation();
              onArtistClick(song.artist.split(/[,&]/)[0].trim());
            }}
            className="text-[12px] text-[#A1A1AA] hover:text-white truncate mt-0.5 leading-tight"
          >
            {song.artist}
          </p>
          {isDownloading && dlProg && (
            <div className="mt-1 space-y-0.5">
              <p className="text-[10px] font-bold text-[#1DB954] tabular-nums">
                {dlProg.percent}% · {formatBytesMb(dlProg.loadedBytes)}/{formatBytesMb(dlProg.totalBytes)}
              </p>
              <div className="h-1 bg-white/15 rounded-full overflow-hidden max-w-[140px]">
                <div className="h-full bg-[#1DB954]" style={{ width: `${dlProg.percent}%` }} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
        {durSec > 0 && (
          <span className="hidden sm:inline text-[11px] text-[#8E8E93] font-mono tabular-nums mr-1">
            {formatCompactTime(durSec)}
          </span>
        )}

        <button
          type="button"
          disabled={isDownloading}
          onClick={() => onDownloadClick(song, isDownloaded)}
          className={`w-8 h-8 rounded-full flex items-center justify-center cursor-pointer ${
            isDownloaded ? 'bg-[#1DB954]/20 text-[#1DB954]' : 'text-[#A1A1AA] hover:text-white'
          }`}
          title={isDownloaded ? 'Hapus Download' : 'Download Lagu Offline'}
          aria-label={isDownloaded ? 'Hapus Download' : 'Download Lagu'}
        >
          {isDownloading ? (
            <Loader2 size={15} className="animate-spin text-[#1DB954]" />
          ) : isDownloaded ? (
            <CheckCircle2 size={15} />
          ) : (
            <Download size={15} />
          )}
        </button>

        <button
          type="button"
          onClick={() => onToggleLike(song)}
          className="w-8 h-8 rounded-full flex items-center justify-center cursor-pointer"
          aria-label={isLiked ? 'Hapus dari disukai' : 'Sukai lagu'}
        >
          <Heart
            size={15}
            className={isLiked ? 'text-[#1DB954] fill-[#1DB954]' : 'text-[#A1A1AA] hover:text-white'}
          />
        </button>

        <button
          type="button"
          onClick={() => {
            if (isSelected && !isResolving) onTogglePlay();
            else onSelectSong(song, poolKey);
          }}
          className="w-8 h-8 rounded-full bg-[#1DB954] text-black flex items-center justify-center shrink-0 cursor-pointer"
          title={isSelected && isPlaying ? 'Pause' : 'Play'}
          aria-label={isSelected && isPlaying ? `Pause ${song.title}` : `Play ${song.title}`}
        >
          {isResolving ? (
            <Loader2 size={14} className="animate-spin text-black" />
          ) : isSelected && isPlaying ? (
            <Pause size={14} className="fill-black text-black" />
          ) : (
            <Play size={14} className="fill-black text-black ml-0.5" />
          )}
        </button>
      </div>
    </div>
  );
});

const MemoHorizontalSongCard = React.memo(function MemoHorizontalSongCard({
  song,
  poolKey,
  isSelected,
  isPlaying,
  onSelectSong,
  onTogglePlay,
}: {
  song: CatalogSong;
  poolKey?: QueuePoolKey;
  isSelected: boolean;
  isPlaying: boolean;
  onSelectSong: (song: CatalogSong, poolKey?: QueuePoolKey) => void;
  onTogglePlay: () => void;
}) {
  return (
    <div
      onClick={() => onSelectSong(song, poolKey)}
      className="ze-music-card-surface ze-cv-card w-[136px] h-[116px] shrink-0 bg-[#141414] hover:bg-[#1C1C1C] rounded-lg p-2 flex flex-col justify-between cursor-pointer"
    >
      <div className="flex items-center justify-between gap-2">
        <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1C1C1C] shrink-0">
          <MusicCoverImg src={song.thumbnail} alt={song.title} iconSize={18} loading="lazy" />
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (isSelected) onTogglePlay();
            else onSelectSong(song, poolKey);
          }}
          className="w-8 h-8 rounded-full bg-[#1DB954] text-black flex items-center justify-center shrink-0 cursor-pointer"
          aria-label={`Play ${song.title}`}
        >
          {isSelected && isPlaying ? (
            <Pause size={14} className="fill-black" />
          ) : (
            <Play size={14} className="fill-black ml-0.5" />
          )}
        </button>
      </div>
      <div className="min-w-0">
        <p className={`text-[13px] font-bold truncate leading-tight ${isSelected ? 'text-[#1DB954]' : 'text-white'}`}>
          {song.title}
        </p>
        <p className="text-[11px] text-[#A1A1AA] truncate leading-tight mt-0.5">{song.artist}</p>
      </div>
    </div>
  );
});

const MemoPlaylistCard = React.memo(function MemoPlaylistCard({
  pl,
  collage,
  onOpen,
}: {
  pl: CuratedPlaylistDef;
  collage: CatalogSong[];
  onOpen: (id: string) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(pl.id)}
      className="ze-music-card-surface ze-cv-card bg-[#141414] hover:bg-[#1C1C1C] rounded-lg p-2 h-[88px] text-left flex items-center gap-2 cursor-pointer"
    >
      <div
        className={`w-14 h-14 shrink-0 rounded-md overflow-hidden bg-[#1C1C1C] relative grid ${
          !pl.isLikedCollection && !pl.customCoverSrc && collage.length >= 4
            ? 'grid-cols-2 grid-rows-2'
            : 'grid-cols-1 grid-rows-1'
        }`}
      >
        {pl.isLikedCollection ? (
          <div className="flex items-center justify-center w-full h-full bg-[#242424]">
            <Heart size={20} className="text-[#1DB954] fill-[#1DB954]" />
          </div>
        ) : pl.customCoverSrc ? (
          <img
            src={pl.customCoverSrc}
            alt={pl.title}
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover"
          />
        ) : collage.length >= 4 ? (
          collage.map((c, idx) => (
            <MusicCoverImg
              key={`${c.id}_${idx}`}
              src={c.thumbnail}
              alt={c.title || pl.title}
              iconSize={12}
              loading="lazy"
            />
          ))
        ) : collage[0]?.thumbnail ? (
          <MusicCoverImg src={collage[0].thumbnail} alt={pl.title} iconSize={20} loading="lazy" />
        ) : (
          <div
            className="flex items-center justify-center w-full h-full"
            style={{ background: pl.fallbackGradient }}
          >
            <Music size={20} className="text-white/85" strokeWidth={2} />
          </div>
        )}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-[14px] font-bold text-white truncate leading-tight">{pl.title}</p>
        <p className="text-[11px] text-[#A1A1AA] line-clamp-2 mt-0.5 leading-tight">{pl.subtitle}</p>
      </div>
    </button>
  );
});

const CATEGORY_CHIPS = [
  'Semua',
  'Musik',
  'Playlist',
  'Artis',
  'Album',
  'Viral',
  'Top Hits',
  'Galau',
  'Semangat',
  'Indonesia',
  'Barat',
  'K-Pop',
  'Dangdut',
];

const SEARCH_TABS: Array<{ id: 'lagu' | 'artis' | 'album' | 'playlist'; label: string }> = [
  { id: 'lagu', label: 'Lagu' },
  { id: 'artis', label: 'Artis' },
  { id: 'album', label: 'Album' },
  { id: 'playlist', label: 'Playlist' },
];

const MADE_FOR_YOU_PLAYLISTS: CuratedPlaylistDef[] = [
  {
    id: 'daily_mix_1',
    title: 'Daily Mix 1',
    subtitle: 'Bernadya, Hindia, Nadin Amizah & Indie Indo',
    keywords: ['bernadya', 'hindia', 'nadin', 'tulus', 'feast', 'indonesia'],
    artistPriorityKeywords: ['bernadya', 'hindia', 'nadin', 'tulus'],
    fallbackGradient: 'linear-gradient(135deg, #2D1B4E 0%, #7C3AED 55%, #EC4899 100%)',
  },
  {
    id: 'daily_mix_2',
    title: 'Daily Mix 2',
    subtitle: 'Taylor Swift, Billie Eilish, Coldplay & Pop Barat',
    keywords: ['taylor', 'billie', 'coldplay', 'weeknd', 'dua lipa', 'bruno'],
    artistPriorityKeywords: ['taylor', 'billie', 'coldplay', 'weeknd'],
    fallbackGradient: 'linear-gradient(135deg, #0F3D3E 0%, #0284C7 55%, #38BDF8 100%)',
  },
  {
    id: 'daily_mix_3',
    title: 'Daily Mix 3',
    subtitle: 'BTS, BLACKPINK, NewJeans & K-Pop Hits',
    keywords: ['bts', 'blackpink', 'newjeans', 'aespa', 'stray kids', 'kpop'],
    artistPriorityKeywords: ['bts', 'blackpink', 'newjeans', 'aespa'],
    fallbackGradient: 'linear-gradient(135deg, #4C0519 0%, #DB2777 55%, #A855F7 100%)',
  },
  {
    id: 'release_radar',
    title: 'Release Radar',
    subtitle: 'Rilis terbaru pilihan minggu ini untuk kamu',
    keywords: ['2024', '2025', 'hits', 'new', 'pop', 'mahalini', 'tiara'],
    customCoverSrc: releaseRadarCoverImg,
    fallbackGradient: 'linear-gradient(135deg, #064E3B 0%, #1DB954 60%, #10B981 100%)',
  },
  {
    id: 'liked_songs',
    title: 'Lagu Yang Disukai',
    subtitle: 'Koleksi lagu favorit pilihanmu',
    keywords: [],
    isLikedCollection: true,
    fallbackGradient: 'linear-gradient(135deg, #1E1B4B 0%, #1DB954 100%)',
  },
  {
    id: 'mix_galau',
    title: 'Mix Galau',
    subtitle: 'Lagu sedih, akustik & temani malam sunyi',
    keywords: ['galau', 'sedih', 'bernadya', 'fiersa', 'pamungkas', 'raisa'],
    customCoverSrc: mixGalauCoverImg,
    fallbackGradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 55%, #475569 100%)',
  },
  {
    id: 'mix_semangat',
    title: 'Mix Semangat',
    subtitle: 'Beat upbeat untuk olahraga, kerja & perjalanan',
    keywords: ['semangat', 'rock', 'dance', 'edm', 'coldplay', 'imagine'],
    customCoverSrc: mixSemangatCoverImg,
    fallbackGradient: 'linear-gradient(135deg, #7C2D12 0%, #F97316 55%, #FACC15 100%)',
  },
];

const CURATED_FOR_YOU_PLAYLISTS: CuratedPlaylistDef[] = [
  {
    id: 'top_50_global',
    title: 'Top 50 Global',
    subtitle: 'Tangga lagu terpopuler dunia hari ini',
    keywords: ['top hits', 'global', 'billie', 'taylor', 'bruno', 'weeknd'],
    artistPriorityKeywords: ['bruno', 'weeknd', 'billie', 'taylor'],
    fallbackGradient: 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 55%, #06B6D4 100%)',
  },
  {
    id: 'viral_tiktok',
    title: 'Viral TikTok',
    subtitle: 'Sound & lagu FYP paling sering diputar',
    keywords: ['viral', 'tiktok', 'koplo', 'dangdut', 'dj', 'remix'],
    artistPriorityKeywords: ['tiktok', 'viral', 'dj', 'remix'],
    fallbackGradient: 'linear-gradient(135deg, #831843 0%, #F43F5E 55%, #FB923C 100%)',
  },
  {
    id: 'galau_indo',
    title: 'Galau Indonesia',
    subtitle: 'Balada populer Tanah Air',
    keywords: ['tulus', 'mahalini', 'rizky', 'judika', 'lyodra', 'bernadya'],
    artistPriorityKeywords: ['mahalini', 'tulus', 'lyodra', 'judika'],
    fallbackGradient: 'linear-gradient(135deg, #312E81 0%, #6366F1 55%, #A78BFA 100%)',
  },
  {
    id: 'dangdut_koplo',
    title: 'Dangdut & Koplo',
    subtitle: 'Denny Caknan, Happy Asmara, NDX A.K.A',
    keywords: ['dangdut', 'koplo', 'denny', 'happy asmara', 'ndx'],
    artistPriorityKeywords: ['denny', 'happy asmara', 'ndx', 'koplo'],
    fallbackGradient: 'linear-gradient(135deg, #713F12 0%, #EAB308 55%, #EF4444 100%)',
  },
];

const INITIAL_BATCH_LIMIT = 20;
const SCROLL_BATCH_LIMIT = 20;

export function MusicLabPage({
  currentUser,
  currentTrack: propCurrentTrack,
  isPlaying: propIsPlaying,
  onPlayTrack,
  onTogglePlay,
  onDeleteCurrent,
}: {
  currentUser: { id: string; name: string; photo?: string; avatar?: string; username?: string };
  currentTrack: TrackData | null;
  isPlaying: boolean;
  onPlayTrack: (track: TrackData) => void;
  onTogglePlay: () => void;
  onDeleteCurrent: () => void;
}) {
  const {
    currentTrack: ctxTrack,
    isPlaying: ctxIsPlaying,
    volume,
    setVolume,
    setPlaylist,
    likedTracks,
    isTrackLiked,
    toggleLikeTrack,
    setIsFullPlayerOpen,
    setYtStatusText,
    musicSettings,
    updateMusicSettings,
    offlineTracks,
    offlineTrackIds,
    downloadProgressMap,
    downloadTrackOffline,
    removeOfflineTrack,
    clearAllOfflineDownloads,
    downloadNotice,
    setDownloadNotice,
    preloadTracksAudio,
  } = useMusic();

  const currentTrack = ctxTrack || propCurrentTrack;
  const isPlaying = ctxTrack ? ctxIsPlaying : propIsPlaying;

  // Paste Link TikTok / YouTube State
  const [linkInput, setLinkInput] = useState('');
  const [isFetchingInfo, setIsFetchingInfo] = useState(false);
  const [tiktokError, setTiktokError] = useState<string | null>(null);
  const [lastFailedTiktokUrl, setLastFailedTiktokUrl] = useState<string>('');
  const [historyTracks, setHistoryTracks] = useState<ConvertedTrack[]>([]);

  // Global Spotify-Style Catalog & Pagination State
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState('Semua');
  const [activeTerm, setActiveTerm] = useState('');
  const [searchTab, setSearchTab] = useState<'lagu' | 'artis' | 'album' | 'playlist'>('lagu');
  const initialCatalogCacheRef = useRef<{ tracks: CatalogSong[]; total: number } | null>(null);
  if (!initialCatalogCacheRef.current) {
    initialCatalogCacheRef.current = readCachedCatalogSync();
  }
  const [catalogTracks, setCatalogTracks] = useState<CatalogSong[]>(
    () => initialCatalogCacheRef.current!.tracks
  );
  const [playlistArtistSongs, setPlaylistArtistSongs] = useState<CatalogSong[]>([]);
  const [catalogTotalCount, setCatalogTotalCount] = useState<number>(
    () => initialCatalogCacheRef.current!.total
  );
  const [hasMoreCatalog, setHasMoreCatalog] = useState<boolean>(true);
  const [isSearchingCatalog, setIsSearchingCatalog] = useState<boolean>(
    () => initialCatalogCacheRef.current!.tracks.length === 0
  );
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [resolvingSongId, setResolvingSongId] = useState<string | null>(null);
  const [resolvedYtMap, setResolvedYtMap] = useState<Record<string, string>>({});
  const [resolvedFullMap, setResolvedFullMap] = useState<
    Record<string, { fullAudioUrl?: string; youtubeId?: string; durationMs?: number; sourceUsed?: string }>
  >({});
  const [batchDownloadLabel, setBatchDownloadLabel] = useState<string | null>(null);

  // Sub-pages (Artist, Album, Playlist) + Downloads Menu Modal
  const [selectedArtistName, setSelectedArtistName] = useState<string | null>(null);
  const [selectedAlbumKey, setSelectedAlbumKey] = useState<string | null>(null);
  const [selectedPlaylistId, setSelectedPlaylistId] = useState<string | null>(null);
  const [showDownloadsModal, setShowDownloadsModal] = useState(false);
  const [showDownloadPrefs, setShowDownloadPrefs] = useState(false);
  const [cacheNotice, setCacheNotice] = useState<string | null>(null);

  const linkInputRef = useRef<HTMLInputElement | null>(null);
  const activePlaySessionRef = useRef<number>(0);
  const activeFetchIdRef = useRef<number>(0);
  const loadMoreTriggerRef = useRef<HTMLDivElement | null>(null);

  const historyStorageKey = `ze_music_history_${currentUser.id || 'guest'}`;

  // Load user's music history
  const loadHistory = useCallback(async () => {
    const merged = new Map<string, ConvertedTrack>();

    try {
      const cached = JSON.parse(localStorage.getItem(historyStorageKey) || '[]');
      if (Array.isArray(cached)) {
        cached.forEach((t: ConvertedTrack) => t?.id && merged.set(t.id, t));
      }
    } catch {}

    if (db && currentUser.id) {
      try {
        const snap = await getDocs(
          query(collection(db, 'ze_music_history'), where('userId', '==', currentUser.id))
        );
        snap.docs.forEach((d) => {
          const item = d.data() as ConvertedTrack;
          if (item?.id) merged.set(item.id, item);
        });
      } catch {}
    }

    const res = await safeApiFetch<{ tracks?: ConvertedTrack[] }>(
      `/api/music-history?userId=${encodeURIComponent(currentUser.id)}`,
      { timeoutMs: 4500 }
    );
    if (res.ok && Array.isArray(res.data?.tracks)) {
      res.data.tracks.forEach((t) => t?.id && merged.set(t.id, t));
    }

    const sorted = Array.from(merged.values())
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
      .slice(0, 30);
    setHistoryTracks(sorted);
    try {
      localStorage.setItem(historyStorageKey, JSON.stringify(sorted));
    } catch {}
  }, [currentUser.id, historyStorageKey]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // YouTube fallback query helper via backend when trending pool or search is sparse (zero 30s iTunes previews!)
  const directYouTubeSearchFallback = async (term: string): Promise<CatalogSong[]> => {
    try {
      const cleanTerm = term.trim() || 'Pop Indonesia official audio';
      const res = await safeApiFetch<{
        success?: boolean;
        items?: Array<{
          videoId: string;
          title?: string;
          author?: string;
          thumbnail?: string;
          durationSec?: number;
        }>;
      }>(`/api/music/youtube-search?q=${encodeURIComponent(cleanTerm)}`, { timeoutMs: 15000 });
      const items = Array.isArray(res.data?.items) ? res.data.items : [];
      return items
        .filter((it) => it && it.videoId)
        .map((it) => {
          const durSec = it.durationSec && it.durationSec > 0 ? it.durationSec : 210;
          return {
            id: `yt_${it.videoId}`,
            trackId: it.videoId,
            title: String(it.title || cleanTerm),
            artist: String(it.author || 'YouTube Music'),
            album: 'YouTube Music',
            releaseYear: '',
            genre: '',
            thumbnail: it.thumbnail || `https://i.ytimg.com/vi/${it.videoId}/hqdefault.jpg`,
            previewUrl: '',
            durationMs: durSec * 1000,
            source: 'youtube' as const,
            sourceUrl: `https://www.youtube.com/watch?v=${it.videoId}`,
            youtubeId: it.videoId,
          };
        });
    } catch {
      return [];
    }
  };

  // Load Global Full-Duration YouTube Song Pool automatically
  const loadTrendingSongs = useCallback(async () => {
    const fetchId = ++activeFetchIdRef.current;
    const hasWarmCache = readCachedCatalogSync().tracks.length > 0;
    if (!hasWarmCache) {
      setIsSearchingCatalog(true);
    }
    setActiveTerm('');

    try {
      const res = await safeApiFetch<{
        success?: boolean;
        total?: number;
        hasMore?: boolean;
        tracks?: CatalogSong[];
      }>(`/api/music/trending?offset=0&limit=${INITIAL_BATCH_LIMIT}`, { timeoutMs: 18000 });

      if (activeFetchIdRef.current !== fetchId) return;

      let list = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
      let total = Number(res.data?.total) || Math.max(2000, list.length);
      let hasMore = res.data?.hasMore !== undefined ? Boolean(res.data.hasMore) : true;

      if (list.length === 0) {
        const fb = await directYouTubeSearchFallback('Pop Indonesia hits official audio');
        if (activeFetchIdRef.current !== fetchId) return;
        list = fb;
        total = fb.length;
        hasMore = false;
      }

      if (list.length > 0) {
        setCatalogTracks(list);
        setCatalogTotalCount(total);
        setHasMoreCatalog(hasMore);
        writeCachedCatalogSync(list, total);
      }
    } catch {
      if (activeFetchIdRef.current !== fetchId) return;
      if (!hasWarmCache) {
        const fb = await directYouTubeSearchFallback('Pop Indonesia hits official audio');
        if (activeFetchIdRef.current !== fetchId) return;
        setCatalogTracks(fb);
        setCatalogTotalCount(fb.length);
        setHasMoreCatalog(false);
        writeCachedCatalogSync(fb, fb.length);
      }
    } finally {
      if (activeFetchIdRef.current === fetchId) {
        setIsSearchingCatalog(false);
      }
    }
  }, []);

  useEffect(() => {
    loadTrendingSongs();
  }, [loadTrendingSongs]);

  // Fetch distinct full YouTube artist songs/covers for Daily Mix 1/2/3 & Curated Playlists
  useEffect(() => {
    let cancelled = false;
    safeApiFetch<{ success?: boolean; tracks?: CatalogSong[] }>('/api/music/playlists-seed', {
      timeoutMs: 18000,
    })
      .then((res) => {
        if (cancelled) return;
        const tracks = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
        if (tracks.length > 0) {
          setPlaylistArtistSongs(tracks);
        }
      })
      .catch(() => {});

    return () => {
      cancelled = true;
    };
  }, []);

  // Pre-warm audio streams for top visible songs & Liked Songs from the start (0s tap response!)
  const preResolvedIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (catalogTracks.length > 0) {
      preloadTracksAudio(
        catalogTracks.slice(0, 8).map((s) => ({
          id: s.id,
          title: s.title,
          artist: s.artist,
          author: s.artist,
          thumbnail: s.thumbnail,
          previewUrl: s.previewUrl,
          fullAudioUrl: resolvedFullMap[s.id]?.fullAudioUrl || s.fullAudioUrl,
          audioUrl: resolvedFullMap[s.id]?.fullAudioUrl || s.fullAudioUrl || s.previewUrl,
          source: s.source,
        }))
      );
    }
  }, [catalogTracks, resolvedFullMap, preloadTracksAudio]);

  // Background pre-resolution for Lagu Yang Disukai -> ensure each liked song has a full YouTube ID ready
  useEffect(() => {
    if (likedTracks.length === 0) return;
    let cancelled = false;
    const toResolve = likedTracks
      .slice(0, 8)
      .filter(
        (t) =>
          t.id &&
          !offlineTrackIds.has(t.id) &&
          !t.youtubeId &&
          !resolvedYtMap[t.id] &&
          !preResolvedIdsRef.current.has(t.id)
      );
    if (toResolve.length === 0) return;

    (async () => {
      for (const tr of toResolve) {
        if (cancelled || !tr.id) break;
        preResolvedIdsRef.current.add(tr.id);
        const durTarget = tr.durationMs && tr.durationMs > 0 ? Math.round(tr.durationMs / 1000) : 0;
        try {
          const ytRes = await safeApiFetch<{
            success?: boolean;
            top?: { videoId: string; durationSec?: number };
          }>(
            `/api/music/youtube-search?title=${encodeURIComponent(tr.title)}&artist=${encodeURIComponent(tr.artist || tr.author || '')}&targetDurationSec=${durTarget}`,
            { timeoutMs: 12000 }
          );
          if (cancelled) break;
          const vid = ytRes.data?.top?.videoId;
          if (vid) {
            setResolvedYtMap((prev) => ({ ...prev, [tr.id!]: vid }));
          }
        } catch {}
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [likedTracks, offlineTrackIds, resolvedYtMap]);

  // Real-time Global Music Search (100+ real songs per keyword)
  const runMusicSearch = useCallback(
    async (rawTerm: string) => {
      const term = rawTerm.trim();
      const lower = term.toLowerCase();
      if (!term || lower === 'semua' || lower === 'musik' || lower === 'playlist' || lower === 'artis' || lower === 'album') {
        if (!term || lower === 'semua' || lower === 'musik') {
          loadTrendingSongs();
        }
        return;
      }

      const fetchId = ++activeFetchIdRef.current;
      setIsSearchingCatalog(true);
      setActiveTerm(term);

      try {
        const res = await safeApiFetch<{
          success?: boolean;
          total?: number;
          hasMore?: boolean;
          tracks?: CatalogSong[];
        }>(`/api/music/search?q=${encodeURIComponent(term)}&offset=0&limit=${INITIAL_BATCH_LIMIT}`, {
          timeoutMs: 15000,
        });

        if (activeFetchIdRef.current !== fetchId) return;

        let list = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
        let total = Number(res.data?.total) || list.length;
        let hasMore = Boolean(res.data?.hasMore);

        if (list.length === 0) {
          const fb = await directYouTubeSearchFallback(term);
          if (activeFetchIdRef.current !== fetchId) return;
          list = fb;
          total = fb.length;
          hasMore = false;
        }

        setCatalogTracks(list);
        setCatalogTotalCount(total);
        setHasMoreCatalog(hasMore);
      } catch {
        if (activeFetchIdRef.current !== fetchId) return;
        const fb = await directYouTubeSearchFallback(term);
        if (activeFetchIdRef.current !== fetchId) return;
        setCatalogTracks(fb);
        setCatalogTotalCount(fb.length);
        setHasMoreCatalog(false);
      } finally {
        if (activeFetchIdRef.current === fetchId) {
          setIsSearchingCatalog(false);
        }
      }
    },
    [loadTrendingSongs]
  );

  // Infinite Scroll: load 50 more tracks cleanly from global pool
  const loadMoreCatalogSongs = useCallback(async () => {
    if (isLoadingMore || isSearchingCatalog || !hasMoreCatalog) return;
    const fetchId = activeFetchIdRef.current;
    const nextOffset = catalogTracks.length;
    setIsLoadingMore(true);

    try {
      const endpoint = activeTerm
        ? `/api/music/search?q=${encodeURIComponent(activeTerm)}&offset=${nextOffset}&limit=${SCROLL_BATCH_LIMIT}`
        : `/api/music/trending?offset=${nextOffset}&limit=${SCROLL_BATCH_LIMIT}`;

      const res = await safeApiFetch<{
        success?: boolean;
        total?: number;
        hasMore?: boolean;
        tracks?: CatalogSong[];
      }>(endpoint, { timeoutMs: 14000 });

      if (activeFetchIdRef.current !== fetchId) return;

      const more = Array.isArray(res.data?.tracks) ? res.data.tracks : [];
      if (more.length > 0) {
        setCatalogTracks((prev) => {
          const seen = new Set(prev.map((p) => p.id));
          const merged = [...prev];
          for (const item of more) {
            if (!seen.has(item.id)) {
              seen.add(item.id);
              merged.push(item);
            }
          }
          return merged;
        });
      }
      if (typeof res.data?.total === 'number' && res.data.total > 0) {
        setCatalogTotalCount(res.data.total);
      }
      setHasMoreCatalog(Boolean(res.data?.hasMore) && more.length > 0);
    } catch {
      setHasMoreCatalog(false);
    } finally {
      setIsLoadingMore(false);
    }
  }, [activeTerm, catalogTracks.length, hasMoreCatalog, isLoadingMore, isSearchingCatalog]);

  // Viewport IntersectionObserver for Infinite Scroll down the whole Spotify feed
  useEffect(() => {
    const sentinel = loadMoreTriggerRef.current;
    if (!sentinel || !hasMoreCatalog) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          loadMoreCatalogSongs();
        }
      },
      { rootMargin: '280px', threshold: 0.01 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [hasMoreCatalog, loadMoreCatalogSongs]);

  // Debounced live search
  useEffect(() => {
    if (!searchQuery.trim()) return;
    const t = window.setTimeout(() => {
      runMusicSearch(searchQuery);
    }, 450);
    return () => window.clearTimeout(t);
  }, [searchQuery, runMusicSearch]);

  const persistTrackToHistory = async (track: ConvertedTrack) => {
    const cleanTrack = Object.fromEntries(
      Object.entries(track).filter(([, value]) => value !== undefined)
    ) as ConvertedTrack;

    setHistoryTracks((prev) => {
      const next = [
        cleanTrack,
        ...prev.filter(
          (t) =>
            t.id !== cleanTrack.id &&
            !(t.title === cleanTrack.title && t.author === cleanTrack.author)
        ),
      ].slice(0, 30);
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (db && currentUser.id && cleanTrack.id) {
      try {
        await setDoc(doc(db, 'ze_music_history', cleanTrack.id), {
          ...cleanTrack,
          userId: currentUser.id,
        });
      } catch {}
    }

    safeApiFetch('/api/music-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, track: cleanTrack }),
    }).catch(() => {});
  };

  const resolvedFullMapRef = useRef(resolvedFullMap);
  resolvedFullMapRef.current = resolvedFullMap;
  const resolvedYtMapRef = useRef(resolvedYtMap);
  resolvedYtMapRef.current = resolvedYtMap;
  const offlineTrackIdsRef = useRef(offlineTrackIds);
  offlineTrackIdsRef.current = offlineTrackIds;
  const musicSettingsRef = useRef(musicSettings);
  musicSettingsRef.current = musicSettings;
  const onPlayTrackRef = useRef(onPlayTrack);
  onPlayTrackRef.current = onPlayTrack;
  const poolsMapRef = useRef<Partial<Record<QueuePoolKey, CatalogSong[]>>>({});

  const toCatalogTrackData = useCallback(
    (
      song: CatalogSong,
      mode: 'full' | 'youtube' | 'preview' | 'offline',
      overrides?: Partial<TrackData>
    ): TrackData => {
      const cached = resolvedFullMapRef.current[song.id];
      const fullAudioUrl =
        overrides?.fullAudioUrl || song.fullAudioUrl || cached?.fullAudioUrl || undefined;
      const ytId =
        overrides?.youtubeId || song.youtubeId || cached?.youtubeId || resolvedYtMapRef.current[song.id];
      return {
        id: song.id,
        title: song.title,
        author: song.artist,
        artist: song.artist,
        album: song.album,
        thumbnail: song.thumbnail,
        cover: song.thumbnail,
        fullAudioUrl,
        audioUrl: fullAudioUrl || song.previewUrl,
        previewUrl: song.previewUrl,
        url: fullAudioUrl || song.previewUrl,
        youtubeId: ytId,
        playbackMode: mode,
        isPreviewFallback: mode === 'preview',
        isCatalogSearch: true,
        durationMs: overrides?.durationMs || cached?.durationMs || song.durationMs,
        source: song.source,
        sourceType: song.source,
        sourceUrl: song.sourceUrl,
        isrc: song.isrc,
        releaseYear: song.releaseYear,
        genre: song.genre,
        ...overrides,
      };
    },
    []
  );

  // Instant Full-Duration YouTube / Full-Audio Playback (zero 30s previews!)
  const handleSelectCatalogSong = useCallback(
    (song: CatalogSong, queuePoolOrKey?: CatalogSong[] | QueuePoolKey) => {
      const session = ++activePlaySessionRef.current;
      const resolvedPool =
        typeof queuePoolOrKey === 'string'
          ? poolsMapRef.current[queuePoolOrKey]
          : queuePoolOrKey;
      const pool =
        resolvedPool && resolvedPool.length > 0
          ? resolvedPool
          : poolsMapRef.current.catalog || [];
      const currentOfflineIds = offlineTrackIdsRef.current;
      const queueList = pool.map((s) =>
        toCatalogTrackData(
          s,
          currentOfflineIds.has(s.id)
            ? 'offline'
            : s.youtubeId || s.source === 'youtube'
            ? 'youtube'
            : 'full'
        )
      );
      setPlaylist(queueList);
      setResolvingSongId(null);

      // 1. Offline track already downloaded -> play 100% locally in 0ms!
      if (currentOfflineIds.has(song.id) || musicSettingsRef.current.offlineMode) {
        setYtStatusText('⬇️ Memutar Lagu Offline');
        onPlayTrackRef.current(toCatalogTrackData(song, 'offline'));
        return;
      }

      // 2. Cached full audio stream -> play immediately
      const cachedFull = resolvedFullMapRef.current[song.id];
      const directFull = cachedFull?.fullAudioUrl || song.fullAudioUrl;
      if (directFull) {
        setYtStatusText(`Full Audio Aktif (${cachedFull?.sourceUsed || 'Full'})`);
        onPlayTrackRef.current(
          toCatalogTrackData(song, 'full', {
            fullAudioUrl: directFull,
            audioUrl: directFull,
            youtubeId: cachedFull?.youtubeId || song.youtubeId,
            durationMs: cachedFull?.durationMs || song.durationMs,
            isPreviewFallback: false,
          })
        );
        return;
      }

      // 3. Direct YouTube Full Playback at 0ms (all catalog & search tracks carry youtubeId)
      const ytId = song.youtubeId || resolvedYtMapRef.current[song.id];
      if (ytId) {
        setYtStatusText('YouTube Full Audio');
        const ytTrack = toCatalogTrackData(song, 'youtube', {
          youtubeId: ytId,
          durationMs: song.durationMs,
          isPreviewFallback: false,
          source: 'youtube',
          sourceType: 'youtube',
        });
        onPlayTrackRef.current(ytTrack);
        persistTrackToHistory({
          id: song.id,
          title: song.title,
          author: song.artist,
          thumbnail: song.thumbnail,
          sourceUrl: `https://www.youtube.com/watch?v=${ytId}`,
          sourceType: 'youtube',
          playbackMode: 'youtube',
          youtubeId: ytId,
          isCatalogSearch: true,
          album: song.album,
          durationMs: song.durationMs,
          createdAt: Date.now(),
        });
        return;
      }

      // 4. Legacy track without youtubeId (e.g. old liked song): search top matching YouTube video immediately (never play 30s preview!)
      setYtStatusText('Mencari Full YouTube...');
      void (async () => {
        try {
          const targetSec = song.durationMs > 0 ? Math.round(song.durationMs / 1000) : 0;
          const ytRes = await safeApiFetch<{
            success?: boolean;
            top?: { videoId: string; durationSec?: number; thumbnail?: string };
          }>(
            `/api/music/youtube-search?title=${encodeURIComponent(song.title)}&artist=${encodeURIComponent(song.artist)}&targetDurationSec=${targetSec}`,
            { timeoutMs: 12000 }
          );
          if (activePlaySessionRef.current !== session) return;
          const foundId = ytRes.data?.top?.videoId;
          if (foundId) {
            const finalDurMs =
              ytRes.data?.top?.durationSec && ytRes.data.top.durationSec >= 45
                ? ytRes.data.top.durationSec * 1000
                : song.durationMs;
            const thumb = ytRes.data?.top?.thumbnail || song.thumbnail;
            setResolvedYtMap((prev) => ({ ...prev, [song.id]: foundId }));
            setYtStatusText('YouTube Full Audio');
            onPlayTrackRef.current(
              toCatalogTrackData(song, 'youtube', {
                youtubeId: foundId,
                durationMs: finalDurMs,
                thumbnail: thumb,
                cover: thumb,
                isPreviewFallback: false,
                source: 'youtube',
                sourceType: 'youtube',
              })
            );
            persistTrackToHistory({
              id: song.id,
              title: song.title,
              author: song.artist,
              thumbnail: thumb,
              sourceUrl: `https://www.youtube.com/watch?v=${foundId}`,
              sourceType: 'youtube',
              playbackMode: 'youtube',
              youtubeId: foundId,
              isCatalogSearch: true,
              album: song.album,
              durationMs: finalDurMs,
              createdAt: Date.now(),
            });
          } else {
            setYtStatusText('Lagu YouTube tidak ditemukan');
          }
        } catch {
          setYtStatusText('Gagal mencari lagu YouTube');
        }
      })();
    },
    [setPlaylist, setYtStatusText, toCatalogTrackData]
  );

  // Download all songs inside a Playlist or Album
  const handleDownloadCollection = async (songs: CatalogSong[]) => {
    const toDownload = songs.filter((s) => !offlineTrackIds.has(s.id));
    if (toDownload.length === 0) {
      setBatchDownloadLabel('Semua lagu sudah didownload!');
      setTimeout(() => setBatchDownloadLabel(null), 2500);
      return;
    }
    let doneCount = 0;
    for (const s of toDownload) {
      doneCount += 1;
      setBatchDownloadLabel(`Mendownload ${doneCount}/${toDownload.length}: ${s.title}`);
      const ok = await downloadTrackOffline(toCatalogTrackData(s, 'full'));
      if (!ok) break;
    }
    setBatchDownloadLabel(`Selesai download ${doneCount} lagu offline!`);
    setTimeout(() => setBatchDownloadLabel(null), 3000);
  };

  // Search YouTube / catalog using keywords extracted from failed TikTok URL or title
  const handleSearchYoutubeFallbackFromTiktok = () => {
    const raw = lastFailedTiktokUrl || linkInput || 'viral tiktok';
    const userMatch = raw.match(/@([a-zA-Z0-9._-]+)/);
    const cleaned = userMatch
      ? userMatch[1].replace(/[._]/g, ' ')
      : raw
          .replace(/https?:\/\/[^\s]+/gi, '')
          .trim() || 'Viral TikTok';
    setTiktokError(null);
    setSearchQuery(cleaned);
    setActiveCategory('Semua');
    runMusicSearch(cleaned);
  };

  // Handle direct TikTok / YouTube Link submission (full redirect resolution, proxied stream, clear errors!)
  const handleInspectAndPlay = async (e?: React.FormEvent, overrideUrl?: string) => {
    if (e) e.preventDefault();
    const url = (overrideUrl ?? linkInput).trim();
    if (!url) return;

    ++activePlaySessionRef.current;
    setYtStatusText('');
    setTiktokError(null);
    setIsFetchingInfo(true);

    try {
      if (url.includes('tiktok.com') || url.includes('douyin.com')) {
        const d = await resolveTikTokVideo(url);
        const bestAudio = d.proxiedMusic || d.proxiedPlay || d.music || d.music_info?.play || d.play || '';
        const bestVideo = d.proxiedPlay || d.play || d.hdplay || '';
        const durMs =
          d.duration && d.duration > 0
            ? d.duration * 1000
            : d.music_info?.duration && d.music_info.duration > 0
            ? d.music_info.duration * 1000
            : undefined;

        if (!bestAudio && !bestVideo) {
          throw new Error(
            'Link TikTok tidak bisa diputar, video di-private / tidak ada suara / link salah. Coba link lain.'
          );
        }

        const trackData: TrackData = {
          id: 'tt_' + Date.now(),
          title: d.title || 'TikTok Video',
          author: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
          artist: d.author?.nickname || d.author?.unique_id || 'TikTok Creator',
          thumbnail: d.cover || '',
          cover: d.cover || '',
          videoUrl: bestVideo,
          audioUrl: bestAudio,
          fullAudioUrl: bestAudio,
          url: bestVideo || url,
          durationMs: durMs,
          playbackMode: 'full',
          isPreviewFallback: false,
          source: 'tiktok',
          sourceType: 'tiktok',
          sourceUrl: d.resolvedUrl || url,
          isCatalogSearch: false,
        };

        // TikTok playback strictly stays single-track: zero queue auto-append!
        setPlaylist([trackData]);

        onPlayTrack(trackData);
        await persistTrackToHistory({
          id: trackData.id!,
          title: trackData.title,
          author: trackData.author || 'TikTok Creator',
          thumbnail: trackData.thumbnail || '',
          sourceUrl: url,
          sourceType: 'tiktok',
          videoUrl: trackData.videoUrl,
          audioUrl: trackData.audioUrl,
          durationMs: durMs,
          playbackMode: 'full',
          isCatalogSearch: false,
          createdAt: Date.now(),
        });

        setLinkInput('');
        setLastFailedTiktokUrl('');
        setIsFetchingInfo(false);
        return;
      }

      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        let title = 'YouTube Video';
        let author = 'YouTube Creator';
        let thumbnail = '';

        const match = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([^&?#/]+)/i);
        const ytid = match ? match[1] : '';
        if (ytid) {
          thumbnail = `https://img.youtube.com/vi/${ytid}/hqdefault.jpg`;
        }

        try {
          const res = await fetch(`https://noembed.com/embed?url=${encodeURIComponent(url)}`);
          if (res.ok) {
            const data = await res.json();
            if (data.title) title = data.title;
            if (data.author_name) author = data.author_name;
          }
        } catch {}

        const ytTrack: TrackData = {
          id: 'yt_' + Date.now(),
          title,
          author,
          artist: author,
          thumbnail,
          url,
          youtubeId: ytid || undefined,
          playbackMode: ytid ? 'youtube' : undefined,
          videoUrl: undefined,
          source: 'youtube',
          sourceType: 'youtube',
          sourceUrl: url,
          isCatalogSearch: false,
        };

        onPlayTrack(ytTrack);
        await persistTrackToHistory({
          id: ytTrack.id!,
          title,
          author,
          thumbnail,
          sourceUrl: url,
          sourceType: 'youtube',
          ...(ytid ? { youtubeId: ytid } : {}),
          isCatalogSearch: false,
          createdAt: Date.now(),
        });

        setLinkInput('');
        setIsFetchingInfo(false);
        return;
      }

      const fallbackTrack: TrackData = {
        id: 'web_' + Date.now(),
        title: 'Tautan Musik Web',
        author: 'Web Audio',
        artist: 'Web Audio',
        thumbnail: '',
        url,
        audioUrl: url,
        fullAudioUrl: url,
        playbackMode: 'full',
        videoUrl: undefined,
        source: 'web',
        sourceType: 'web',
        sourceUrl: url,
        isCatalogSearch: false,
      };

      onPlayTrack(fallbackTrack);
      await persistTrackToHistory({
        id: fallbackTrack.id!,
        title: fallbackTrack.title,
        author: 'Web Audio',
        thumbnail: '',
        sourceUrl: url,
        sourceType: 'web',
        audioUrl: url,
        isCatalogSearch: false,
        createdAt: Date.now(),
      });
      setLinkInput('');
    } catch (err: any) {
      setLastFailedTiktokUrl(url);
      setTiktokError(
        err?.message ||
          'Link TikTok tidak bisa diputar, video di-private / tidak ada suara / link salah. Coba link lain.'
      );
    } finally {
      setIsFetchingInfo(false);
    }
  };

  // Auto-paste clipboard into linkInput if empty when tapping Paste area or Putar button
  const handleQuickPasteFromClipboard = async (triggerPlayIfFound = false) => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.readText) {
        const clip = (await navigator.clipboard.readText()).trim();
        if (clip && /^https?:\/\//i.test(clip)) {
          setLinkInput(clip);
          if (triggerPlayIfFound) {
            await handleInspectAndPlay(undefined, clip);
          }
          return true;
        }
      }
    } catch {}
    return false;
  };

  const handleDeleteHistoryItem = async (e: React.MouseEvent, trackId: string) => {
    e.stopPropagation();
    setHistoryTracks((prev) => {
      const next = prev.filter((t) => t.id !== trackId);
      try {
        localStorage.setItem(historyStorageKey, JSON.stringify(next));
      } catch {}
      return next;
    });
    if (db) {
      deleteDoc(doc(db, 'ze_music_history', trackId)).catch(() => {});
    }
    safeApiFetch(
      `/api/music-history?userId=${encodeURIComponent(currentUser.id)}&trackId=${encodeURIComponent(trackId)}`,
      { method: 'DELETE' }
    ).catch(() => {});
  };

  const formatTime = (seconds: number) => {
    const clean = Math.max(0, Math.floor(seconds || 0));
    const m = Math.floor(clean / 60);
    const s = Math.floor(clean % 60);
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // Derive Artists & Albums dynamically from loaded Global Catalog
  const { artistsList, albumsList, trendingCarousel, viralCarousel } = useMemo(() => {
    const artistMap = new Map<string, ArtistBucket>();
    const albumMap = new Map<string, AlbumBucket>();

    for (const song of catalogTracks) {
      const primaryArtist = song.artist.split(/[,&]|feat\.|ft\./i)[0].trim() || song.artist;
      if (!artistMap.has(primaryArtist.toLowerCase())) {
        artistMap.set(primaryArtist.toLowerCase(), {
          name: primaryArtist,
          photo: song.thumbnail,
          songs: [],
          albums: [],
        });
      }
      const ab = artistMap.get(primaryArtist.toLowerCase())!;
      if (!ab.photo && song.thumbnail) ab.photo = song.thumbnail;
      ab.songs.push(song);

      const cleanAlbum = (song.album || '').trim();
      if (cleanAlbum && cleanAlbum.toLowerCase() !== 'single') {
        const aKey = `${cleanAlbum.toLowerCase()}__${primaryArtist.toLowerCase()}`;
        if (!albumMap.has(aKey)) {
          albumMap.set(aKey, {
            key: aKey,
            title: cleanAlbum,
            artist: primaryArtist,
            year: song.releaseYear || '2024',
            cover: song.thumbnail,
            songs: [],
          });
        }
        const alb = albumMap.get(aKey)!;
        if (!alb.cover && song.thumbnail) alb.cover = song.thumbnail;
        alb.songs.push(song);
      }
    }

    const artists = Array.from(artistMap.values()).slice(0, 40);
    const albums = Array.from(albumMap.values()).slice(0, 40);
    for (const a of artists) {
      a.albums = albums.filter((alb) => alb.artist.toLowerCase() === a.name.toLowerCase());
    }

    const trending = catalogTracks.slice(0, 50);
    const viralPool = catalogTracks.filter((s) =>
      /viral|tiktok|koplo|remix|dj|bernadya|hindia|taylor|billie|bts|blackpink|mahalini/i.test(
        `${s.title} ${s.artist} ${s.genre || ''}`
      )
    );
    const viral = (viralPool.length >= 25 ? viralPool : catalogTracks.slice().reverse()).slice(0, 50);

    return {
      artistsList: artists,
      albumsList: albums,
      trendingCarousel: trending,
      viralCarousel: viral,
    };
  }, [catalogTracks]);

  // Combined unique track pool for curated playlists (artist-specific searches + main catalog)
  const combinedPlaylistPool = useMemo(() => {
    const seen = new Set<string>();
    const out: CatalogSong[] = [];
    for (const s of [...playlistArtistSongs, ...catalogTracks]) {
      if (!s?.id || seen.has(s.id)) continue;
      seen.add(s.id);
      out.push(s);
    }
    return out;
  }, [playlistArtistSongs, catalogTracks]);

  // Helper to resolve curated playlist songs (NEVER shares fallback across unrelated cards)
  const getPlaylistSongs = useCallback(
    (def: CuratedPlaylistDef): CatalogSong[] => {
      if (def.isLikedCollection) {
        return likedTracks.map((t, i) => ({
          id: t.id || `liked_${i}`,
          title: t.title,
          artist: t.artist || t.author || 'Artis',
          album: t.album || 'Lagu Disukai',
          thumbnail: t.thumbnail || t.cover || '',
          previewUrl: t.previewUrl || t.audioUrl || t.url || '',
          fullAudioUrl: t.fullAudioUrl || resolvedFullMap[t.id || '']?.fullAudioUrl,
          durationMs: t.durationMs || 0,
          source: (['youtube', 'deezer', 'jamendo', 'soundcloud', 'audius', 'offline'].includes(t.source)
            ? t.source
            : 'youtube') as CatalogSong['source'],
          sourceUrl: t.sourceUrl || '',
          youtubeId: t.youtubeId,
        }));
      }
      const matches = combinedPlaylistPool.filter((s) => {
        const hay = `${s.title} ${s.artist} ${s.album} ${s.genre || ''}`.toLowerCase();
        return def.keywords.some((kw) => hay.includes(kw));
      });
      return matches.slice(0, 50);
    },
    [combinedPlaylistPool, likedTracks, resolvedFullMap]
  );

  // Convert IndexedDB Offline Meta list into CatalogSong[] for Offline Mode feed
  const offlineCatalogSongs = useMemo<CatalogSong[]>(() => {
    return offlineTracks.map((o) => ({
      id: o.id,
      title: o.title,
      artist: o.artist,
      album: o.album || 'Offline',
      thumbnail: o.thumbnail,
      previewUrl: '',
      durationMs: (o.durationSec || 180) * 1000,
      source: 'offline',
      sourceUrl: '',
      youtubeId: o.youtubeId,
    }));
  }, [offlineTracks]);

  const allPlaylists = useMemo(
    () => [...MADE_FOR_YOU_PLAYLISTS, ...CURATED_FOR_YOU_PLAYLISTS],
    []
  );

  const userPhoto = currentUser?.photo || currentUser?.avatar || '';
  const displayUserName = (currentUser?.name || currentUser?.username || 'Teman').trim();
  const userInitial = displayUserName.charAt(0).toUpperCase() || 'V';
  const displayTotalSongs = musicSettings.offlineMode
    ? offlineCatalogSongs.length
    : Math.max(catalogTotalCount, catalogTracks.length);

  // Active Sub-pages Resolution
  const activePlaylistDef = selectedPlaylistId
    ? allPlaylists.find((p) => p.id === selectedPlaylistId) || null
    : null;
  const activeArtistObj = selectedArtistName
    ? artistsList.find((a) => a.name.toLowerCase() === selectedArtistName.toLowerCase()) || {
        name: selectedArtistName,
        photo:
          catalogTracks.find((s) =>
            s.artist.toLowerCase().includes(selectedArtistName.toLowerCase())
          )?.thumbnail || '',
        songs: catalogTracks.filter((s) =>
          s.artist.toLowerCase().includes(selectedArtistName.toLowerCase())
        ),
        albums: albumsList.filter((al) =>
          al.artist.toLowerCase().includes(selectedArtistName.toLowerCase())
        ),
      }
    : null;
  const activeAlbumObj = selectedAlbumKey
    ? albumsList.find((a) => a.key === selectedAlbumKey) || null
    : null;

  const activePlaylistSongs = useMemo(
    () => (activePlaylistDef ? getPlaylistSongs(activePlaylistDef) : []),
    [activePlaylistDef, getPlaylistSongs]
  );

  poolsMapRef.current = {
    catalog: catalogTracks,
    trending: trendingCarousel,
    viral: viralCarousel,
    offline: offlineCatalogSongs,
    playlist: activePlaylistSongs,
    artist: activeArtistObj?.songs || [],
    album: activeAlbumObj?.songs || [],
  };

  // Render Reusable Compact Spotify Track Row (48x48 cover, 14px title, 12px artist, 8px pad, 32px btns)
  const handleDownloadClick = useCallback(
    (song: CatalogSong, isDownloaded: boolean) => {
      if (isDownloaded) {
        removeOfflineTrack(song.id);
      } else {
        downloadTrackOffline(toCatalogTrackData(song, 'full'));
      }
    },
    [downloadTrackOffline, removeOfflineTrack, toCatalogTrackData]
  );

  const handleArtistClick = useCallback((artistName: string) => {
    setSelectedArtistName(artistName);
  }, []);

  const handleToggleLikeSong = useCallback(
    (song: CatalogSong) => {
      toggleLikeTrack(toCatalogTrackData(song, 'full'));
    },
    [toCatalogTrackData, toggleLikeTrack]
  );

  const renderSpotifyTrackRow = (song: CatalogSong, idx: number, poolKey?: QueuePoolKey) => {
    const isSelected = currentTrack?.id === song.id;
    const isResolving = resolvingSongId === song.id;
    const liked = isTrackLiked(song.id);
    const isDownloaded = offlineTrackIds.has(song.id);
    const dlProg = downloadProgressMap[song.id];

    return (
      <MemoSpotifyTrackRow
        key={song.id}
        song={song}
        idx={idx}
        poolKey={poolKey}
        isSelected={isSelected}
        isPlaying={isSelected && isPlaying}
        isResolving={isResolving}
        isLiked={liked}
        isDownloaded={isDownloaded}
        dlProg={dlProg}
        onSelectSong={handleSelectCatalogSong}
        onTogglePlay={onTogglePlay}
        onArtistClick={handleArtistClick}
        onDownloadClick={handleDownloadClick}
        onToggleLike={handleToggleLikeSong}
      />
    );
  };

  // Helper to pick distinct real cover photos matched to a playlist's artists (NO shared catalog fallback!)
  const getDistinctCollageCovers = useCallback(
    (songs: CatalogSong[], priorityKeywords?: string[]): CatalogSong[] => {
      const picked: CatalogSong[] = [];
      const seenThumbs = new Set<string>();
      const addSong = (s?: CatalogSong) => {
        if (!s?.thumbnail) return;
        const norm = s.thumbnail.trim();
        if (!norm || seenThumbs.has(norm)) return;
        seenThumbs.add(norm);
        picked.push(s);
      };

      if (priorityKeywords && priorityKeywords.length > 0) {
        for (const kw of priorityKeywords) {
          if (picked.length >= 4) break;
          const match = songs.find((s) => {
            if (!s?.thumbnail || seenThumbs.has(s.thumbnail.trim())) return false;
            const hay = `${s.artist} ${s.title}`.toLowerCase();
            return hay.includes(kw.toLowerCase());
          });
          addSong(match);
        }
      }

      for (const s of songs) {
        if (picked.length >= 4) break;
        addSong(s);
      }
      return picked.slice(0, 4);
    },
    []
  );

  const playlistCollages = useMemo(() => {
    const map: Record<string, CatalogSong[]> = {};
    for (const pl of allPlaylists) {
      if (pl.isLikedCollection || pl.customCoverSrc) {
        map[pl.id] = [];
      } else {
        const plSongs = getPlaylistSongs(pl);
        map[pl.id] = getDistinctCollageCovers(plSongs, pl.artistPriorityKeywords);
      }
    }
    return map;
  }, [allPlaylists, getPlaylistSongs, getDistinctCollageCovers]);

  // Render Compact Playlist Card (height 88px <= 120px, 14px title)
  const renderPlaylistCard = (pl: CuratedPlaylistDef) => {
    return (
      <MemoPlaylistCard
        key={pl.id}
        pl={pl}
        collage={playlistCollages[pl.id] || []}
        onOpen={setSelectedPlaylistId}
      />
    );
  };

  // Render Compact Horizontal Song Card (height 116px <= 120px, 32px play button)
  const renderHorizontalSongCard = (song: CatalogSong, poolKey: QueuePoolKey) => {
    const isSelected = currentTrack?.id === song.id;
    return (
      <MemoHorizontalSongCard
        key={song.id}
        song={song}
        poolKey={poolKey}
        isSelected={isSelected}
        isPlaying={isSelected && isPlaying}
        onSelectSong={handleSelectCatalogSong}
        onTogglePlay={onTogglePlay}
      />
    );
  };

  // ========================
  // SUB-VIEW 1: PLAYLIST PAGE
  // ========================
  if (activePlaylistDef) {
    const plSongs = getPlaylistSongs(activePlaylistDef);
    const collage =
      activePlaylistDef.isLikedCollection || activePlaylistDef.customCoverSrc
        ? []
        : getDistinctCollageCovers(plSongs, activePlaylistDef.artistPriorityKeywords);
    return (
      <div className="ze-music-page min-h-screen w-full m-0 bg-[#0A0A0A] text-white pb-[150px] select-none">
        <div className="bg-[#0A0A0A] border-b border-white/10 px-3 pt-3 pb-3 max-h-[120px] flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => setSelectedPlaylistId(null)}
            className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Kembali"
          >
            <ChevronLeft size={18} />
          </button>

          <div
            className={`w-16 h-16 rounded-lg overflow-hidden bg-[#1C1C1C] shrink-0 grid ${
              !activePlaylistDef.isLikedCollection &&
              !activePlaylistDef.customCoverSrc &&
              collage.length >= 4
                ? 'grid-cols-2 grid-rows-2'
                : 'grid-cols-1 grid-rows-1'
            }`}
          >
            {activePlaylistDef.isLikedCollection ? (
              <div className="flex items-center justify-center w-full h-full bg-[#242424]">
                <Heart size={24} className="text-[#1DB954] fill-[#1DB954]" />
              </div>
            ) : activePlaylistDef.customCoverSrc ? (
              <img
                src={activePlaylistDef.customCoverSrc}
                alt={activePlaylistDef.title}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
            ) : collage.length >= 4 ? (
              collage.map((c, idx) => (
                <MusicCoverImg
                  key={`${c.id}_${idx}`}
                  src={c.thumbnail}
                  alt={c.title || activePlaylistDef.title}
                  iconSize={14}
                  loading="eager"
                />
              ))
            ) : collage[0]?.thumbnail ? (
              <MusicCoverImg
                src={collage[0].thumbnail}
                alt={activePlaylistDef.title}
                iconSize={24}
                loading="eager"
              />
            ) : (
              <div
                className="flex items-center justify-center w-full h-full"
                style={{ background: activePlaylistDef.fallbackGradient }}
              >
                <Music size={24} className="text-white/85" strokeWidth={2} />
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">PLAYLIST · {plSongs.length} lagu</p>
            <h1 className="text-[18px] font-bold text-white truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {activePlaylistDef.title}
            </h1>
            <p className="text-[11px] text-[#A1A1AA] truncate">{activePlaylistDef.subtitle}</p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {plSongs.length > 0 && (
              <button
                type="button"
                onClick={() => handleDownloadCollection(plSongs)}
                className="w-8 h-8 rounded-full bg-[#1C1C1C] text-[#1DB954] flex items-center justify-center cursor-pointer"
                title="Download Semua"
              >
                <Download size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() => plSongs[0] && handleSelectCatalogSong(plSongs[0], plSongs)}
              className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Putar Playlist"
            >
              <Play size={18} className="fill-black ml-0.5" />
            </button>
          </div>
        </div>
        {batchDownloadLabel && (
          <p className="px-3 pt-2 text-[11px] font-bold text-[#1DB954]">{batchDownloadLabel}</p>
        )}

        <div className="w-full m-0 px-3 pt-2 space-y-2">
          {plSongs.length === 0 ? (
            <div className="p-6 text-center text-[13px] text-[#A1A1AA] bg-[#141414] rounded-lg">
              Belum ada lagu di playlist ini. Klik ikon hati pada lagu untuk menyimpannya.
            </div>
          ) : (
            plSongs.map((song, idx) => renderSpotifyTrackRow(song, idx, 'playlist'))
          )}
        </div>
      </div>
    );
  }

  // ========================
  // SUB-VIEW 2: ARTIST PAGE
  // ========================
  if (activeArtistObj) {
    return (
      <div className="ze-music-page min-h-screen w-full m-0 bg-[#0A0A0A] text-white pb-[150px] select-none">
        <div className="bg-[#0A0A0A] border-b border-white/10 px-3 pt-3 pb-3 max-h-[120px] flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => setSelectedArtistName(null)}
            className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Kembali"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="w-16 h-16 rounded-full overflow-hidden bg-[#1C1C1C] shrink-0">
            <MusicCoverImg src={activeArtistObj.photo} alt={activeArtistObj.name} iconSize={24} loading="eager" />
          </div>

          <div className="min-w-0 flex-1">
            <div className="inline-flex items-center gap-1 text-[10px] font-bold text-sky-400">
              <CheckCircle2 size={12} />
              <span>Artis Terverifikasi</span>
            </div>
            <h1 className="text-[18px] font-bold text-white truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {activeArtistObj.name}
            </h1>
            <p className="text-[11px] text-[#A1A1AA] tabular-nums">
              {activeArtistObj.songs.length} lagu tersedia
            </p>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                const list = activeArtistObj.songs;
                if (list.length > 0) {
                  const rnd = list[Math.floor(Math.random() * list.length)];
                  handleSelectCatalogSong(rnd, list);
                }
              }}
              className="w-8 h-8 rounded-full bg-[#1C1C1C] text-[#1DB954] flex items-center justify-center cursor-pointer"
              aria-label="Acak Lagu Artis"
            >
              <Shuffle size={15} />
            </button>
            <button
              type="button"
              onClick={() =>
                activeArtistObj.songs[0] &&
                handleSelectCatalogSong(activeArtistObj.songs[0], activeArtistObj.songs)
              }
              className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer"
              aria-label="Putar Lagu Artis"
            >
              <Play size={18} className="fill-black ml-0.5" />
            </button>
          </div>
        </div>

        <div className="w-full m-0 px-3 pt-3 space-y-4">
          <section>
            <h2 className="text-[16px] font-bold text-white mb-2">Populer</h2>
            <div className="space-y-2">
              {activeArtistObj.songs.map((song, idx) =>
                renderSpotifyTrackRow(song, idx, 'artist')
              )}
            </div>
          </section>

          {activeArtistObj.albums.length > 0 && (
            <section>
              <h2 className="text-[16px] font-bold text-white mb-2">Diskografi Album</h2>
              <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                {activeArtistObj.albums.map((alb) => (
                  <button
                    key={alb.key}
                    type="button"
                    onClick={() => {
                      setSelectedArtistName(null);
                      setSelectedAlbumKey(alb.key);
                    }}
                    className="ze-music-card-surface w-[132px] h-[112px] shrink-0 bg-[#141414] rounded-lg p-2 text-left flex flex-col justify-between cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1C1C1C]">
                      <MusicCoverImg src={alb.cover} alt={alb.title} iconSize={18} loading="lazy" />
                    </div>
                    <div>
                      <p className="text-[13px] font-bold text-white truncate">{alb.title}</p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        {alb.year} · {alb.songs.length} lagu
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    );
  }

  // ========================
  // SUB-VIEW 3: ALBUM PAGE
  // ========================
  if (activeAlbumObj) {
    return (
      <div className="ze-music-page min-h-screen w-full m-0 bg-[#0A0A0A] text-white pb-[150px] select-none">
        <div className="bg-[#0A0A0A] border-b border-white/10 px-3 pt-3 pb-3 max-h-[120px] flex items-center justify-between gap-2.5">
          <button
            type="button"
            onClick={() => setSelectedAlbumKey(null)}
            className="w-8 h-8 rounded-full bg-[#1A1A1A] flex items-center justify-center cursor-pointer shrink-0"
            aria-label="Kembali"
          >
            <ChevronLeft size={18} />
          </button>

          <div className="w-16 h-16 rounded-lg overflow-hidden bg-[#1C1C1C] shrink-0">
            <MusicCoverImg src={activeAlbumObj.cover} alt={activeAlbumObj.title} iconSize={24} loading="eager" />
          </div>

          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#A1A1AA]">
              ALBUM · {activeAlbumObj.year} · {activeAlbumObj.songs.length} lagu
            </p>
            <h1 className="text-[18px] font-bold text-white truncate" style={{ fontFamily: "'Poppins', sans-serif" }}>
              {activeAlbumObj.title}
            </h1>
            <button
              type="button"
              onClick={() => {
                setSelectedAlbumKey(null);
                setSelectedArtistName(activeAlbumObj.artist);
              }}
              className="text-[12px] font-bold text-[#A1A1AA] hover:text-white truncate cursor-pointer"
            >
              {activeAlbumObj.artist}
            </button>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {activeAlbumObj.songs.length > 0 && (
              <button
                type="button"
                onClick={() => handleDownloadCollection(activeAlbumObj.songs)}
                className="w-8 h-8 rounded-full bg-[#1C1C1C] text-[#1DB954] flex items-center justify-center cursor-pointer"
                title="Download Semua"
              >
                <Download size={15} />
              </button>
            )}
            <button
              type="button"
              onClick={() =>
                activeAlbumObj.songs[0] &&
                handleSelectCatalogSong(activeAlbumObj.songs[0], activeAlbumObj.songs)
              }
              className="w-10 h-10 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer shrink-0"
              aria-label="Putar Album"
            >
              <Play size={18} className="fill-black ml-0.5" />
            </button>
          </div>
        </div>
        {batchDownloadLabel && (
          <p className="px-3 pt-2 text-[11px] font-bold text-[#1DB954]">{batchDownloadLabel}</p>
        )}

        <div className="w-full m-0 px-3 pt-2 space-y-2">
          {activeAlbumObj.songs.map((song, idx) =>
            renderSpotifyTrackRow(song, idx, 'album')
          )}
        </div>
      </div>
    );
  }

  // ========================
  // MAIN COMPACT #0A0A0A MUSIC HOME (60 FPS, FULL EDGE-TO-EDGE)
  // ========================
  const isSearchMode = Boolean(activeTerm || searchQuery.trim());
  const chipLower = activeCategory.toLowerCase();

  return (
    <div className="ze-music-page min-h-screen w-full m-0 bg-[#0A0A0A] text-white pb-[150px] select-none">
      {/* 1. COMPACT HEADER (18px Poppins Bold, #0A0A0A edge-to-edge) */}
      <header className="bg-[#0A0A0A] px-3 pt-2.5 pb-2 w-full m-0">
        <div className="w-full flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#1A1A1A] border border-white/10 overflow-hidden flex items-center justify-center shrink-0">
              {userPhoto ? (
                <img
                  src={userPhoto}
                  alt={displayUserName}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
              ) : (
                <span className="text-[12px] font-bold text-white">{userInitial}</span>
              )}
            </div>
            <h1
              className="text-[18px] font-bold tracking-tight text-white truncate"
              style={{ fontFamily: "'Poppins', sans-serif" }}
            >
              Musik · {displayUserName}
            </h1>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setShowDownloadsModal(true)}
              className="w-8 h-8 rounded-full bg-[#1A1A1A] text-[#1DB954] flex items-center justify-center cursor-pointer"
              title="Unduhan Offline"
              aria-label="Unduhan Offline"
            >
              <Download size={16} />
            </button>
            {currentTrack && (
              <button
                type="button"
                onClick={() => setIsFullPlayerOpen(true)}
                className="h-8 px-2.5 rounded-full bg-[#1DB954] text-black text-[12px] font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
                title="Buka Full Player"
              >
                <Maximize2 size={13} />
                <span className="hidden sm:inline">Player</span>
              </button>
            )}
          </div>
        </div>
      </header>

      <div className="w-full m-0 px-3 space-y-3">
        {/* 2. COMPACT SEARCH BAR (height 44px, font 14px, icon 20px) */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (searchQuery.trim()) {
              setActiveCategory(searchQuery.trim());
              runMusicSearch(searchQuery);
            } else {
              loadTrendingSongs();
            }
          }}
          className="flex items-center gap-2"
        >
          <div className="flex-1 bg-[#1A1A1A] rounded-full px-3 h-[44px] flex items-center gap-2 border border-white/10 focus-within:border-white/40 min-w-0">
            <Search size={20} className="text-white/75 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                const val = e.target.value;
                setSearchQuery(val);
                if (!val.trim()) {
                  setActiveCategory('Semua');
                  loadTrendingSongs();
                }
              }}
              placeholder="Cari lagu, artis, album..."
              className="bg-transparent flex-1 text-[14px] text-white placeholder-[#8E8E93] outline-none min-w-0"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setActiveCategory('Semua');
                  loadTrendingSongs();
                }}
                className="w-8 h-8 flex items-center justify-center text-[#A1A1AA] hover:text-white cursor-pointer"
                aria-label="Hapus pencarian"
              >
                <X size={16} />
              </button>
            )}
          </div>
          <button
            type="submit"
            className="h-[44px] px-4 rounded-full bg-white text-black font-bold text-[14px] cursor-pointer shrink-0 whitespace-nowrap"
          >
            Cari
          </button>
        </form>

        {/* 3. CATEGORY CHIPS (compact 32px height) */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
          {CATEGORY_CHIPS.map((tag) => {
            const isActive = activeCategory.toLowerCase() === tag.toLowerCase();
            return (
              <button
                key={tag}
                type="button"
                onClick={() => {
                  setActiveCategory(tag);
                  if (tag === 'Semua' || tag === 'Musik') {
                    setSearchQuery('');
                    loadTrendingSongs();
                  } else if (tag === 'Playlist' || tag === 'Artis' || tag === 'Album') {
                    setSearchQuery('');
                    if (catalogTracks.length === 0) loadTrendingSongs();
                  } else {
                    setSearchQuery(tag);
                    runMusicSearch(tag);
                  }
                }}
                className={`h-8 px-3 rounded-full text-[12px] font-bold whitespace-nowrap shrink-0 cursor-pointer flex items-center ${
                  isActive
                    ? 'bg-[#1DB954] text-black'
                    : 'bg-[#1A1A1A] text-white hover:bg-[#242424]'
                }`}
              >
                {tag}
              </button>
            );
          })}
        </div>

        {/* 4. COMPACT TIKTOK LINK BAR (height 44px, font 14px, icon 20px) */}
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            if (isFetchingInfo) return;
            if (!linkInput.trim()) {
              const pasted = await handleQuickPasteFromClipboard(true);
              if (!pasted) {
                linkInputRef.current?.focus();
              }
              return;
            }
            await handleInspectAndPlay(undefined, linkInput);
          }}
          className="h-[44px] box-border rounded-full bg-[#161616] border border-white/10 pl-3 pr-1.5 flex items-center gap-2"
        >
          <div
            onClick={() => {
              if (!linkInput.trim()) {
                void handleQuickPasteFromClipboard(false);
              }
              linkInputRef.current?.focus();
            }}
            className="flex-1 min-w-0 bg-transparent flex items-center gap-2 cursor-text"
          >
            <LinkIcon size={20} className="text-[#1DB954] shrink-0" />
            <input
              ref={linkInputRef}
              type="text"
              placeholder="Paste link TikTok..."
              value={linkInput}
              onChange={(e) => setLinkInput(e.target.value)}
              className="bg-transparent flex-1 text-[14px] font-medium text-white placeholder-[#8E8E93] outline-none min-w-0"
            />
          </div>
          <button
            type="submit"
            disabled={isFetchingInfo}
            className={`h-8 px-3 rounded-full bg-[#1DB954] text-black font-bold text-[13px] cursor-pointer shrink-0 flex items-center justify-center gap-1 whitespace-nowrap ${
              linkInput.trim() ? 'opacity-100' : 'opacity-70'
            }`}
          >
            {isFetchingInfo ? (
              <>
                <Loader2 size={15} className="animate-spin text-black shrink-0" />
                <span>Memuat</span>
              </>
            ) : (
              <>
                <Play size={15} className="text-black fill-black shrink-0" />
                <span>Putar</span>
              </>
            )}
          </button>
        </form>

        {/* TikTok Error UI with Retry + Search YouTube by Title */}
        {tiktokError && (
          <div className="bg-red-500/15 border border-red-500/40 rounded-lg p-2.5 space-y-2">
            <div className="flex items-start gap-2 text-[12px] font-bold text-red-200">
              <AlertTriangle size={15} className="text-red-400 shrink-0 mt-0.5" />
              <span>{tiktokError}</span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => handleInspectAndPlay(undefined, lastFailedTiktokUrl || linkInput)}
                className="px-3 py-1 rounded-full bg-white text-black text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <RefreshCw size={12} />
                <span>Coba Lagi</span>
              </button>
              <button
                type="button"
                onClick={handleSearchYoutubeFallbackFromTiktok}
                className="px-3 py-1 rounded-full bg-[#1DB954] text-black text-[11px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Search size={12} />
                <span>Cari di YouTube</span>
              </button>
              <button
                type="button"
                onClick={() => setTiktokError(null)}
                className="ml-auto text-[11px] text-red-200/80 hover:text-white px-2 py-1 cursor-pointer"
              >
                Tutup
              </button>
            </div>
          </div>
        )}

        {/* Download Notice */}
        {downloadNotice && (
          <div className="bg-amber-500/15 border border-amber-500/40 rounded-lg px-3 py-2 flex items-center justify-between gap-2 text-[12px] text-amber-200">
            <span>{downloadNotice}</span>
            <button
              type="button"
              onClick={() => setDownloadNotice(null)}
              className="text-amber-200 hover:text-white cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {/* OFFLINE MODE ONLY VIEW */}
        {musicSettings.offlineMode && (
          <div className="bg-[#121212] border border-[#1DB954]/30 rounded-xl p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <WifiOff size={16} className="text-[#1DB954] shrink-0" />
                <div className="min-w-0">
                  <h2 className="text-[14px] font-bold text-white truncate">
                    Mode Offline ({offlineCatalogSongs.length} lagu)
                  </h2>
                  <p className="text-[11px] text-[#A1A1AA] truncate">
                    Hanya lagu terdownload · tanpa internet
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => updateMusicSettings({ offlineMode: false })}
                className="px-2.5 py-1 rounded-full bg-[#1C1C1C] text-[11px] font-bold text-white cursor-pointer shrink-0"
              >
                Online
              </button>
            </div>

            {offlineCatalogSongs.length === 0 ? (
              <div className="p-4 text-center text-[12px] text-[#A1A1AA] bg-[#0A0A0A] rounded-lg">
                Belum ada lagu didownload. Matikan Mode Offline untuk mendownload lagu.
              </div>
            ) : (
              <div className="space-y-2">
                {offlineCatalogSongs.map((song, idx) =>
                  renderSpotifyTrackRow(song, idx, 'offline')
                )}
              </div>
            )}
          </div>
        )}

        {/* 5. SEARCH TABS (Lagu / Artis / Album / Playlist) */}
        {!musicSettings.offlineMode && isSearchMode && (
          <div className="space-y-2.5">
            <div className="flex items-center gap-1.5 border-b border-white/10 pb-2 overflow-x-auto no-scrollbar">
              {SEARCH_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSearchTab(t.id)}
                  className={`px-3 py-1 rounded-full text-[12px] font-bold whitespace-nowrap cursor-pointer ${
                    searchTab === t.id
                      ? 'bg-white text-black'
                      : 'bg-[#1A1A1A] text-[#A1A1AA] hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
              <span className="ml-auto text-[11px] font-semibold text-[#A1A1AA] tabular-nums whitespace-nowrap">
                {displayTotalSongs.toLocaleString('id-ID')} hasil
              </span>
            </div>

            {isSearchingCatalog ? (
              <div className="py-8 bg-[#121212] rounded-xl flex flex-col items-center justify-center text-[#A1A1AA] gap-2 text-[13px]">
                <Loader2 size={22} className="animate-spin text-[#1DB954]" />
                <span>Mencari lagu...</span>
              </div>
            ) : searchTab === 'artis' ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {artistsList.map((art) => (
                  <button
                    key={art.name}
                    type="button"
                    onClick={() => setSelectedArtistName(art.name)}
                    className="bg-[#141414] hover:bg-[#1C1C1C] rounded-lg p-2 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-full overflow-hidden bg-[#1C1C1C] shrink-0">
                      <MusicCoverImg src={art.photo} alt={art.name} iconSize={18} loading="lazy" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{art.name}</p>
                      <p className="text-[11px] text-[#A1A1AA]">Artis · {art.songs.length}</p>
                    </div>
                  </button>
                ))}
              </div>
            ) : searchTab === 'album' ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                {albumsList.map((alb) => (
                  <button
                    key={alb.key}
                    type="button"
                    onClick={() => setSelectedAlbumKey(alb.key)}
                    className="bg-[#141414] hover:bg-[#1C1C1C] rounded-lg p-2 flex items-center gap-2 text-left cursor-pointer"
                  >
                    <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1C1C1C] shrink-0">
                      <MusicCoverImg src={alb.cover} alt={alb.title} iconSize={18} loading="lazy" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-white truncate">{alb.title}</p>
                      <p className="text-[11px] text-[#A1A1AA] truncate">
                        {alb.year} · {alb.artist}
                      </p>
                    </div>
                  </button>
                ))}
              </div>
            ) : searchTab === 'playlist' ? (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {allPlaylists.map((pl) => renderPlaylistCard(pl))}
              </div>
            ) : catalogTracks.length === 0 ? (
              <div className="py-8 text-center text-[13px] text-[#A1A1AA] bg-[#121212] rounded-lg px-3">
                Lagu tidak ditemukan. Coba kata kunci lain seperti Taylor Swift, Bernadya, atau Hindia.
              </div>
            ) : (
              <div className="space-y-2">
                {catalogTracks.map((song, idx) => renderSpotifyTrackRow(song, idx, 'catalog'))}
              </div>
            )}
          </div>
        )}

        {/* 6. DEFAULT COMPACT MUSIC SECTIONS */}
        {!musicSettings.offlineMode && !isSearchMode && (
          <div className="space-y-4">
            {(chipLower === 'semua' || chipLower === 'playlist') && (
              <section className="space-y-2">
                <h2 className="text-[16px] font-bold text-white">Dibuat Untuk Kamu</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {MADE_FOR_YOU_PLAYLISTS.map((pl) => renderPlaylistCard(pl))}
                </div>
              </section>
            )}

            {(chipLower === 'semua' || chipLower === 'musik') && (
              <>
                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[16px] font-bold text-white">Trending Sekarang</h2>
                    <span className="text-[11px] font-semibold text-[#A1A1AA] tabular-nums">
                      {trendingCarousel.length} lagu
                    </span>
                  </div>
                  {isSearchingCatalog && trendingCarousel.length === 0 ? (
                    <div className="py-6 flex items-center justify-center gap-2 text-[13px] text-[#A1A1AA]">
                      <Loader2 size={18} className="animate-spin text-[#1DB954]" />
                      <span>Memuat Trending...</span>
                    </div>
                  ) : (
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                      {trendingCarousel.map((song) =>
                        renderHorizontalSongCard(song, 'trending')
                      )}
                    </div>
                  )}
                </section>

                <section className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h2 className="text-[16px] font-bold text-white">Lagu Viral TikTok</h2>
                    <span className="text-[11px] font-semibold text-[#A1A1AA] tabular-nums">
                      {viralCarousel.length} lagu
                    </span>
                  </div>
                  <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                    {viralCarousel.map((song) =>
                      renderHorizontalSongCard(song, 'viral')
                    )}
                  </div>
                </section>
              </>
            )}

            {(chipLower === 'semua' || chipLower === 'artis') && (
              <section className="space-y-2">
                <h2 className="text-[16px] font-bold text-white">Artis Populer</h2>
                <div className="flex gap-2.5 overflow-x-auto pb-1 no-scrollbar">
                  {artistsList.map((art) => (
                    <button
                      key={art.name}
                      type="button"
                      onClick={() => setSelectedArtistName(art.name)}
                      className="w-[84px] shrink-0 flex flex-col items-center text-center cursor-pointer"
                    >
                      <div className="w-16 h-16 rounded-full overflow-hidden bg-[#1C1C1C]">
                        <MusicCoverImg src={art.photo} alt={art.name} iconSize={20} loading="lazy" />
                      </div>
                      <p className="text-[12px] font-bold text-white truncate w-full mt-1.5">
                        {art.name}
                      </p>
                      <p className="text-[10px] text-[#A1A1AA]">Artis</p>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(chipLower === 'semua' || chipLower === 'album') && albumsList.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-[16px] font-bold text-white">Album Populer</h2>
                <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {albumsList.map((alb) => (
                    <button
                      key={alb.key}
                      type="button"
                      onClick={() => setSelectedAlbumKey(alb.key)}
                      className="ze-music-card-surface w-[132px] h-[112px] shrink-0 bg-[#141414] hover:bg-[#1C1C1C] rounded-lg p-2 text-left flex flex-col justify-between cursor-pointer"
                    >
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1C1C1C]">
                        <MusicCoverImg src={alb.cover} alt={alb.title} iconSize={18} loading="lazy" />
                      </div>
                      <div>
                        <p className="text-[13px] font-bold text-white truncate">{alb.title}</p>
                        <p className="text-[11px] text-[#A1A1AA] truncate">
                          {alb.year} · {alb.artist}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

            {(chipLower === 'semua' || chipLower === 'playlist') && (
              <section className="space-y-2">
                <h2 className="text-[16px] font-bold text-white">Playlist Untuk Kamu</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {CURATED_FOR_YOU_PLAYLISTS.map((pl) => renderPlaylistCard(pl))}
                </div>
              </section>
            )}

            {/* SEMUA LAGU (Lazy Load 20/batch) */}
            {(chipLower === 'semua' || chipLower === 'musik') && (
              <section className="space-y-2">
                <div className="flex items-baseline justify-between gap-2">
                  <h2 className="text-[16px] font-bold text-white">Semua Lagu</h2>
                  <span className="text-[11px] font-bold text-[#1DB954] tabular-nums whitespace-nowrap">
                    {displayTotalSongs >= 100000
                      ? '100.000+ lagu'
                      : `${displayTotalSongs.toLocaleString('id-ID')} lagu`}
                  </span>
                </div>

                {isSearchingCatalog && catalogTracks.length === 0 ? (
                  <div className="py-8 bg-[#121212] rounded-xl flex flex-col items-center justify-center text-[#A1A1AA] gap-2 text-[13px]">
                    <Loader2 size={22} className="animate-spin text-[#1DB954]" />
                    <span>Memuat katalog lagu...</span>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {catalogTracks.map((song, idx) =>
                      renderSpotifyTrackRow(song, idx, 'catalog')
                    )}
                  </div>
                )}
              </section>
            )}
          </div>
        )}

        {/* INFINITE SCROLL SENTINEL (+20 Lagu per scroll) */}
        {!musicSettings.offlineMode && hasMoreCatalog && catalogTracks.length > 0 && (
          <div ref={loadMoreTriggerRef} className="py-3 flex flex-col items-center gap-2">
            {isLoadingMore ? (
              <div className="flex items-center gap-2 text-[12px] text-[#A1A1AA]">
                <Loader2 size={16} className="animate-spin text-[#1DB954]" />
                <span>Memuat 20 lagu berikutnya...</span>
              </div>
            ) : (
              <button
                type="button"
                onClick={loadMoreCatalogSongs}
                className="px-4 py-2 rounded-full bg-[#1C1C1C] hover:bg-[#242424] text-white text-[12px] font-bold cursor-pointer"
              >
                Muat 20 Lagu Lagi ({catalogTracks.length.toLocaleString('id-ID')} dimuat)
              </button>
            )}
          </div>
        )}

        {/* RIWAYAT MUSIK & TIKTOK */}
        <section className="space-y-2 pt-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[16px] font-bold text-white">
              <ListMusic size={18} className="text-[#1DB954]" />
              <span>Riwayat Musik ({historyTracks.length})</span>
            </div>
            {currentTrack && (
              <button
                type="button"
                onClick={onDeleteCurrent}
                className="text-[11px] text-red-300 flex items-center gap-1 cursor-pointer bg-red-500/15 px-2.5 py-1 rounded-full border border-red-500/25 whitespace-nowrap"
              >
                <Trash2 size={12} />
                <span>Hapus Aktif</span>
              </button>
            )}
          </div>

          {historyTracks.length === 0 ? (
            <div className="bg-[#121212] rounded-lg p-4 text-center text-[12px] text-[#A1A1AA]">
              Belum ada riwayat musik. Putar lagu atau paste link TikTok di atas.
            </div>
          ) : (
            <div className="space-y-2">
              {historyTracks.map((item) => {
                const isSelected = currentTrack?.id === item.id || currentTrack?.title === item.title;
                const hasShortPreview = Boolean(
                  (item.audioUrl || item.previewUrl) &&
                    /mzstatic\.com|dzcdn\.net\/stream\/c-/i.test(item.audioUrl || item.previewUrl || '')
                );
                const replayTrack: TrackData = {
                  id: item.id,
                  title: item.title,
                  thumbnail: item.thumbnail,
                  cover: item.thumbnail,
                  url: item.youtubeId
                    ? `https://www.youtube.com/watch?v=${item.youtubeId}`
                    : item.videoUrl || (hasShortPreview ? '' : item.audioUrl || item.sourceUrl),
                  videoUrl: item.videoUrl,
                  audioUrl: item.fullAudioUrl || (hasShortPreview ? undefined : item.audioUrl),
                  youtubeId: item.youtubeId,
                  playbackMode: item.youtubeId ? 'youtube' : item.playbackMode === 'preview' ? 'youtube' : item.playbackMode,
                  isCatalogSearch: Boolean(
                    item.isCatalogSearch ||
                      item.sourceType === 'youtube' ||
                      item.sourceType === 'itunes' ||
                      item.sourceType === 'deezer' ||
                      item.sourceType === 'jamendo'
                  ),
                  album: item.album,
                  durationMs: item.durationMs,
                  source: item.sourceType,
                  sourceType: item.sourceType,
                  author: item.author,
                  artist: item.author,
                  sourceUrl: item.sourceUrl,
                };
                return (
                  <div
                    key={item.id}
                    onClick={() => {
                      ++activePlaySessionRef.current;
                      onPlayTrack(replayTrack);
                    }}
                    className="ze-music-row-surface bg-[#121212] hover:bg-[#191919] rounded-lg p-2 flex items-center justify-between gap-2 cursor-pointer"
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <div className="w-12 h-12 rounded-md overflow-hidden bg-[#1C1C1C] shrink-0 flex items-center justify-center">
                        <MusicCoverImg src={item.thumbnail} alt={item.title} iconSize={18} loading="lazy" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-[14px] font-bold truncate leading-tight ${
                            isSelected ? 'text-[#1DB954]' : 'text-white'
                          }`}
                        >
                          {item.title}
                        </p>
                        <p className="text-[12px] text-[#A1A1AA] truncate mt-0.5 leading-tight">
                          {item.author} ·{' '}
                          {item.sourceType === 'tiktok'
                            ? 'TikTok'
                            : item.sourceType === 'youtube'
                            ? 'YouTube'
                            : 'VN Music'}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                      <button
                        type="button"
                        onClick={() => {
                          ++activePlaySessionRef.current;
                          if (isSelected) onTogglePlay();
                          else onPlayTrack(replayTrack);
                        }}
                        className="w-8 h-8 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer"
                        aria-label={isSelected && isPlaying ? 'Pause' : 'Play'}
                      >
                        {isSelected && isPlaying ? (
                          <Pause size={14} className="fill-black" />
                        ) : (
                          <Play size={14} className="fill-black ml-0.5" />
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                        className="w-8 h-8 rounded-full flex items-center justify-center text-[#A1A1AA] hover:text-red-400 cursor-pointer"
                        aria-label="Hapus Dari Riwayat"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* MENU UNDUHAN OFFLINE (Top-Right Download Icon) */}
      {showDownloadsModal && (
        <div className="fixed inset-0 z-[10055] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#181818] border border-white/10 rounded-2xl max-w-lg w-full max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Download size={19} className="text-[#1DB954]" />
                <span>Unduhan</span>
              </h3>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setShowDownloadPrefs((v) => !v)}
                  className={`h-8 px-2.5 rounded-full text-xs font-semibold flex items-center gap-1 cursor-pointer transition ${
                    showDownloadPrefs
                      ? 'bg-[#1DB954] text-black'
                      : 'bg-[#282828] text-[#B3B3B3] hover:text-white'
                  }`}
                  title="Preferensi Audio & Offline"
                >
                  <SlidersHorizontal size={14} />
                  <span>Preferensi</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowDownloadsModal(false);
                    setCacheNotice(null);
                  }}
                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center cursor-pointer"
                  aria-label="Tutup Menu Unduhan"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto text-sm">
              {/* 1. Offline Downloads Summary */}
              <div className="bg-[#1DB954]/15 border border-[#1DB954]/40 rounded-xl p-3.5 flex items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <p className="text-sm font-bold text-[#1DB954] flex items-center gap-2">
                    <WifiOff size={15} />
                    <span>
                      {offlineTracks.length} Lagu Offline ·{' '}
                      {formatBytesMb(offlineTracks.reduce((acc, t) => acc + (t.sizeBytes || 0), 0))}
                    </span>
                  </p>
                  <p className="text-xs text-white/75">
                    Musik yang sudah diunduh tersimpan lokal dan bisa diputar tanpa internet.
                  </p>
                </div>
                {offlineTracks.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const list = offlineCatalogSongs;
                      if (list[0]) {
                        setPlaylist(
                          list.map((s) => toCatalogTrackData(s, 'offline'))
                        );
                        onPlayTrack(toCatalogTrackData(list[0], 'offline'));
                        setShowDownloadsModal(false);
                      }
                    }}
                    className="h-9 px-3.5 rounded-full bg-[#1DB954] text-black text-xs font-bold flex items-center gap-1.5 shrink-0 cursor-pointer active:scale-95 transition"
                  >
                    <Play size={14} className="fill-black" />
                    <span>Putar Semua</span>
                  </button>
                )}
              </div>

              {/* Quick Offline Mode Toggle */}
              <button
                type="button"
                onClick={() => updateMusicSettings({ offlineMode: !musicSettings.offlineMode })}
                className="w-full p-3 rounded-xl bg-[#242424] hover:bg-[#2C2C2C] flex items-center justify-between gap-3 text-left cursor-pointer transition"
              >
                <div className="flex items-start gap-2.5 min-w-0 flex-1">
                  <WifiOff size={17} className="text-[#1DB954] shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">
                      Mode Offline - Hanya Putar Lagu Unduhan
                    </p>
                    <p className="text-[11px] text-[#B3B3B3] mt-0.5">
                      Putar musik dari penyimpanan offline tanpa kuota internet
                    </p>
                  </div>
                </div>
                <span
                  className={`w-11 h-6 rounded-full p-0.5 transition shrink-0 flex items-center ${
                    musicSettings.offlineMode ? 'bg-[#1DB954] justify-end' : 'bg-white/20 justify-start'
                  }`}
                >
                  <span className="w-5 h-5 rounded-full bg-white shadow" />
                </span>
              </button>

              {/* 2. Downloaded Music List (Playable Offline) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold uppercase tracking-wider text-[#B3B3B3]">
                    Musik Yang Sudah Diunduh ({offlineTracks.length})
                  </p>
                  {offlineTracks.length > 0 && (
                    <button
                      type="button"
                      onClick={async () => {
                        await clearAllOfflineDownloads();
                        setCacheNotice('Semua lagu unduhan dihapus!');
                      }}
                      className="text-[11px] font-bold text-red-300 hover:text-red-200 cursor-pointer"
                    >
                      Hapus Semua
                    </button>
                  )}
                </div>

                {offlineTracks.length === 0 ? (
                  <div className="bg-[#121212] border border-white/10 rounded-xl p-6 text-center space-y-2">
                    <Download size={28} className="mx-auto text-[#737373]" />
                    <p className="text-sm font-bold text-white">Belum Ada Lagu Diunduh</p>
                    <p className="text-xs text-[#B3B3B3]">
                      Tekan ikon unduhan pada lagu mana saja untuk menyimpannya dan memutarnya secara offline.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-1.5 max-h-[300px] overflow-y-auto pr-1">
                    {offlineTracks.map((tr) => {
                      const isSelected = currentTrack?.id === tr.id;
                      const offlineSong: CatalogSong = {
                        id: tr.id,
                        title: tr.title,
                        artist: tr.artist,
                        album: tr.album || 'Offline',
                        thumbnail: tr.thumbnail,
                        previewUrl: '',
                        durationMs: (tr.durationSec || 180) * 1000,
                        source: 'offline',
                        sourceUrl: '',
                        youtubeId: tr.youtubeId,
                      };
                      return (
                        <div
                          key={tr.id}
                          onClick={() => {
                            setPlaylist(
                              offlineCatalogSongs.map((s) => toCatalogTrackData(s, 'offline'))
                            );
                            onPlayTrack(toCatalogTrackData(offlineSong, 'offline'));
                            setShowDownloadsModal(false);
                          }}
                          className={`rounded-xl p-2.5 flex items-center justify-between gap-2.5 cursor-pointer transition ${
                            isSelected ? 'bg-[#282828]' : 'bg-[#242424] hover:bg-[#2C2C2C]'
                          }`}
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className="w-11 h-11 rounded-md overflow-hidden bg-[#737373] shrink-0">
                              <MusicCoverImg src={tr.thumbnail} alt={tr.title} iconSize={18} loading="lazy" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-bold truncate ${
                                  isSelected ? 'text-[#1DB954]' : 'text-white'
                                }`}
                              >
                                {tr.title}
                              </p>
                              <p className="text-xs text-[#B3B3B3] truncate">
                                {tr.artist} · {formatBytesMb(tr.sizeBytes)} · Offline
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  onTogglePlay();
                                } else {
                                  setPlaylist(
                                    offlineCatalogSongs.map((s) => toCatalogTrackData(s, 'offline'))
                                  );
                                  onPlayTrack(toCatalogTrackData(offlineSong, 'offline'));
                                  setShowDownloadsModal(false);
                                }
                              }}
                              className="w-9 h-9 rounded-full bg-[#1DB954] text-black flex items-center justify-center cursor-pointer active:scale-95 transition"
                              title={isSelected && isPlaying ? 'Pause' : 'Putar Offline'}
                            >
                              {isSelected && isPlaying ? (
                                <Pause size={15} className="fill-black" />
                              ) : (
                                <Play size={15} className="fill-black ml-0.5" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => removeOfflineTrack(tr.id)}
                              className="w-8 h-8 rounded-full hover:bg-red-500/20 text-[#B3B3B3] hover:text-red-300 flex items-center justify-center cursor-pointer"
                              title="Hapus Unduhan"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* 3. Collapsible Audio & Download Preferences */}
              {showDownloadPrefs && (
                <div className="pt-3 border-t border-white/10 space-y-4">
                  <div className="space-y-2">
                    {[
                      {
                        key: 'wifiOnlyDownload' as const,
                        label: 'Unduh Hanya Pakai WiFi',
                        sub: 'Cegah unduhan menggunakan kuota seluler',
                        icon: Wifi,
                      },
                      {
                        key: 'repeatDefault' as const,
                        label: 'Repeat Default',
                        sub: 'Ulangi lagu otomatis saat pemutaran baru',
                        icon: RefreshCw,
                      },
                      {
                        key: 'shuffleDefault' as const,
                        label: 'Shuffle Default',
                        sub: 'Acak urutan antrean secara default',
                        icon: Shuffle,
                      },
                    ].map((item) => {
                      const Icon = item.icon;
                      const active = Boolean(musicSettings[item.key]);
                      return (
                        <button
                          key={item.key}
                          type="button"
                          onClick={() => updateMusicSettings({ [item.key]: !active })}
                          className="w-full p-2.5 rounded-xl bg-[#242424] hover:bg-[#2C2C2C] flex items-center justify-between gap-3 text-left cursor-pointer transition"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <Icon size={16} className="text-[#1DB954] shrink-0 mt-0.5" />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-white">{item.label}</p>
                              <p className="text-[11px] text-[#B3B3B3] mt-0.5">{item.sub}</p>
                            </div>
                          </div>
                          <span
                            className={`w-10 h-5 rounded-full p-0.5 transition shrink-0 flex items-center ${
                              active ? 'bg-[#1DB954] justify-end' : 'bg-white/20 justify-start'
                            }`}
                          >
                            <span className="w-4 h-4 rounded-full bg-white shadow" />
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  <div className="grid grid-cols-3 gap-2">
                    {(
                      [
                        { v: 128, label: '128 kbps' },
                        { v: 256, label: '256 kbps' },
                        { v: 320, label: '320 kbps' },
                      ] as Array<{ v: DownloadQualityKbps; label: string }>
                    ).map((opt) => (
                      <button
                        key={opt.v}
                        type="button"
                        onClick={() => updateMusicSettings({ downloadQuality: opt.v })}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold border cursor-pointer transition ${
                          musicSettings.downloadQuality === opt.v
                            ? 'bg-[#1DB954] text-black border-[#1DB954]'
                            : 'bg-[#282828] text-white border-white/10'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>

                  <div>
                    <div className="flex justify-between mb-1.5">
                      <span className="text-xs text-[#B3B3B3] flex items-center gap-1.5">
                        <Volume2 size={15} /> Volume Pemutar
                      </span>
                      <span className="font-mono tabular-nums text-white font-bold text-xs">
                        {Math.round(volume * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(volume * 100)}
                      onChange={(e) => setVolume(Number(e.target.value) / 100)}
                      className="w-full h-1.5 accent-[#1DB954] cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setResolvedFullMap({});
                        setResolvedYtMap({});
                        loadTrendingSongs();
                        setCacheNotice('Cache katalog dibersihkan!');
                      }}
                      className="py-2 px-3 rounded-xl bg-[#282828] hover:bg-[#333333] text-white font-bold text-xs cursor-pointer"
                    >
                      Hapus Cache
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setHistoryTracks([]);
                        try {
                          localStorage.removeItem(historyStorageKey);
                        } catch {}
                        setCacheNotice('Riwayat putar dihapus!');
                      }}
                      className="py-2 px-3 rounded-xl bg-[#282828] hover:bg-[#333333] text-white font-bold text-xs cursor-pointer"
                    >
                      Hapus Riwayat
                    </button>
                  </div>
                </div>
              )}

              {cacheNotice && (
                <p className="text-xs text-[#1DB954] font-semibold text-center">{cacheNotice}</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
