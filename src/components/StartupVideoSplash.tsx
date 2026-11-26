import React, { useEffect, useRef, useState, useCallback } from 'react';

export const STARTUP_INTRO_VIDEO_SRC =
  '/assets/aistudio/quality_restoration_20261126133957985_68143d1d.mp4';

type SplashPhase = 'playing' | 'fading-to-black' | 'black-hold' | 'revealing-app';

declare global {
  interface Window {
    __zeSplashCovering?: boolean;
  }
}

function broadcastSplashCovering(covering: boolean) {
  if (typeof window === 'undefined') return;
  window.__zeSplashCovering = covering;
  try {
    window.dispatchEvent(new CustomEvent('ze-splash-state', { detail: { covering } }));
  } catch {}
}

export const StartupVideoSplash: React.FC<{ onComplete: () => void }> = ({ onComplete }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const exitingRef = useRef(false);
  const completedRef = useRef(false);
  const timersRef = useRef<number[]>([]);
  const rafRef = useRef<number | null>(null);

  const [phase, setPhase] = useState<SplashPhase>('playing');
  const [showVideoLayer, setShowVideoLayer] = useState(true);
  const [curtainOpacity, setCurtainOpacity] = useState(0);
  const [curtainDurationMs, setCurtainDurationMs] = useState(500);
  const [skipVisible, setSkipVisible] = useState(true);

  const clearAllTimers = useCallback(() => {
    timersRef.current.forEach((id) => window.clearTimeout(id));
    timersRef.current = [];
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const finishSplash = useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    clearAllTimers();
    broadcastSplashCovering(false);
    onComplete();
  }, [clearAllTimers, onComplete]);

  const startDarkOutro = useCallback(
    (isSkip: boolean) => {
      if (exitingRef.current || completedRef.current) return;
      exitingRef.current = true;

      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }

      const fadeBlackMs = isSkip ? 320 : 500;
      const holdBlackMs = isSkip ? 90 : 120;
      const revealMs = isSkip ? 480 : 550;

      setSkipVisible(false);
      setCurtainDurationMs(fadeBlackMs);
      setPhase('fading-to-black');

      // Double rAF ensures transitionDuration & initial opacity:0 commit before animating 0 -> 1
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (completedRef.current) return;
          setCurtainOpacity(1);
        });
      });

      // Gently fade audio volume down alongside the dark curtain
      const vid = videoRef.current;
      if (vid && !vid.muted && vid.volume > 0) {
        const startVol = vid.volume;
        const fadeStart = performance.now();
        const stepVolume = (now: number) => {
          const t = Math.min(1, (now - fadeStart) / fadeBlackMs);
          if (videoRef.current && exitingRef.current) {
            try {
              videoRef.current.volume = Math.max(0, startVol * (1 - t));
            } catch {}
          }
          if (t < 1 && !completedRef.current) {
            window.requestAnimationFrame(stepVolume);
          }
        };
        window.requestAnimationFrame(stepVolume);
      }

      const holdTimer = window.setTimeout(() => {
        if (completedRef.current) return;
        setPhase('black-hold');

        if (videoRef.current) {
          try {
            videoRef.current.pause();
          } catch {}
        }
        // Unmount video behind solid black screen and wake main background layer
        setShowVideoLayer(false);
        broadcastSplashCovering(false);

        const revealTimer = window.setTimeout(() => {
          if (completedRef.current) return;
          setCurtainDurationMs(revealMs);
          setPhase('revealing-app');

          window.requestAnimationFrame(() => {
            window.requestAnimationFrame(() => {
              if (completedRef.current) return;
              setCurtainOpacity(0);
            });
          });

          const doneTimer = window.setTimeout(() => {
            finishSplash();
          }, revealMs + 50);
          timersRef.current.push(doneTimer);
        }, holdBlackMs);

        timersRef.current.push(revealTimer);
      }, fadeBlackMs + 30);

      timersRef.current.push(holdTimer);
    },
    [finishSplash]
  );

  // Tell VideoBackground not to compete for hardware video decoding during splash playback
  useEffect(() => {
    broadcastSplashCovering(true);
    return () => {
      broadcastSplashCovering(false);
      clearAllTimers();
    };
  }, [clearAllTimers]);

  // Start playback immediately (try with sound for APK Native; auto-fallback to muted on strict browsers)
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    let cancelled = false;

    const tryPlay = () => {
      if (cancelled || exitingRef.current) return;
      try {
        vid.volume = 1;
        vid.muted = false;
        const p = vid.play();
        if (p && typeof p.catch === 'function') {
          p.catch(() => {
            if (cancelled || exitingRef.current) return;
            try {
              vid.muted = true;
              vid.play().catch(() => {});
            } catch {}
          });
        }
      } catch {
        try {
          vid.muted = true;
          vid.play().catch(() => {});
        } catch {}
      }
    };

    tryPlay();

    // 60fps monitor to catch precisely the last 0.50 seconds before video end
    let startedPlayback = false;
    const startedAt = performance.now();

    const tick = () => {
      if (cancelled || exitingRef.current) return;
      const v = videoRef.current;
      if (v) {
        if (v.currentTime > 0.05) {
          startedPlayback = true;
        }
        const dur = v.duration;
        if (Number.isFinite(dur) && dur > 0.6 && v.currentTime > 0.1) {
          const remaining = dur - v.currentTime;
          if (remaining <= 0.5) {
            startDarkOutro(false);
            return;
          }
        }
      }

      const elapsed = performance.now() - startedAt;
      // Safety net so a broken or blocked decoder never traps the user
      if ((!startedPlayback && elapsed > 3000) || elapsed > 12000) {
        startDarkOutro(false);
        return;
      }

      rafRef.current = window.requestAnimationFrame(tick);
    };

    rafRef.current = window.requestAnimationFrame(tick);

    return () => {
      cancelled = true;
      if (rafRef.current !== null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [startDarkOutro]);

  const handleVideoTap = () => {
    const v = videoRef.current;
    if (v && v.muted && !exitingRef.current) {
      try {
        v.muted = false;
        v.volume = 1;
      } catch {}
    }
  };

  const handleSkipClick = (e: React.MouseEvent | React.TouchEvent) => {
    e.stopPropagation();
    startDarkOutro(true);
  };

  return (
    <div
      onClick={handleVideoTap}
      className={`fixed inset-0 w-screen h-[100dvh] z-[99999] overflow-hidden select-none ${
        phase === 'revealing-app' ? 'pointer-events-none' : 'pointer-events-auto'
      }`}
      style={{
        backgroundColor: showVideoLayer ? '#000000' : 'transparent',
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
      }}
      aria-label="Loading Video"
    >
      {/* Fullscreen Cover Video Layer */}
      {showVideoLayer && (
        <video
          ref={videoRef}
          src={STARTUP_INTRO_VIDEO_SRC}
          autoPlay
          playsInline
          preload="auto"
          disablePictureInPicture
          disableRemotePlayback
          data-bg-video="true"
          onCanPlay={() => {
            if (!exitingRef.current && videoRef.current?.paused) {
              videoRef.current.play().catch(() => {
                if (videoRef.current) {
                  videoRef.current.muted = true;
                  videoRef.current.play().catch(() => {});
                }
              });
            }
          }}
          onEnded={() => startDarkOutro(false)}
          onError={() => startDarkOutro(true)}
          className="absolute inset-0 w-full h-full object-cover object-center block pointer-events-none"
          style={{
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
        />
      )}

      {/* Smooth Fade-to-Black & App Reveal Curtain */}
      <div
        aria-hidden="true"
        className="absolute inset-0 w-full h-full bg-black pointer-events-none"
        style={{
          opacity: curtainOpacity,
          transitionProperty: 'opacity',
          transitionDuration: `${curtainDurationMs}ms`,
          transitionTimingFunction:
            phase === 'revealing-app'
              ? 'cubic-bezier(0.22, 1, 0.36, 1)'
              : 'cubic-bezier(0.4, 0, 0.2, 1)',
          willChange: 'opacity',
          transform: 'translate3d(0, 0, 0)',
        }}
      />

      {/* Compact Transparent SKIP Button at Bottom-Right Corner (clickable from second 0) */}
      {showVideoLayer && (
        <button
          type="button"
          onClick={handleSkipClick}
          className={`fixed z-30 flex items-center gap-1 px-3 py-1.5 rounded-full bg-black/35 hover:bg-black/55 active:scale-95 border border-white/25 text-white/90 text-[11px] font-semibold tracking-wider uppercase backdrop-blur-sm cursor-pointer transition-opacity duration-200 ${
            skipVisible ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
          }`}
          style={{
            bottom: 'max(18px, env(safe-area-inset-bottom, 18px))',
            right: 'max(16px, env(safe-area-inset-right, 16px))',
            touchAction: 'manipulation',
          }}
          aria-label="Skip Intro Video"
        >
          <span>SKIP</span>
          <span aria-hidden="true" className="text-[11px] leading-none opacity-85">
            &gt;&gt;
          </span>
        </button>
      )}
    </div>
  );
};

export default StartupVideoSplash;
