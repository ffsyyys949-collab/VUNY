import { useCallback, useEffect, useState } from 'react';

export type MlFloatingMenuId =
  | 'vn_ai'
  | 'enemy_lag'
  | 'matchmaking_bot'
  | 'latency_rendah'
  | 'anti_disconnect'
  | 'speed_boost';

export type MlWidgetSize = 'small' | 'medium' | 'large';

export interface MlFloatingMenuInfo {
  id: MlFloatingMenuId;
  title: string;
  subtitle: string;
  badge?: string;
  infoHeading: string;
  tips: string[];
  note: string;
}

export interface MlFloatingWidgetState {
  enabled: boolean;
  expanded: boolean;
  hidden: boolean;
  size: MlWidgetSize;
  position: { x: number; y: number };
  selectedMenuId: MlFloatingMenuId | null;
  activeTools: Record<MlFloatingMenuId, boolean>;
}

const STORAGE_KEY = 'ml_floating_widget_state_v1';
const RW_FEATURES_STORAGE_KEY = 'rw_features_state';
const UPDATE_EVENT = 'ml-floating-widget-updated';
export const RW_FEATURES_UPDATE_EVENT = 'rw-features-updated';
export const ML_DOMAIN_RESULT_EVENT = 'ml-domain-check-result';

export const DEFAULT_ACTIVE_TOOLS: Record<MlFloatingMenuId, boolean> = {
  vn_ai: false,
  enemy_lag: false,
  matchmaking_bot: false,
  latency_rendah: false,
  anti_disconnect: false,
  speed_boost: false,
};

export const ML_FLOATING_MENUS: MlFloatingMenuInfo[] = [
  {
    id: 'vn_ai',
    title: 'VN AI',
    subtitle: 'AI Coach yang liat layar lu',
    badge: 'LIVE',
    infoHeading: 'VN AI — Live Screen & Voice ML Coach',
    tips: [
      'VN AI melihat layar Mobile Legends secara live lewat izin tangkap layar resmi Android (MediaProjection).',
      'Ngomong otomatis pakai suara cowok tiap ada situasi penting (HP kritis, gank, war, Lord/Turtle) dan bisa tanya balik pakai Mic.',
      'Melayang sistem-wide di atas ML pakai Floating Bubble VN AI (drag, mute, mic, hentikan kapan saja).',
    ],
    note: 'Membutuhkan izin Overlay, Tangkap Layar, & Mikrofon untuk aktif live di atas Mobile Legends.',
  },
  {
    id: 'enemy_lag',
    title: 'Enemy Lag',
    subtitle: 'Info kondisi lag jaringan',
    infoHeading: 'Info Jaringan & Lag di Match',
    tips: [
      'Lag jaringan pada pemain dalam match terjadi karena jitter tinggi, packet loss, atau routing ISP yang padat.',
      'Menjaga ping dan upload packet perangkat sendiri tetap stabil membantu respons skill lebih konsisten saat teamfight.',
      'Hindari aplikasi pengunggah/unduh background agar bandwidth game tetap prioritas.',
    ],
    note: 'Panel info saja — tidak mengganggu atau memengaruhi koneksi pemain lawan.',
  },
  {
    id: 'matchmaking_bot',
    title: 'Match Making Bot',
    subtitle: 'Info bot & cek com.mobilelegends.com',
    infoHeading: 'Info Match Bot & Cek com.mobilelegends.com',
    tips: [
      'Lawan Bot / Computer tersedia resmi melalui mode VS A.I. / Custom di Mobile Legends untuk latihan hero atau pemanasan.',
      'Pengecekan otomatis domain com.mobilelegends.com di bawah ini hanya memeriksa status keterjangkauan koneksi secara pasif.',
      'Untuk pengalaman murni lawan komputer, gunakan mode VS A.I. atau Training Camp bawaan MLBB.',
    ],
    note: 'Panel info & cek konektivitas saja — tidak melakukan auto-match atau manipulasi lobby.',
  },
  {
    id: 'latency_rendah',
    title: 'Latency Rendah',
    subtitle: 'Setting otomatis jaringan jadi cepat',
    infoHeading: 'Tips Setting Jaringan Cepat',
    tips: [
      'Gunakan Wi-Fi 5 GHz atau sinyal 4G/5G yang stabil dengan kekuatan bar penuh.',
      'Aktifkan Private DNS cepat (misal 1.1.1.1 atau dns.google) di pengaturan jaringan HP untuk kestabilan rute.',
      'Nyalakan fitur Network Boost / Speed Mode di dalam pengaturan jaringan Mobile Legends dan tutup aplikasi background.',
    ],
    note: 'Panel info saja — ikuti pengaturan jaringan di perangkat dan menu game.',
  },
  {
    id: 'anti_disconnect',
    title: 'Anti Disconnect',
    subtitle: 'Biar gak DC: baterai, sinyal, mode jangan ganggu',
    infoHeading: 'Checklist Anti Disconnect (DC)',
    tips: [
      'Baterai: jaga daya di atas 20% dan matikan Penghemat Baterai agar modem serta CPU tidak dibatasi saat match.',
      'Sinyal: kunci ke satu koneksi stabil (Wi-Fi saja atau Data saja) agar tidak reconnecting saat berpindah jaringan.',
      'Mode Jangan Ganggu: aktifkan Do Not Disturb (DND) agar panggilan masuk dan popup notifikasi tidak memutus game.',
    ],
    note: 'Panel info saja — pengaturan baterai, sinyal, dan DND diatur dari sistem HP.',
  },
  {
    id: 'speed_boost',
    title: 'Speed Boost',
    subtitle: 'Setting HP: mode performa, bersihin RAM',
    infoHeading: 'Tips Setting HP & Bersihin RAM',
    tips: [
      'Mode Performa: aktifkan Mode Performa / Game Mode / Game Turbo bawaan HP untuk alokasi CPU & GPU optimal.',
      'Bersihin RAM: tutup aplikasi berat di Recent Apps sebelum buka MLBB agar memori RAM lega dan minim frame drop.',
      'Atur grafis & refresh rate sesuai kemampuan suhu HP supaya tidak thermal throttling di late game.',
    ],
    note: 'Panel info saja — tidak menyuntikkan file atau mengubah kecepatan game.',
  },
];

function getDefaultPosition(): { x: number; y: number } {
  if (typeof window === 'undefined') {
    return { x: 16, y: 120 };
  }
  return {
    x: Math.max(12, window.innerWidth - 72),
    y: Math.max(84, Math.round(window.innerHeight * 0.24)),
  };
}

export const DEFAULT_ML_FLOATING_WIDGET_STATE: MlFloatingWidgetState = {
  enabled: false,
  expanded: false,
  hidden: false,
  size: 'medium',
  position: { x: 16, y: 140 },
  selectedMenuId: null,
  activeTools: { ...DEFAULT_ACTIVE_TOOLS },
};

function sanitizeActiveTools(
  widgetRaw?: unknown,
  rwRaw?: unknown
): Record<MlFloatingMenuId, boolean> {
  const result: Record<MlFloatingMenuId, boolean> = { ...DEFAULT_ACTIVE_TOOLS };
  const wObj = widgetRaw && typeof widgetRaw === 'object' ? (widgetRaw as Record<string, unknown>) : null;
  const rwObj = rwRaw && typeof rwRaw === 'object' ? (rwRaw as Record<string, unknown>) : null;
  for (const menu of ML_FLOATING_MENUS) {
    if (wObj && typeof wObj[menu.id] === 'boolean') {
      result[menu.id] = Boolean(wObj[menu.id]);
    } else if (rwObj && typeof rwObj[menu.id] === 'boolean') {
      result[menu.id] = Boolean(rwObj[menu.id]);
    }
  }
  return result;
}

export function loadMlFloatingWidgetState(): MlFloatingWidgetState {
  const fallbackPos = getDefaultPosition();
  try {
    let rwParsed: unknown = null;
    try {
      const rwRaw = localStorage.getItem(RW_FEATURES_STORAGE_KEY);
      if (rwRaw) rwParsed = JSON.parse(rwRaw);
    } catch {}

    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        ...DEFAULT_ML_FLOATING_WIDGET_STATE,
        position: fallbackPos,
        activeTools: sanitizeActiveTools(null, rwParsed),
      };
    }
    const parsed = JSON.parse(raw);
    const validSize: MlWidgetSize =
      parsed?.size === 'small' || parsed?.size === 'large' ? parsed.size : 'medium';
    const x =
      typeof parsed?.position?.x === 'number' && Number.isFinite(parsed.position.x)
        ? parsed.position.x
        : fallbackPos.x;
    const y =
      typeof parsed?.position?.y === 'number' && Number.isFinite(parsed.position.y)
        ? parsed.position.y
        : fallbackPos.y;
    const validMenu = ML_FLOATING_MENUS.some((m) => m.id === parsed?.selectedMenuId)
      ? (parsed.selectedMenuId as MlFloatingMenuId)
      : null;
    return {
      enabled: Boolean(parsed?.enabled),
      expanded: Boolean(parsed?.expanded),
      hidden: Boolean(parsed?.hidden),
      size: validSize,
      position: { x, y },
      selectedMenuId: validMenu,
      activeTools: sanitizeActiveTools(parsed?.activeTools, rwParsed),
    };
  } catch {
    return {
      ...DEFAULT_ML_FLOATING_WIDGET_STATE,
      position: fallbackPos,
      activeTools: { ...DEFAULT_ACTIVE_TOOLS },
    };
  }
}

function syncNativeMlWidgetBridge(state: MlFloatingWidgetState) {
  try {
    const bridge = window.ZeNative;
    const toolsJson = JSON.stringify(state.activeTools || DEFAULT_ACTIVE_TOOLS);
    if (bridge && typeof bridge.syncMlFloatingWidget === 'function') {
      bridge.syncMlFloatingWidget(state.enabled, state.hidden, state.size, toolsJson);
      return;
    }
    if (bridge && typeof bridge.setMlFloatingWidget === 'function') {
      bridge.setMlFloatingWidget(state.enabled);
    }
  } catch {}
}

export function saveMlFloatingWidgetState(
  next: MlFloatingWidgetState,
  options?: { syncNative?: boolean; syncRwFeatures?: boolean }
): MlFloatingWidgetState {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    if (options?.syncRwFeatures !== false && next.activeTools) {
      localStorage.setItem(RW_FEATURES_STORAGE_KEY, JSON.stringify(next.activeTools));
    }
  } catch {}
  if (options?.syncNative !== false) {
    syncNativeMlWidgetBridge(next);
  }
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent(UPDATE_EVENT, { detail: next }));
    if (options?.syncRwFeatures !== false && next.activeTools) {
      window.dispatchEvent(new CustomEvent(RW_FEATURES_UPDATE_EVENT, { detail: next.activeTools }));
    }
  }
  return next;
}

let activeWakeLockSentinel: { release?: () => Promise<void> } | null = null;
let interactiveAudioCtx: AudioContext | null = null;

export function runMlToolEffect(id: MlFloatingMenuId, active: boolean) {
  if (typeof window === 'undefined') return;

  if (id === 'vn_ai') {
    try {
      const bridge = window.ZeNative;
      if (active) {
        if (bridge && typeof bridge.startVnAiCoach === 'function') {
          const origin =
            typeof window.ZeNative?.getApiBaseUrl === 'function'
              ? window.ZeNative.getApiBaseUrl() || ''
              : window.location.origin;
          bridge.startVnAiCoach(origin);
        }
      } else {
        if (bridge && typeof bridge.stopVnAiCoach === 'function') {
          bridge.stopVnAiCoach();
        }
      }
    } catch {}
  }

  if (id === 'latency_rendah' && active) {
    try {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx && (!interactiveAudioCtx || interactiveAudioCtx.state === 'closed')) {
        interactiveAudioCtx = new AudioCtx({ latencyHint: 'interactive' });
      } else if (interactiveAudioCtx && interactiveAudioCtx.state === 'suspended') {
        interactiveAudioCtx.resume().catch(() => {});
      }
    } catch {}
  }

  if (id === 'anti_disconnect') {
    if (active && 'wakeLock' in navigator) {
      (navigator as Navigator & { wakeLock?: { request: (t: string) => Promise<{ release: () => Promise<void> }> } })
        .wakeLock?.request('screen')
        .then((sentinel) => {
          activeWakeLockSentinel = sentinel;
        })
        .catch(() => {});
    } else if (!active && activeWakeLockSentinel) {
      try {
        activeWakeLockSentinel.release?.().catch?.(() => {});
      } catch {}
      activeWakeLockSentinel = null;
    }
  }

  if (id === 'speed_boost' && active) {
    try {
      if ('caches' in window) {
        window.caches.keys().then((keys) => {
          keys.forEach((k) => {
            if (!k.includes('offline-music')) {
              window.caches.delete(k).catch(() => {});
            }
          });
        }).catch(() => {});
      }
    } catch {}
  }

  if (id === 'matchmaking_bot' && active) {
    void checkMobileLegendsDomain().then((res) => {
      try {
        window.dispatchEvent(new CustomEvent(ML_DOMAIN_RESULT_EVENT, { detail: res }));
      } catch {}
    });
  }
}

export function toggleMlTool(id: MlFloatingMenuId, forceValue?: boolean): MlFloatingWidgetState {
  const current = loadMlFloatingWidgetState();
  const nextVal = typeof forceValue === 'boolean' ? forceValue : !current.activeTools[id];
  const nextActiveTools: Record<MlFloatingMenuId, boolean> = {
    ...current.activeTools,
    [id]: nextVal,
  };
  const nextState: MlFloatingWidgetState = {
    ...current,
    activeTools: nextActiveTools,
  };
  runMlToolEffect(id, nextVal);
  return saveMlFloatingWidgetState(nextState);
}

export function syncActiveToolsFromRw(rwFeatures: Record<string, boolean>): MlFloatingWidgetState {
  const current = loadMlFloatingWidgetState();
  const merged = sanitizeActiveTools(rwFeatures, rwFeatures);
  const nextState: MlFloatingWidgetState = {
    ...current,
    activeTools: merged,
  };
  return saveMlFloatingWidgetState(nextState, { syncRwFeatures: false });
}

export function openMlFloatingWidgetFromMenu(): MlFloatingWidgetState {
  const current = loadMlFloatingWidgetState();
  const next: MlFloatingWidgetState = {
    ...current,
    enabled: true,
    hidden: false,
    expanded: true,
    position:
      typeof window !== 'undefined'
        ? {
            x: Math.min(Math.max(12, current.position.x), Math.max(12, window.innerWidth - 72)),
            y: Math.min(Math.max(56, current.position.y), Math.max(56, window.innerHeight - 120)),
          }
        : current.position,
  };
  try {
    const bridge = window.ZeNative;
    if (bridge && typeof bridge.setMlFloatingWidget === 'function') {
      bridge.setMlFloatingWidget(true);
    }
  } catch {}
  return saveMlFloatingWidgetState(next);
}

export function closeMlFloatingWidget(): MlFloatingWidgetState {
  const current = loadMlFloatingWidgetState();
  const next: MlFloatingWidgetState = {
    ...current,
    enabled: false,
    expanded: false,
    hidden: false,
    selectedMenuId: null,
  };
  try {
    const bridge = window.ZeNative;
    if (bridge && typeof bridge.setMlFloatingWidget === 'function') {
      bridge.setMlFloatingWidget(false);
    }
  } catch {}
  return saveMlFloatingWidgetState(next);
}

export interface MlDomainCheckResult {
  status: 'idle' | 'checking' | 'reachable' | 'timeout' | 'offline';
  latencyMs: number | null;
  checkedAt: string;
  detail: string;
}

export async function checkMobileLegendsDomain(): Promise<MlDomainCheckResult> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    return {
      status: 'offline',
      latencyMs: null,
      checkedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      detail: 'Perangkat sedang offline — tidak dapat memeriksa com.mobilelegends.com.',
    };
  }

  const startedAt = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);
  try {
    await fetch(`https://com.mobilelegends.com/?_chk=${Date.now()}`, {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
      signal: controller.signal,
    });
    const elapsed = Math.max(1, Math.round(performance.now() - startedAt));
    return {
      status: 'reachable',
      latencyMs: elapsed,
      checkedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      detail: `com.mobilelegends.com merespons (${elapsed} ms).`,
    };
  } catch {
    const elapsed = Math.max(1, Math.round(performance.now() - startedAt));
    return {
      status: 'timeout',
      latencyMs: elapsed,
      checkedAt: new Date().toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      detail: 'Domain com.mobilelegends.com tidak merespons atau diblokir jaringan/browser.',
    };
  } finally {
    clearTimeout(timer);
  }
}

export function useMlFloatingWidget() {
  const [state, setState] = useState<MlFloatingWidgetState>(() => loadMlFloatingWidgetState());

  useEffect(() => {
    const handleLocalUpdate = (ev: Event) => {
      const detail = (ev as CustomEvent<MlFloatingWidgetState>)?.detail;
      setState(detail || loadMlFloatingWidgetState());
    };

    const handleNativeSync = (ev: Event) => {
      const d = (
        ev as CustomEvent<{
          enabled?: boolean;
          hidden?: boolean;
          size?: MlWidgetSize;
          activeToolsJson?: string;
        }>
      )?.detail;
      if (!d) return;
      const current = loadMlFloatingWidgetState();
      let syncedTools = current.activeTools;
      if (typeof d.activeToolsJson === 'string' && d.activeToolsJson.trim().startsWith('{')) {
        try {
          syncedTools = sanitizeActiveTools(JSON.parse(d.activeToolsJson), current.activeTools);
        } catch {}
      }
      const merged: MlFloatingWidgetState = {
        ...current,
        ...(typeof d.enabled === 'boolean' ? { enabled: d.enabled } : {}),
        ...(typeof d.hidden === 'boolean' ? { hidden: d.hidden } : {}),
        ...(d.size === 'small' || d.size === 'medium' || d.size === 'large' ? { size: d.size } : {}),
        activeTools: syncedTools,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem(RW_FEATURES_STORAGE_KEY, JSON.stringify(merged.activeTools));
      } catch {}
      setState(merged);
      window.dispatchEvent(
        new CustomEvent(RW_FEATURES_UPDATE_EVENT, { detail: merged.activeTools })
      );
    };

    const handleVnAiSync = (ev: Event) => {
      const d = (ev as CustomEvent<{ active?: boolean }>)?.detail;
      if (!d || typeof d.active !== 'boolean') return;
      const current = loadMlFloatingWidgetState();
      if (current.activeTools.vn_ai === d.active) return;
      const merged: MlFloatingWidgetState = {
        ...current,
        activeTools: {
          ...current.activeTools,
          vn_ai: d.active,
        },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
        localStorage.setItem(RW_FEATURES_STORAGE_KEY, JSON.stringify(merged.activeTools));
      } catch {}
      setState(merged);
      window.dispatchEvent(
        new CustomEvent(RW_FEATURES_UPDATE_EVENT, { detail: merged.activeTools })
      );
    };

    window.addEventListener(UPDATE_EVENT, handleLocalUpdate);
    window.addEventListener('ze-native-ml-widget-sync', handleNativeSync);
    window.addEventListener('ze-native-vn-ai-sync', handleVnAiSync);
    return () => {
      window.removeEventListener(UPDATE_EVENT, handleLocalUpdate);
      window.removeEventListener('ze-native-ml-widget-sync', handleNativeSync);
      window.removeEventListener('ze-native-vn-ai-sync', handleVnAiSync);
    };
  }, []);

  const patchState = useCallback((patch: Partial<MlFloatingWidgetState>) => {
    const current = loadMlFloatingWidgetState();
    const next: MlFloatingWidgetState = {
      ...current,
      ...patch,
    };
    return saveMlFloatingWidgetState(next, { syncRwFeatures: Boolean(patch.activeTools) });
  }, []);

  const toggleTool = useCallback((id: MlFloatingMenuId) => {
    return toggleMlTool(id);
  }, []);

  return {
    state,
    patchState,
    toggleTool,
  };
}
