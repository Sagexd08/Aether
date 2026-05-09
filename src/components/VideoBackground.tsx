import { useEffect, useRef } from 'react';

const VIDEO_URL =
  'https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260328_083109_283f3553-e28f-428b-a723-d639c617eb2b.mp4';

export default function VideoBackground() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rafIdRef = useRef<number | null>(null);
  const fadingRef = useRef(false);

  useEffect(() => {
    const video = videoRef.current;
    const container = containerRef.current;
    if (!video || !container) return;

    const FADE_DURATION = 0.5; // seconds

    const applyFade = () => {
      const current = video.currentTime;
      const duration = video.duration || 0;
      if (duration <= 0) return;

      // Fade in at start (0 to 0.5s)
      if (current < FADE_DURATION) {
        const opacity = current / FADE_DURATION;
        container.style.opacity = String(Math.min(opacity, 1));
        fadingRef.current = true;
      }
      // Fade out at end (last 0.5s)
      else if (current > duration - FADE_DURATION) {
        const remaining = duration - current;
        const opacity = remaining / FADE_DURATION;
        container.style.opacity = String(Math.max(opacity, 0));
        fadingRef.current = true;
      }
      // Full opacity in the middle
      else {
        if (fadingRef.current) {
          container.style.opacity = '1';
          fadingRef.current = false;
        }
      }

      rafIdRef.current = requestAnimationFrame(applyFade);
    };

    const handleEnded = () => {
      container.style.opacity = '0';
      setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(() => {
          // Autoplay might be blocked; user can click to start
        });
      }, 100);
    };

    video.addEventListener('ended', handleEnded);

    // Start monitoring once metadata is loaded
    const handleLoaded = () => {
      rafIdRef.current = requestAnimationFrame(applyFade);
    };

    if (video.readyState >= 1) {
      handleLoaded();
    } else {
      video.addEventListener('loadedmetadata', handleLoaded, { once: true });
    }

    return () => {
      video.removeEventListener('ended', handleEnded);
      video.removeEventListener('loadedmetadata', handleLoaded);
      if (rafIdRef.current) {
        cancelAnimationFrame(rafIdRef.current);
      }
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="absolute z-0 overflow-hidden"
      style={{ top: '300px', inset: 'auto 0 0 0' }}
    >
      <video
        ref={videoRef}
        className="h-full w-full object-cover"
        src={VIDEO_URL}
        muted
        loop={false}
        playsInline
        autoPlay
        preload="auto"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-white via-transparent to-white" />
    </div>
  );
}
