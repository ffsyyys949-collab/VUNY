import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import {
  getCustomThemesMeta,
  saveCustomThemesMeta,
  saveVideoBlob,
  getVideoBlob,
  deleteVideoBlob,
  CustomThemeMeta,
} from './themeStorage';
import { prepareAppearanceImage, uploadAppearanceMedia } from './homeUiConfig';
import { safeApiFetch } from '../lib/zeDataSync';

export interface GlobalTheme {
  id: string;
  name: string;
  subtitle: string;
  video: string | null;
  mediaType?: 'video' | 'image';
  bg?: string;
  previewThumb?: string;
  isCustom?: boolean;
}

export const EXTERNAL_BG_MAIN_VIDEO = '/assets/aistudio/ssstik.io_1792870405896_cd0f92f4_510f3d9f.mp4';
export const EXTERNAL_BG_LIQUID_VIDEO = '/assets/aistudio/ssstik.io_1793231239969_f00ac994_c5cdd032.mp4';

export function resolveExternalBgVideoUrl(url?: string | null): string | null {
  if (!url) return null;
  if (
    url === '/assets/aistudio/ssstik.io_1792870405896_cd0f92f4.mp4' ||
    url === '/assets/aistudio/VID-20261028-WA0024_84426855.mp4' ||
    url === 'https://pomf2.lain.la/f/0c4r19dc.mp4' ||
    url === 'https://qu.ax/GxABY.mp4'
  ) {
    return EXTERNAL_BG_MAIN_VIDEO;
  }
  if (
    url === '/assets/aistudio/ssstik.io_1793231239969_f00ac994.mp4' ||
    url === '/assets/bw_water_liquid.mp4' ||
    url === 'https://pomf2.lain.la/f/kv285epn.mp4' ||
    url === 'https://qu.ax/a4rLw.mp4'
  ) {
    return EXTERNAL_BG_LIQUID_VIDEO;
  }
  return url;
}

export const GLOBAL_THEMES: GlobalTheme[] = [
  {
    id: 'bw-liquid-water',
    name: 'Black & White Liquid Glass',
    subtitle: 'Air hitam putih bergelombang & efek kaca monokrom mewah',
    video: EXTERNAL_BG_MAIN_VIDEO,
    mediaType: 'video',
    bg: '#080808',
    previewThumb: '/assets/bg_water_still.webp',
  },
];

interface ThemeContextType {
  theme: GlobalTheme;
  setTheme: (theme: GlobalTheme) => void;
  selectThemeById: (id: string) => void;
  allThemes: GlobalTheme[];
  addCustomTheme: (data: {
    name: string;
    subtitle?: string;
    blob?: Blob;
    videoUrl?: string;
    bg?: string;
    mediaType?: 'video' | 'image';
  }) => Promise<GlobalTheme>;
  deleteCustomTheme: (id: string) => Promise<void>;
  resetThemeToDefault: () => void;
}

function getActiveThemeUid(): string {
  try {
    const raw =
      localStorage.getItem('zeio-user') ||
      localStorage.getItem('ze_user') ||
      localStorage.getItem('vn_currentUser');
    if (raw) {
      const parsed = JSON.parse(raw);
      const id = String(parsed?.id || '').trim().toUpperCase();
      if (id) return id;
    }
    const directId = String(localStorage.getItem('ze_id') || '').trim().toUpperCase();
    if (directId) return directId;
  } catch {}
  return 'GUEST';
}

function readThemeIdForCurrentUser(): string {
  const uid = getActiveThemeUid();
  try {
    const scopedSimple = localStorage.getItem(`zeio-theme_${uid}`);
    if (scopedSimple) return scopedSimple;
    const scopedGlobal = localStorage.getItem(`zeio-global-theme_${uid}`);
    if (scopedGlobal) {
      try {
        const parsed = JSON.parse(scopedGlobal);
        if (parsed?.id) return parsed.id;
      } catch {
        return scopedGlobal;
      }
    }
    if (uid === 'GUEST') {
      const savedSimple = localStorage.getItem('zeio-theme');
      if (savedSimple) return savedSimple;
    }
  } catch {}
  return 'bw-liquid-water';
}

function inferMediaType(url?: string | null, explicit?: 'video' | 'image'): 'video' | 'image' {
  if (explicit === 'image') return 'image';
  if (explicit === 'video') return 'video';
  if (
    url &&
    (/^data:image\//i.test(url) || /\.(png|jpe?g|webp|gif|bmp|avif)(\?.*)?$/i.test(url))
  ) {
    return 'image';
  }
  return 'video';
}

function readSyncCustomThemesFromMeta(): GlobalTheme[] {
  if (typeof window === 'undefined') return [];
  try {
    const metas = getCustomThemesMeta();
    return metas
      .filter((meta) => Boolean(meta.videoUrl))
      .map((meta) => {
        const mediaUrl = resolveExternalBgVideoUrl(meta.videoUrl || null);
        return {
          id: meta.id,
          name: meta.name,
          subtitle: meta.subtitle || 'Background kustom pengguna',
          video: mediaUrl,
          mediaType: inferMediaType(mediaUrl, meta.mediaType),
          bg: meta.bg || '#080808',
          isCustom: true,
        };
      });
  } catch {
    return [];
  }
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [customThemes, setCustomThemes] = useState<GlobalTheme[]>(() => readSyncCustomThemesFromMeta());
  const [customLoaded, setCustomLoaded] = useState(false);
  const objectUrlsRef = useRef<Map<string, string>>(new Map());
  const [themeId, setThemeId] = useState<string>(() => readThemeIdForCurrentUser());
  const activeUidRef = useRef<string>(typeof window !== 'undefined' ? getActiveThemeUid() : 'GUEST');

  const syncAppearanceToServer = useCallback((metas: CustomThemeMeta[], activeId: string) => {
    const uid = getActiveThemeUid();
    safeApiFetch('/api/user/appearance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: uid,
        customThemesMeta: metas,
        activeThemeId: activeId,
      }),
      timeoutMs: 8000,
    }).catch(() => {});
  }, []);

  const loadThemesAndHydrate = useCallback(async () => {
    try {
      const uid = getActiveThemeUid();
      let metas = getCustomThemesMeta();

      // Hydrate from server persistence if available
      try {
        const res = await safeApiFetch<{
          appearance?: { customThemesMeta?: CustomThemeMeta[]; activeThemeId?: string };
        }>(`/api/user/appearance?userId=${encodeURIComponent(uid)}`, { timeoutMs: 5000 });
        const remoteMetas = res.data?.appearance?.customThemesMeta;
        const remoteActiveId = res.data?.appearance?.activeThemeId;
        if (Array.isArray(remoteMetas) && remoteMetas.length > 0 && metas.length === 0) {
          metas = remoteMetas;
          saveCustomThemesMeta(remoteMetas);
        }
        if (remoteActiveId && !localStorage.getItem(`zeio-theme_${uid}`)) {
          localStorage.setItem(`zeio-theme_${uid}`, remoteActiveId);
          setThemeId(remoteActiveId);
        }
      } catch {}

      const loaded: GlobalTheme[] = [];
      for (const meta of metas) {
        let mediaUrl = resolveExternalBgVideoUrl(meta.videoUrl || null);
        let resolvedType: 'video' | 'image' = inferMediaType(mediaUrl, meta.mediaType);
        if (!mediaUrl && meta.hasBlob) {
          const blob = await getVideoBlob(meta.id);
          if (blob) {
            const url = URL.createObjectURL(blob);
            objectUrlsRef.current.set(meta.id, url);
            mediaUrl = url;
            if (!meta.mediaType && blob.type) {
              resolvedType = blob.type.startsWith('image/') ? 'image' : 'video';
            }
          }
        }
        loaded.push({
          id: meta.id,
          name: meta.name,
          subtitle: meta.subtitle || 'Background kustom pengguna',
          video: mediaUrl,
          mediaType: resolvedType,
          bg: meta.bg || '#080808',
          isCustom: true,
        });
      }
      setCustomThemes(loaded);
      setCustomLoaded(true);
    } catch {
      setCustomLoaded(true);
    }
  }, []);

  useEffect(() => {
    loadThemesAndHydrate();
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [loadThemesAndHydrate]);

  const allThemes = [...GLOBAL_THEMES, ...customThemes];

  // Keep active custom themeId intact while customThemes hydrate
  const matchedTheme = allThemes.find((t) => t.id === themeId);
  const theme = matchedTheme || GLOBAL_THEMES[0];

  useEffect(() => {
    if (!customLoaded && themeId.startsWith('custom-theme-')) return;
    const uid = getActiveThemeUid();
    try {
      localStorage.setItem(`zeio-theme_${uid}`, theme.id);
      localStorage.setItem(
        `zeio-global-theme_${uid}`,
        JSON.stringify({
          id: theme.id,
          name: theme.name,
          subtitle: theme.subtitle,
          video: theme.video,
          mediaType: theme.mediaType || 'video',
          bg: theme.bg,
          isCustom: theme.isCustom,
        })
      );
    } catch {}
  }, [theme, customLoaded, themeId]);

  useEffect(() => {
    const handleAccountSwitch = () => {
      const nextUid = getActiveThemeUid();
      if (nextUid !== activeUidRef.current) {
        activeUidRef.current = nextUid;
        setThemeId(readThemeIdForCurrentUser());
        loadThemesAndHydrate();
      }
    };
    window.addEventListener('ze-user-store-updated', handleAccountSwitch);
    window.addEventListener('zeio-user-updated', handleAccountSwitch);
    return () => {
      window.removeEventListener('ze-user-store-updated', handleAccountSwitch);
      window.removeEventListener('zeio-user-updated', handleAccountSwitch);
    };
  }, [loadThemesAndHydrate]);

  const setTheme = (newTheme: GlobalTheme) => {
    setThemeId(newTheme.id);
    const uid = getActiveThemeUid();
    try {
      localStorage.setItem(`zeio-theme_${uid}`, newTheme.id);
    } catch {}
    syncAppearanceToServer(getCustomThemesMeta(), newTheme.id);
  };

  const selectThemeById = (id: string) => {
    const found = allThemes.find((t) => t.id === id);
    if (found) {
      setTheme(found);
    }
  };

  const addCustomTheme = async (data: {
    name: string;
    subtitle?: string;
    blob?: Blob;
    videoUrl?: string;
    bg?: string;
    mediaType?: 'video' | 'image';
  }): Promise<GlobalTheme> => {
    const id = 'custom-theme-' + Date.now();
    const blobFileName = (data.blob as File | undefined)?.name || '';
    const detectedType: 'video' | 'image' = data.blob
      ? data.blob.type.startsWith('image/') ||
        (!data.blob.type && /\.(png|jpe?g|webp|gif|bmp|avif)$/i.test(blobFileName))
        ? 'image'
        : data.blob.type.startsWith('video/')
        ? 'video'
        : data.mediaType || inferMediaType(data.videoUrl)
      : data.mediaType || inferMediaType(data.videoUrl);

    let persistentUrl = data.videoUrl || null;
    let previewUrl = data.videoUrl || null;
    let hasBlob = false;

    if (data.blob) {
      let targetBlob = data.blob;
      let compressedDataUrl = '';
      if (detectedType === 'image') {
        const prepared = await prepareAppearanceImage(data.blob);
        targetBlob = prepared.blob;
        compressedDataUrl = prepared.dataUrl;
      }

      await saveVideoBlob(id, targetBlob);
      hasBlob = true;
      const uploadedUrl = await uploadAppearanceMedia(targetBlob, 'bg-theme');
      if (uploadedUrl) {
        persistentUrl = uploadedUrl;
        previewUrl = uploadedUrl;
      } else if (detectedType === 'image' && compressedDataUrl) {
        persistentUrl = compressedDataUrl;
        previewUrl = compressedDataUrl;
      } else {
        previewUrl = URL.createObjectURL(targetBlob);
        objectUrlsRef.current.set(id, previewUrl);
      }
    }

    const meta: CustomThemeMeta = {
      id,
      name: data.name.trim() || (detectedType === 'image' ? 'Custom Wallpaper' : 'Custom Video'),
      subtitle:
        data.subtitle?.trim() ||
        (detectedType === 'image' ? 'Wallpaper kustom pengguna' : 'Video kustom pengguna'),
      bg: data.bg || '#080808',
      hasBlob,
      videoUrl: persistentUrl || undefined,
      mediaType: detectedType,
      createdAt: Date.now(),
    };

    const existingMetas = getCustomThemesMeta();
    const nextMetas = [...existingMetas, meta];
    saveCustomThemesMeta(nextMetas);
    syncAppearanceToServer(nextMetas, id);

    const newTheme: GlobalTheme = {
      id,
      name: meta.name,
      subtitle: meta.subtitle,
      video: previewUrl,
      mediaType: detectedType,
      bg: meta.bg,
      isCustom: true,
    };

    setCustomThemes((prev) => [...prev, newTheme]);
    setThemeId(id);
    return newTheme;
  };

  const deleteCustomTheme = async (id: string) => {
    try {
      await deleteVideoBlob(id);
    } catch {}

    const oldUrl = objectUrlsRef.current.get(id);
    if (oldUrl) {
      URL.revokeObjectURL(oldUrl);
      objectUrlsRef.current.delete(id);
    }

    const existingMetas = getCustomThemesMeta();
    const nextMetas = existingMetas.filter((m) => m.id !== id);
    saveCustomThemesMeta(nextMetas);
    setCustomThemes((prev) => prev.filter((t) => t.id !== id));

    const nextActive = themeId === id ? 'bw-liquid-water' : themeId;
    if (themeId === id) {
      setThemeId('bw-liquid-water');
    }
    syncAppearanceToServer(nextMetas, nextActive);
  };

  const resetThemeToDefault = () => {
    setTheme(GLOBAL_THEMES[0]);
  };

  return (
    <ThemeContext.Provider
      value={{
        theme,
        setTheme,
        selectThemeById,
        allThemes,
        addCustomTheme,
        deleteCustomTheme,
        resetThemeToDefault,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
