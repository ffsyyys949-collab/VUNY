import React, { useState, useEffect, useRef } from 'react';
import {
  useTheme,
  EXTERNAL_BG_MAIN_VIDEO,
  EXTERNAL_BG_LIQUID_VIDEO,
  resolveExternalBgVideoUrl,
} from '../contexts/ThemeContext';

const VideoBackground = React.memo(function VideoBackground({ paused = false }: { paused?: boolean }) {
  const { theme } = useTheme();
  const [videoErrored, setVideoErrored] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const isCustomTheme = Boolean(theme?.isCustom);
  const isImageTheme = Boolean(
    theme?.mediaType === 'image' ||
      (theme?.mediaType !== 'video' &&
        theme?.video &&
        (/^data:image\//i.test(theme.video) ||
          /\.(png|jpe?g|webp|gif|bmp|avif)(\?.*)?$/i.test(theme.video)))
  );

  const primarySrc =
    theme?.id === 'minimal-dark'
      ? null
      : resolveExternalBgVideoUrl(theme?.video) || (isCustomTheme ? null : EXTERNAL_BG_MAIN_VIDEO);

  // Reset fallback state on theme or source change
  useEffect(() => {
    setVideoErrored(false);
  }, [theme?.id, primarySrc]);

  // Pause hidden video when occluded (e.g., startup splash, solid #0A0A0A Music page) or app backgrounded
  useEffect(() => {
    const syncPlayback = () => {
      const splashCovering = Boolean((window as unknown as { __zeSplashCovering?: boolean }).__zeSplashCovering);
      if (document.hidden || paused || splashCovering) {
        videoRef.current?.pause();
      } else if (!isImageTheme) {
        videoRef.current?.play().catch(() => {});
      }
    };
    syncPlayback();
    document.addEventListener('visibilitychange', syncPlayback);
    window.addEventListener('ze-splash-state', syncPlayback);
    return () => {
      document.removeEventListener('visibilitychange', syncPlayback);
      window.removeEventListener('ze-splash-state', syncPlayback);
    };
  }, [isImageTheme, paused]);

  const activeVideoSrc: string | null = isImageTheme || videoErrored ? null : primarySrc;

  return (
    <div
      id="global-fixed-bg-layer"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100%',
        height: '100vh',
        zIndex: -1,
        backgroundColor: '#0A0A0A',
        pointerEvents: 'none',
        overflow: 'hidden',
        transform: 'translate3d(0, 0, 0)',
        backfaceVisibility: 'hidden',
        WebkitBackfaceVisibility: 'hidden',
        contain: 'strict',
      }}
      className="fixed inset-0 w-screen h-screen overflow-hidden pointer-events-none select-none bg-[#0A0A0A]"
      aria-hidden="true"
    >
      {/* Only show default ripple still for default bw-liquid-water theme — NEVER behind custom themes */}
      {!isCustomTheme && !isImageTheme && theme?.id !== 'minimal-dark' && (
        <img
          src="/assets/bg_water_still.webp"
          alt=""
          decoding="sync"
          loading="eager"
          fetchPriority="high"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
          className="w-full h-full object-cover object-center pointer-events-none select-none"
        />
      )}

      {/* Custom Image Wallpaper Background Layer */}
      {isImageTheme && primarySrc && (
        <img
          key={primarySrc}
          src={primarySrc}
          alt=""
          decoding="async"
          loading="eager"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
          className="w-full h-full object-cover object-center pointer-events-none select-none"
        />
      )}

      {/* Background Video Layer - Global & Fixed */}
      {activeVideoSrc && (
        <video
          ref={videoRef}
          key={activeVideoSrc}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          poster={isCustomTheme ? undefined : '/assets/bg_water_still.webp'}
          disablePictureInPicture
          disableRemotePlayback
          data-bg-video="true"
          id="bg-water-video"
          onCanPlay={() => {
            videoRef.current?.play().catch(() => {});
          }}
          onError={() => setVideoErrored(true)}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            transform: 'translate3d(0, 0, 0)',
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
          }}
          className="w-full h-full object-cover object-center pointer-events-none"
          src={activeVideoSrc}
        />
      )}
    </div>
  );
});

export default VideoBackground;

