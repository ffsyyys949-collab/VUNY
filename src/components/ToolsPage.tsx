import React, { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Bug, ChevronRight, Gamepad2, Layers, Smartphone, Wrench } from 'lucide-react';
import { getHomeThemeTokens, useHomeUiConfig } from '../contexts/homeUiConfig.ts';

interface ToolsPageProps {
  onBack: () => void;
  onOpenBug: () => void;
  onOpenToolsMl: () => void;
  onOpenVnPanel: () => void;
}

interface NavigatorConnectionLike {
  effectiveType?: string;
  downlink?: number;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface BatteryManagerLike {
  level: number;
  charging: boolean;
  addEventListener?: (type: string, listener: () => void) => void;
  removeEventListener?: (type: string, listener: () => void) => void;
}

interface DeviceInfoState {
  deviceModel: string;
  osBrowser: string;
  screen: string;
  ram: string;
  cpuCores: string;
  battery: string;
  network: string;
  languageTimezone: string;
}

const UNAVAILABLE = 'Tidak tersedia';

function parseDeviceModel(ua: string, highEntropyModel?: string): string {
  if (highEntropyModel && highEntropyModel.trim()) {
    return highEntropyModel.trim();
  }
  if (!ua) return UNAVAILABLE;

  if (/iPhone/i.test(ua)) return 'Apple iPhone';
  if (/iPad/i.test(ua)) return 'Apple iPad';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Apple Mac';

  const androidMatch = ua.match(/Android\s[^;)]+;\s*([^;)]+?)(?:\s+Build\/|\))/i);
  if (androidMatch && androidMatch[1]) {
    const candidate = androidMatch[1].trim();
    if (candidate && candidate.toUpperCase() !== 'K' && candidate.toLowerCase() !== 'wv') {
      return candidate;
    }
    return 'Android Device';
  }

  if (/Windows/i.test(ua)) return 'Windows PC';
  if (/CrOS/i.test(ua)) return 'Chromebook';
  if (/Linux/i.test(ua)) return 'Linux Device';

  return UNAVAILABLE;
}

function parseOsBrowser(ua: string): string {
  if (!ua) return UNAVAILABLE;

  let os = '';
  const androidVer = ua.match(/Android\s([0-9.]+)/i);
  const iosVer = ua.match(/(?:iPhone|CPU)\sOS\s([0-9_]+)/i);
  const macVer = ua.match(/Mac OS X\s([0-9_]+)/i);
  const winVer = ua.match(/Windows NT\s([0-9.]+)/i);

  if (androidVer) {
    os = `Android ${androidVer[1]}`;
  } else if (iosVer) {
    os = `iOS ${iosVer[1].replace(/_/g, '.')}`;
  } else if (winVer) {
    const nt = winVer[1];
    os = nt === '10.0' ? 'Windows 10/11' : nt === '6.3' ? 'Windows 8.1' : nt === '6.1' ? 'Windows 7' : `Windows NT ${nt}`;
  } else if (macVer) {
    os = `macOS ${macVer[1].replace(/_/g, '.')}`;
  } else if (/CrOS/i.test(ua)) {
    os = 'ChromeOS';
  } else if (/Linux/i.test(ua)) {
    os = 'Linux';
  }

  let browser = '';
  const edge = ua.match(/Edg(?:A|iOS)?\/([0-9.]+)/i);
  const opera = ua.match(/(?:OPR|Opera)\/([0-9.]+)/i);
  const samsung = ua.match(/SamsungBrowser\/([0-9.]+)/i);
  const firefox = ua.match(/(?:Firefox|FxiOS)\/([0-9.]+)/i);
  const chrome = ua.match(/(?:Chrome|CriOS)\/([0-9.]+)/i);
  const safari = ua.match(/Version\/([0-9.]+).*Safari/i);

  if (edge) browser = `Edge ${edge[1].split('.')[0]}`;
  else if (opera) browser = `Opera ${opera[1].split('.')[0]}`;
  else if (samsung) browser = `Samsung Internet ${samsung[1].split('.')[0]}`;
  else if (firefox) browser = `Firefox ${firefox[1].split('.')[0]}`;
  else if (chrome) browser = `Chrome ${chrome[1].split('.')[0]}`;
  else if (safari) browser = `Safari ${safari[1].split('.')[0]}`;

  if (/; wv\)/i.test(ua) && browser) {
    browser = `${browser} (WebView)`;
  }

  if (os && browser) return `${os} / ${browser}`;
  return os || browser || UNAVAILABLE;
}

function readScreenInfo(): string {
  if (typeof window === 'undefined' || !window.screen) return UNAVAILABLE;
  const { width, height } = window.screen;
  if (!width || !height) return UNAVAILABLE;
  const dpr = typeof window.devicePixelRatio === 'number' && window.devicePixelRatio > 0
    ? Number(window.devicePixelRatio.toFixed(2))
    : 1;
  return `${width} × ${height} (${dpr}x DPR)`;
}

function readRamInfo(): string {
  if (typeof navigator === 'undefined') return UNAVAILABLE;
  const mem = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  return typeof mem === 'number' && mem > 0 ? `${mem} GB` : UNAVAILABLE;
}

function readCpuInfo(): string {
  if (typeof navigator === 'undefined') return UNAVAILABLE;
  const cores = navigator.hardwareConcurrency;
  return typeof cores === 'number' && cores > 0 ? `${cores} Cores` : UNAVAILABLE;
}

function readNetworkInfo(): string {
  if (typeof navigator === 'undefined') return UNAVAILABLE;
  const nav = navigator as Navigator & {
    connection?: NavigatorConnectionLike;
    mozConnection?: NavigatorConnectionLike;
    webkitConnection?: NavigatorConnectionLike;
  };
  const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
  if (!conn || !conn.effectiveType) return UNAVAILABLE;
  if (navigator.onLine === false) return 'Offline';
  return conn.effectiveType.toUpperCase();
}

function readLanguageTimezone(): string {
  const lang = typeof navigator !== 'undefined' && navigator.language ? navigator.language : '';
  let tz = '';
  try {
    tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
  } catch {
    tz = '';
  }
  if (lang && tz) return `${lang} / ${tz}`;
  return lang || tz || UNAVAILABLE;
}

function formatBattery(battery: BatteryManagerLike): string {
  if (typeof battery.level !== 'number' || Number.isNaN(battery.level)) return UNAVAILABLE;
  const pct = Math.round(battery.level * 100);
  const status = battery.charging ? 'Charging' : 'Tidak charging';
  return `${pct}% · ${status}`;
}

export function ToolsPage({
  onBack,
  onOpenBug,
  onOpenToolsMl,
  onOpenVnPanel,
}: ToolsPageProps) {
  const { config: homeUiConfig } = useHomeUiConfig();

  const [deviceInfo, setDeviceInfo] = useState<DeviceInfoState>(() => {
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    return {
      deviceModel: parseDeviceModel(ua),
      osBrowser: parseOsBrowser(ua),
      screen: readScreenInfo(),
      ram: readRamInfo(),
      cpuCores: readCpuInfo(),
      battery: UNAVAILABLE,
      network: readNetworkInfo(),
      languageTimezone: readLanguageTimezone(),
    };
  });

  useEffect(() => {
    let active = true;
    const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';

    // Check high-entropy model when supported by browser
    const navWithUAData = navigator as Navigator & {
      userAgentData?: {
        getHighEntropyValues?: (hints: string[]) => Promise<{ model?: string }>;
      };
    };
    if (navWithUAData?.userAgentData?.getHighEntropyValues) {
      navWithUAData.userAgentData
        .getHighEntropyValues(['model'])
        .then((values) => {
          if (!active) return;
          if (values?.model && values.model.trim()) {
            setDeviceInfo((prev) => ({
              ...prev,
              deviceModel: parseDeviceModel(ua, values.model),
            }));
          }
        })
        .catch(() => {});
    }

    // Screen live updates
    const handleScreenChange = () => {
      if (!active) return;
      setDeviceInfo((prev) => ({ ...prev, screen: readScreenInfo() }));
    };
    window.addEventListener('resize', handleScreenChange);
    window.addEventListener('orientationchange', handleScreenChange);

    // Network live updates
    const nav = navigator as Navigator & {
      connection?: NavigatorConnectionLike;
      mozConnection?: NavigatorConnectionLike;
      webkitConnection?: NavigatorConnectionLike;
    };
    const conn = nav.connection || nav.mozConnection || nav.webkitConnection;
    const handleNetworkChange = () => {
      if (!active) return;
      setDeviceInfo((prev) => ({ ...prev, network: readNetworkInfo() }));
    };
    conn?.addEventListener?.('change', handleNetworkChange);
    window.addEventListener('online', handleNetworkChange);
    window.addEventListener('offline', handleNetworkChange);

    // Battery API live updates
    let batteryManager: BatteryManagerLike | null = null;
    const handleBatteryChange = () => {
      if (!active || !batteryManager) return;
      setDeviceInfo((prev) => ({ ...prev, battery: formatBattery(batteryManager!) }));
    };
    const navWithBattery = navigator as Navigator & {
      getBattery?: () => Promise<BatteryManagerLike>;
    };
    if (typeof navWithBattery.getBattery === 'function') {
      navWithBattery
        .getBattery()
        .then((bm) => {
          if (!active || !bm) return;
          batteryManager = bm;
          setDeviceInfo((prev) => ({ ...prev, battery: formatBattery(bm) }));
          bm.addEventListener?.('levelchange', handleBatteryChange);
          bm.addEventListener?.('chargingchange', handleBatteryChange);
        })
        .catch(() => {});
    }

    return () => {
      active = false;
      window.removeEventListener('resize', handleScreenChange);
      window.removeEventListener('orientationchange', handleScreenChange);
      conn?.removeEventListener?.('change', handleNetworkChange);
      window.removeEventListener('online', handleNetworkChange);
      window.removeEventListener('offline', handleNetworkChange);
      batteryManager?.removeEventListener?.('levelchange', handleBatteryChange);
      batteryManager?.removeEventListener?.('chargingchange', handleBatteryChange);
    };
  }, []);

  const homeTokens = useMemo(
    () =>
      getHomeThemeTokens(
        homeUiConfig.themeId,
        homeUiConfig.boxStyle,
        homeUiConfig.shadowIntensity,
        homeUiConfig.shadowThickness
      ),
    [
      homeUiConfig.themeId,
      homeUiConfig.boxStyle,
      homeUiConfig.shadowIntensity,
      homeUiConfig.shadowThickness,
    ]
  );

  const items = [
    {
      id: 'bug',
      title: 'BUG',
      subtitle: 'Kirim Bug & Pairing WhatsApp',
      Icon: Bug,
      onClick: onOpenBug,
    },
    {
      id: 'tools-ml',
      title: 'TOOLS ML',
      subtitle: 'Suite Kontrol & Tools Mobile Legends',
      Icon: Gamepad2,
      onClick: onOpenToolsMl,
    },
    {
      id: 'vn-panel',
      title: 'VN PANEL',
      subtitle: 'Panel Pterodactyl & Deploy Server',
      Icon: Layers,
      onClick: onOpenVnPanel,
    },
  ];

  const deviceRows = [
    { label: 'Device / Model', value: deviceInfo.deviceModel },
    { label: 'OS / Browser', value: deviceInfo.osBrowser },
    { label: 'Screen', value: deviceInfo.screen },
    { label: 'RAM', value: deviceInfo.ram },
    { label: 'CPU Cores', value: deviceInfo.cpuCores },
    { label: 'Battery', value: deviceInfo.battery },
    { label: 'Network', value: deviceInfo.network },
    { label: 'Language / Timezone', value: deviceInfo.languageTimezone },
  ];

  return (
    <div
      style={{
        '--ze-theme-accent': homeTokens.accentColor,
      } as React.CSSProperties}
      className="min-h-screen bg-transparent text-white pb-28 select-none"
    >
      <header
        className="sticky top-0 z-30 px-3.5 py-3 flex items-center gap-3 backdrop-blur-md bg-[#0a0a0c]/75"
      >
        <button
          type="button"
          onClick={onBack}
          className="w-9 h-9 rounded-full bg-black/60 flex items-center justify-center text-white cursor-pointer shrink-0 active:scale-95 transition"
          aria-label="Kembali ke Beranda"
        >
          <ArrowLeft size={18} className="text-white" style={{ color: '#FFFFFF' }} />
        </button>

        <div className="flex items-center gap-2.5 min-w-0 flex-1">
          <Wrench
            size={18}
            className="text-white shrink-0"
            style={{
              color: '#FFFFFF',
              background: 'transparent',
              backgroundColor: 'transparent',
              border: 'none',
              boxShadow: 'none',
              outline: 'none',
            }}
            strokeWidth={2}
          />
          <h1
            className="text-[18px] font-bold tracking-tight truncate text-white"
            style={{
              fontFamily: "'Poppins', sans-serif",
            }}
          >
            TOOLS
          </h1>
        </div>
      </header>

      <main className="px-3.5 pt-4 space-y-2.5 max-w-xl mx-auto">
        {items.map((item) => {
          const Icon = item.Icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={item.onClick}
              className="w-full px-3.5 py-3 rounded-2xl bg-[#0a0a0c]/80 hover:bg-[#121216]/85 flex items-center justify-between gap-3 text-left cursor-pointer active:scale-[0.985] transition"
            >
              <div className="flex items-center gap-3 min-w-0 flex-1">
                <Icon
                  size={22}
                  className="text-white shrink-0"
                  style={{
                    color: '#FFFFFF',
                    background: 'transparent',
                    backgroundColor: 'transparent',
                    border: 'none',
                    boxShadow: 'none',
                    outline: 'none',
                  }}
                  strokeWidth={1.85}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-bold truncate text-white">
                    {item.title}
                  </p>
                  <p className="text-[11px] truncate mt-0.5 text-white/60">
                    {item.subtitle}
                  </p>
                </div>
              </div>

              <ChevronRight size={16} className="text-white/65 shrink-0" strokeWidth={1.75} />
            </button>
          );
        })}

        <section
          aria-label="DEVICE INFO"
          className="w-full px-3.5 py-3.5 rounded-2xl bg-[#0a0a0c]/80"
        >
          <div className="flex items-center gap-2.5 pb-2.5 border-b border-white/[0.08]">
            <Smartphone
              size={18}
              className="text-white shrink-0"
              style={{
                color: '#FFFFFF',
                background: 'transparent',
                backgroundColor: 'transparent',
                border: 'none',
                boxShadow: 'none',
                outline: 'none',
              }}
              strokeWidth={1.85}
            />
            <h2 className="text-[14px] font-bold tracking-tight text-white">
              DEVICE INFO
            </h2>
          </div>

          <div className="divide-y divide-white/[0.06]">
            {deviceRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="text-[12px] text-white/60 shrink-0">
                  {row.label}
                </span>
                <span className="text-[12px] font-semibold text-white text-right min-w-0 break-words">
                  {row.value}
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
