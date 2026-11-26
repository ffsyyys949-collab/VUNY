import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  Eye,
  EyeOff,
  Gamepad2,
  GripHorizontal,
  Info,
  Maximize2,
  Minimize2,
  RefreshCw,
  X,
} from 'lucide-react';
import {
  checkMobileLegendsDomain,
  closeMlFloatingWidget,
  ML_DOMAIN_RESULT_EVENT,
  ML_FLOATING_MENUS,
  MlDomainCheckResult,
  MlFloatingMenuId,
  MlWidgetSize,
  useMlFloatingWidget,
} from '../contexts/mlFloatingWidgetState.ts';

const SIZE_CONFIG: Record<
  MlWidgetSize,
  {
    bubblePx: number;
    bubbleTextClass: string;
    panelWidthPx: number;
    headerTextClass: string;
    menuTitleClass: string;
    menuSubClass: string;
    cardPaddingClass: string;
  }
> = {
  small: {
    bubblePx: 42,
    bubbleTextClass: 'text-[10px]',
    panelWidthPx: 244,
    headerTextClass: 'text-[11px]',
    menuTitleClass: 'text-[11px]',
    menuSubClass: 'text-[9px]',
    cardPaddingClass: 'p-2',
  },
  medium: {
    bubblePx: 52,
    bubbleTextClass: 'text-[11px]',
    panelWidthPx: 284,
    headerTextClass: 'text-[12px]',
    menuTitleClass: 'text-[12px]',
    menuSubClass: 'text-[10px]',
    cardPaddingClass: 'p-2.5',
  },
  large: {
    bubblePx: 62,
    bubbleTextClass: 'text-[13px]',
    panelWidthPx: 326,
    headerTextClass: 'text-[13px]',
    menuTitleClass: 'text-[13px]',
    menuSubClass: 'text-[11px]',
    cardPaddingClass: 'p-3',
  },
};

function clampPosition(x: number, y: number, width: number, height: number) {
  if (typeof window === 'undefined') return { x, y };
  const margin = 8;
  const maxX = Math.max(margin, window.innerWidth - width - margin);
  const maxY = Math.max(margin, window.innerHeight - height - margin);
  return {
    x: Math.min(Math.max(margin, x), maxX),
    y: Math.min(Math.max(margin, y), maxY),
  };
}

export function MlFloatingWidget() {
  const { state, patchState, toggleTool } = useMlFloatingWidget();
  const [domainCheck, setDomainCheck] = useState<MlDomainCheckResult>({
    status: 'idle',
    latencyMs: null,
    checkedAt: '',
    detail: 'Siap mengecek status koneksi ke com.mobilelegends.com.',
  });

  const dragRef = useRef<{
    active: boolean;
    moved: boolean;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startX: number;
    startY: number;
    lastDx: number;
    lastDy: number;
    rafId: number;
  }>({
    active: false,
    moved: false,
    pointerId: -1,
    startClientX: 0,
    startClientY: 0,
    startX: 0,
    startY: 0,
    lastDx: 0,
    lastDy: 0,
    rafId: 0,
  });

  const rootDragRef = useRef<HTMLDivElement | null>(null);
  const sizeTokens = SIZE_CONFIG[state.size];

  const selectedMenu = useMemo(
    () => ML_FLOATING_MENUS.find((item) => item.id === state.selectedMenuId) || null,
    [state.selectedMenuId]
  );

  const activeMenus = useMemo(
    () => ML_FLOATING_MENUS.filter((m) => Boolean(state.activeTools?.[m.id])),
    [state.activeTools]
  );
  const activeCount = activeMenus.length;

  const runDomainCheck = async () => {
    setDomainCheck((prev) => ({
      ...prev,
      status: 'checking',
      detail: 'Memeriksa com.mobilelegends.com...',
    }));
    const result = await checkMobileLegendsDomain();
    setDomainCheck(result);
  };

  useEffect(() => {
    const handleDomainEvent = (ev: Event) => {
      const detail = (ev as CustomEvent<MlDomainCheckResult>)?.detail;
      if (detail) setDomainCheck(detail);
    };
    window.addEventListener(ML_DOMAIN_RESULT_EVENT, handleDomainEvent);
    return () => window.removeEventListener(ML_DOMAIN_RESULT_EVENT, handleDomainEvent);
  }, []);

  useEffect(() => {
    if (state.enabled && state.expanded && state.selectedMenuId === 'matchmaking_bot') {
      runDomainCheck();
    }
  }, [state.enabled, state.expanded, state.selectedMenuId]);

  useEffect(() => {
    if (!state.enabled) return;
    const handleResize = () => {
      const boxW = state.expanded ? sizeTokens.panelWidthPx : sizeTokens.bubblePx;
      const boxH = state.expanded ? 380 : sizeTokens.bubblePx;
      const clamped = clampPosition(state.position.x, state.position.y, boxW, boxH);
      if (clamped.x !== state.position.x || clamped.y !== state.position.y) {
        patchState({ position: clamped });
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [
    state.enabled,
    state.expanded,
    state.position.x,
    state.position.y,
    sizeTokens.bubblePx,
    sizeTokens.panelWidthPx,
    patchState,
  ]);

  useEffect(() => {
    return () => {
      if (dragRef.current.rafId) {
        cancelAnimationFrame(dragRef.current.rafId);
      }
    };
  }, []);

  const hasNativeOverlay =
    typeof window !== 'undefined' && Boolean(window.ZeNative?.syncMlFloatingWidget);
  if (!state.enabled || hasNativeOverlay) return null;

  const boxWidth = state.hidden
    ? 44
    : state.expanded
    ? sizeTokens.panelWidthPx
    : sizeTokens.bubblePx;
  const boxHeight = state.hidden
    ? 32
    : state.expanded
    ? Math.min(typeof window !== 'undefined' ? window.innerHeight - 24 : 420, 420)
    : sizeTokens.bubblePx;
  const clampedPos = clampPosition(state.position.x, state.position.y, boxWidth, boxHeight);

  const handleStepSize = (direction: 'smaller' | 'larger') => {
    const order: MlWidgetSize[] = ['small', 'medium', 'large'];
    const idx = order.indexOf(state.size);
    const nextIdx =
      direction === 'smaller' ? Math.max(0, idx - 1) : Math.min(order.length - 1, idx + 1);
    if (nextIdx !== idx) {
      patchState({ size: order[nextIdx] });
    }
  };

  const handlePointerDown = (e: React.PointerEvent) => {
    const target = e.target as HTMLElement | null;
    if (target?.closest('[data-ml-widget-no-drag="true"]')) return;

    dragRef.current = {
      active: true,
      moved: false,
      pointerId: e.pointerId,
      startClientX: e.clientX,
      startClientY: e.clientY,
      startX: clampedPos.x,
      startY: clampedPos.y,
      lastDx: 0,
      lastDy: 0,
      rafId: 0,
    };
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {}
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const rawDx = e.clientX - dragRef.current.startClientX;
    const rawDy = e.clientY - dragRef.current.startClientY;
    if (Math.abs(rawDx) > 5 || Math.abs(rawDy) > 5) {
      dragRef.current.moved = true;
    }
    if (!dragRef.current.moved) return;

    const clamped = clampPosition(
      dragRef.current.startX + rawDx,
      dragRef.current.startY + rawDy,
      boxWidth,
      boxHeight
    );
    const dx = clamped.x - dragRef.current.startX;
    const dy = clamped.y - dragRef.current.startY;
    dragRef.current.lastDx = dx;
    dragRef.current.lastDy = dy;

    if (!dragRef.current.rafId) {
      dragRef.current.rafId = requestAnimationFrame(() => {
        dragRef.current.rafId = 0;
        if (rootDragRef.current) {
          rootDragRef.current.style.transform = state.hidden
            ? `translate3d(0px, ${dragRef.current.lastDy}px, 0)`
            : `translate3d(${dragRef.current.lastDx}px, ${dragRef.current.lastDy}px, 0)`;
        }
      });
    }
  };

  const handlePointerUp = (e: React.PointerEvent, onClick?: () => void) => {
    if (!dragRef.current.active || dragRef.current.pointerId !== e.pointerId) return;
    const wasMoved = dragRef.current.moved;
    const finalDx = dragRef.current.lastDx;
    const finalDy = dragRef.current.lastDy;
    const startX = dragRef.current.startX;
    const startY = dragRef.current.startY;
    if (dragRef.current.rafId) {
      cancelAnimationFrame(dragRef.current.rafId);
      dragRef.current.rafId = 0;
    }
    dragRef.current.active = false;
    dragRef.current.pointerId = -1;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (rootDragRef.current) {
      rootDragRef.current.style.transform = '';
    }
    if (wasMoved) {
      const nextPos = clampPosition(startX + finalDx, startY + finalDy, boxWidth, boxHeight);
      patchState({ position: nextPos });
    } else if (onClick) {
      onClick();
    }
  };

  // =========================================================================
  // 1. HIDDEN STATE: Tiny monochrome black-transparent edge pill (unhide anytime)
  // =========================================================================
  if (state.hidden) {
    const snapRight =
      typeof window !== 'undefined' && clampedPos.x > window.innerWidth / 2;
    return (
      <div
        ref={rootDragRef}
        style={{
          left: snapRight ? undefined : 0,
          right: snapRight ? 0 : undefined,
          top: clampedPos.y,
          willChange: 'transform',
        }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) =>
          handlePointerUp(e, () => patchState({ hidden: false }))
        }
        className={`fixed z-[10050] select-none touch-none cursor-pointer flex items-center gap-1 px-2 py-1.5 bg-[#0a0a0c]/85 border ${
          activeCount > 0 ? 'border-red-500/70' : 'border-white/15'
        } text-white/85 hover:text-white shadow-lg ${
          snapRight ? 'rounded-l-full border-r-0' : 'rounded-r-full border-l-0'
        }`}
        title="Tampilkan Floating Widget ML"
      >
        <Eye size={12} className="text-white/80 shrink-0" />
        <span className="text-[10px] font-bold tracking-wider">ML</span>
        {activeCount > 0 && <span className="w-1.5 h-1.5 rounded-full bg-red-500" />}
      </div>
    );
  }

  // =========================================================================
  // 2. COLLAPSED STATE: Small draggable round black-transparent corner bubble
  // =========================================================================
  if (!state.expanded) {
    return (
      <div
        ref={rootDragRef}
        style={{
          left: clampedPos.x,
          top: clampedPos.y,
          width: sizeTokens.bubblePx,
          height: sizeTokens.bubblePx,
          willChange: 'transform',
        }}
        className="fixed z-[10050] select-none touch-none"
      >
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={(e) =>
            handlePointerUp(e, () => patchState({ expanded: true }))
          }
          className={`w-full h-full rounded-full bg-[#0a0a0c]/90 border flex flex-col items-center justify-center text-white cursor-grab active:cursor-grabbing active:scale-95 transition-transform duration-75 ${
            activeCount > 0
              ? 'border-red-500 shadow-[0_0_16px_rgba(239,68,68,0.5)]'
              : 'border-white/20 shadow-[0_8px_24px_rgba(0,0,0,0.65)]'
          }`}
          title="Buka Tools ML Floating Widget"
        >
          <Gamepad2 size={state.size === 'small' ? 14 : state.size === 'large' ? 20 : 17} className="text-white" />
          <span className={`${sizeTokens.bubbleTextClass} font-bold tracking-wider leading-none mt-0.5 text-white/90`}>
            ML
          </span>
        </div>

        {/* Active tools count indicator when tools are ON */}
        {activeCount > 0 && (
          <span
            className="absolute -bottom-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 border border-red-400/70 text-[9px] font-extrabold text-white flex items-center justify-center shadow-[0_0_8px_rgba(239,68,68,0.7)] pointer-events-none"
          >
            {activeCount}
          </span>
        )}

        {/* Small X button on corner of bubble to close widget anytime */}
        <button
          type="button"
          data-ml-widget-no-drag="true"
          onClick={(e) => {
            e.stopPropagation();
            closeMlFloatingWidget();
          }}
          className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#0a0a0c]/95 border border-white/25 text-white/80 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-75"
          aria-label="Tutup Floating Widget"
          title="Tutup Widget"
        >
          <X size={10} />
        </button>

        {/* Small Hide dot on bottom-left edge of bubble */}
        <button
          type="button"
          data-ml-widget-no-drag="true"
          onClick={(e) => {
            e.stopPropagation();
            patchState({ hidden: true });
          }}
          className="absolute -bottom-1 -left-1 w-5 h-5 rounded-full bg-[#0a0a0c]/95 border border-white/25 text-white/75 hover:text-white flex items-center justify-center cursor-pointer active:scale-90 transition-transform duration-75"
          aria-label="Sembunyikan Floating Widget"
          title="Hide Widget"
        >
          <EyeOff size={9} />
        </button>
      </div>
    );
  }

  // =========================================================================
  // 3. EXPANDED STATE: Black-transparent TOOLS ML panel with ON/OFF toggles
  // =========================================================================
  return (
    <div
      ref={rootDragRef}
      style={{
        left: clampedPos.x,
        top: clampedPos.y,
        width: sizeTokens.panelWidthPx,
        willChange: 'transform',
      }}
      className="fixed z-[10050] rounded-2xl bg-[#0a0a0c]/92 backdrop-blur-md border border-white/15 text-white shadow-[0_14px_40px_rgba(0,0,0,0.75)] overflow-hidden select-none"
    >
      {/* Draggable Header Bar */}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={(e) => handlePointerUp(e)}
        className="px-3 py-2.5 border-b border-white/[0.08] flex items-center justify-between gap-2 cursor-grab active:cursor-grabbing touch-none bg-black/35"
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <GripHorizontal size={14} className="text-white/50 shrink-0" />
          <Gamepad2 size={14} className="text-white shrink-0" />
          <span className={`${sizeTokens.headerTextClass} font-bold tracking-wide text-white truncate`}>
            TOOLS ML
          </span>
        </div>

        <div className="flex items-center gap-1 shrink-0" data-ml-widget-no-drag="true">
          <button
            type="button"
            onClick={() => handleStepSize('smaller')}
            disabled={state.size === 'small'}
            className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] disabled:opacity-35 border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
            title="Kecilin Widget"
            aria-label="Kecilin Widget"
          >
            <Minimize2 size={11} />
          </button>

          <button
            type="button"
            onClick={() => handleStepSize('larger')}
            disabled={state.size === 'large'}
            className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] disabled:opacity-35 border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
            title="Besarin Widget"
            aria-label="Besarin Widget"
          >
            <Maximize2 size={11} />
          </button>

          <button
            type="button"
            onClick={() => patchState({ hidden: true })}
            className="w-6 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center text-white/80 hover:text-white cursor-pointer"
            title="Hide Widget"
            aria-label="Hide Widget"
          >
            <EyeOff size={11} />
          </button>

          <button
            type="button"
            onClick={() => patchState({ expanded: false })}
            className="px-1.5 h-6 rounded-lg bg-white/[0.06] hover:bg-white/[0.14] border border-white/10 flex items-center justify-center text-[10px] font-bold text-white/80 hover:text-white cursor-pointer"
            title="Ciutkan jadi bulat"
            aria-label="Ciutkan jadi bulat"
          >
            –
          </button>

          <button
            type="button"
            onClick={() => closeMlFloatingWidget()}
            className="w-6 h-6 rounded-lg bg-white/[0.08] hover:bg-white/[0.18] border border-white/15 flex items-center justify-center text-white cursor-pointer"
            title="Tutup Widget (X)"
            aria-label="Tutup Widget"
          >
            <X size={12} />
          </button>
        </div>
      </div>

      {/* Body: Either 6 Menu Grid with ON/OFF Toggles OR Selected Info Panel */}
      <div className="p-2.5 max-h-[360px] overflow-y-auto no-scrollbar">
        {selectedMenu ? (
          <div className="space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => patchState({ selectedMenuId: null })}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/[0.07] hover:bg-white/[0.14] border border-white/10 text-[11px] font-semibold text-white/90 cursor-pointer"
              >
                <ChevronLeft size={13} />
                <span>Menu</span>
              </button>

              {/* Toggle directly inside info panel as well */}
              <button
                type="button"
                onClick={() => toggleTool(selectedMenu.id)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-extrabold cursor-pointer transition-colors ${
                  state.activeTools?.[selectedMenu.id]
                    ? 'bg-red-500/20 border-red-500 text-red-400 shadow-[0_0_10px_rgba(239,68,68,0.35)]'
                    : 'bg-white/[0.05] border-white/15 text-white/60'
                }`}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    state.activeTools?.[selectedMenu.id] ? 'bg-red-500' : 'bg-white/40'
                  }`}
                />
                <span>{state.activeTools?.[selectedMenu.id] ? 'AKTIF · ON' : 'NONAKTIF · OFF'}</span>
              </button>
            </div>

            <div
              className={`rounded-xl border p-3 space-y-2 ${
                state.activeTools?.[selectedMenu.id]
                  ? 'bg-red-500/[0.08] border-red-500/60 shadow-[0_0_12px_rgba(239,68,68,0.22)]'
                  : 'bg-white/[0.04] border-white/10'
              }`}
            >
              <div className="flex items-start gap-2">
                <Info size={14} className="text-white/75 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className={`${sizeTokens.menuTitleClass} font-bold text-white leading-snug`}>
                    {selectedMenu.title}
                  </p>
                  <p className={`${sizeTokens.menuSubClass} text-white/60 mt-0.5`}>
                    {selectedMenu.infoHeading}
                  </p>
                </div>
              </div>

              <ul className="space-y-1.5 pt-1 border-t border-white/[0.06]">
                {selectedMenu.tips.map((tip, idx) => (
                  <li
                    key={idx}
                    className={`${sizeTokens.menuSubClass} text-white/80 leading-relaxed flex items-start gap-1.5`}
                  >
                    <span className="text-white/45 shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>

              {selectedMenu.id === 'matchmaking_bot' && (
                <div className="pt-2 border-t border-white/[0.08] space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-semibold text-white/70">
                      Cek com.mobilelegends.com
                    </span>
                    <button
                      type="button"
                      onClick={runDomainCheck}
                      disabled={domainCheck.status === 'checking'}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-[10px] text-white/85 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw
                        size={10}
                        className={domainCheck.status === 'checking' ? 'animate-spin' : ''}
                      />
                      <span>Cek Otomatis</span>
                    </button>
                  </div>
                  <p className="text-[10px] text-white/65 leading-snug">
                    {domainCheck.detail}
                    {domainCheck.checkedAt ? ` (${domainCheck.checkedAt})` : ''}
                  </p>
                </div>
              )}

              <p className="text-[9.5px] text-white/50 pt-1.5 border-t border-white/[0.06] leading-snug">
                {selectedMenu.note}
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Status Bar of Active Tools */}
            <div
              className={`px-2.5 py-1.5 rounded-xl border flex items-center justify-between gap-2 ${
                activeCount > 0
                  ? 'bg-red-500/[0.1] border-red-500/45'
                  : 'bg-white/[0.03] border-white/10'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    activeCount > 0 ? 'bg-red-500 shadow-[0_0_6px_#ef4444]' : 'bg-white/35'
                  }`}
                />
                <span className="text-[10px] font-semibold truncate text-white/85">
                  {activeCount > 0
                    ? `Aktif: ${activeMenus.map((m) => m.title).join(', ')}`
                    : 'Semua fitur NONAKTIF'}
                </span>
              </div>
              <span
                className={`text-[9px] font-extrabold px-1.5 py-0.5 rounded shrink-0 ${
                  activeCount > 0
                    ? 'bg-red-500/20 text-red-400 border border-red-500/40'
                    : 'bg-white/[0.06] text-white/50 border border-white/10'
                }`}
              >
                {activeCount}/6 ON
              </span>
            </div>

            {/* 6 Cards Grid - Tap Card OR Corner Switch to Toggle ON/OFF */}
            <div className="grid grid-cols-2 gap-1.5">
              {ML_FLOATING_MENUS.map((menu, index) => {
                const isActive = Boolean(state.activeTools?.[menu.id]);
                return (
                  <div
                    key={menu.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => toggleTool(menu.id)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleTool(menu.id);
                      }
                    }}
                    className={`${sizeTokens.cardPaddingClass} rounded-xl border text-left flex flex-col justify-between transition-transform duration-75 active:scale-[0.97] cursor-pointer ${
                      isActive
                        ? 'bg-red-500/[0.12] border-red-500 shadow-[0_0_12px_rgba(239,68,68,0.45)] opacity-100'
                        : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/10 opacity-75 hover:opacity-100'
                    }`}
                  >
                    {/* Top Row: Number + LIVE Badge (if any) + Info (i) + ON/OFF Switch */}
                    <div className="flex items-center justify-between gap-1">
                      <div className="flex items-center gap-1">
                        <span
                          className={`text-[9px] font-bold ${
                            isActive ? 'text-red-400' : 'text-white/45'
                          }`}
                        >
                          0{index + 1}
                        </span>
                        {menu.badge && (
                          <span className="text-[8px] font-extrabold px-1 py-0.2 rounded bg-red-500/25 border border-red-500/40 text-red-300">
                            {menu.badge}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            patchState({ selectedMenuId: menu.id as MlFloatingMenuId });
                          }}
                          className="w-4 h-4 rounded-md bg-white/[0.06] hover:bg-white/[0.18] flex items-center justify-center text-white/55 hover:text-white cursor-pointer"
                          title={`Info & Tips ${menu.title}`}
                          aria-label={`Info & Tips ${menu.title}`}
                        >
                          <Info size={9} />
                        </button>

                        {/* ON/OFF Switch */}
                        <div
                          className={`w-7 h-3.5 rounded-full p-0.5 transition-colors flex items-center ${
                            isActive ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.6)]' : 'bg-white/20'
                          }`}
                        >
                          <div
                            className={`w-2.5 h-2.5 rounded-full bg-white transition-transform duration-150 ${
                              isActive ? 'translate-x-3.5' : 'translate-x-0'
                            }`}
                          />
                        </div>
                      </div>
                    </div>

                    {/* Title & Subtitle */}
                    <div className="mt-1.5">
                      <p className={`${sizeTokens.menuTitleClass} font-bold text-white leading-tight`}>
                        {menu.title}
                      </p>
                      <p className={`${sizeTokens.menuSubClass} text-white/55 mt-0.5 leading-tight line-clamp-2`}>
                        {menu.subtitle}
                      </p>
                    </div>

                    {/* Bottom Status Label */}
                    <div className="mt-1.5 pt-1 border-t border-white/[0.06] flex items-center justify-between">
                      <span
                        className={`text-[8.5px] font-extrabold tracking-wider ${
                          isActive ? 'text-red-400' : 'text-white/40'
                        }`}
                      >
                        {isActive ? 'AKTIF' : 'NONAKTIF'}
                      </span>
                      <span
                        className={`text-[8.5px] font-bold ${
                          isActive ? 'text-red-300' : 'text-white/35'
                        }`}
                      >
                        {isActive ? 'ON' : 'OFF'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {state.activeTools?.matchmaking_bot && domainCheck.status !== 'idle' && (
              <div className="px-2.5 py-1.5 rounded-lg bg-white/[0.04] border border-white/10 text-[9.5px] text-white/70">
                {domainCheck.detail}
              </div>
            )}

            <p className="text-[9px] text-center text-white/45 pt-0.5">
              Tap kartu/toggle untuk ON/OFF · Ikon (i) untuk info &amp; tips
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default MlFloatingWidget;
