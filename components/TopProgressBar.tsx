'use client';

import { useEffect, useRef, useState } from 'react';
import { useUIStore } from '@/stores/ui-store';

/**
 * Modern top progress bar (NProgress / Vercel / Linear style).
 * Shows whenever `useUIStore.inflightCount > 0`.
 *
 * Behavior:
 * - On first activity: appears, trickles 0% → 80% over ~600ms
 * - While activity continues: holds at ~80%, drifts slowly toward 90%
 * - When all activity ends: jumps to 100%, fades, resets
 * - Min visible duration ~250ms even for instant work, so it never strobes
 */
export function TopProgressBar() {
  const inflight = useUIStore((s) => s.inflightCount);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const trickleRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const minVisibleUntilRef = useRef<number>(0);

  useEffect(() => {
    const clearTrickle = () => {
      if (trickleRef.current) { clearInterval(trickleRef.current); trickleRef.current = null; }
    };
    const clearHide = () => {
      if (hideTimeoutRef.current) { clearTimeout(hideTimeoutRef.current); hideTimeoutRef.current = null; }
    };

    if (inflight > 0) {
      // Loading started or continued
      clearHide();
      if (!visible) {
        setVisible(true);
        setProgress(8);
        minVisibleUntilRef.current = Date.now() + 250;
      }
      // Trickle toward 90% asymptotically
      clearTrickle();
      trickleRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          // Move ~12% of the remaining gap each tick — feels accelerated then easing
          const next = p + (90 - p) * 0.12;
          return next;
        });
      }, 180);
    } else if (visible) {
      // Loading finished — race the min-visible window
      clearTrickle();
      const elapsed = Date.now();
      const wait = Math.max(0, minVisibleUntilRef.current - elapsed);
      hideTimeoutRef.current = setTimeout(() => {
        setProgress(100);
        // Fade and reset after the 100% snap renders
        const t = setTimeout(() => { setVisible(false); setProgress(0); }, 220);
        hideTimeoutRef.current = t;
      }, wait);
    }

    return () => { clearTrickle(); };
  }, [inflight, visible]);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed left-0 right-0 top-0 z-[100] h-[2px]"
    >
      <div
        className="h-full origin-left"
        style={{
          width: `${progress}%`,
          opacity: visible ? 1 : 0,
          background: 'linear-gradient(90deg, var(--cricket), var(--cricket-accent), var(--cricket))',
          backgroundSize: '200% 100%',
          animation: visible ? 'progressShimmer 1.6s linear infinite' : 'none',
          boxShadow: visible ? '0 0 8px color-mix(in srgb, var(--cricket) 60%, transparent), 0 0 2px color-mix(in srgb, var(--cricket) 80%, transparent)' : 'none',
          transition: 'width 280ms cubic-bezier(0.4, 0, 0.2, 1), opacity 220ms ease-out',
        }}
      />
      {/* Glowing leading edge — gives the bar movement and modernity */}
      {visible && progress > 0 && progress < 100 && (
        <div
          className="absolute top-0 h-full"
          style={{
            left: `${progress}%`,
            width: '80px',
            transform: 'translateX(-100%)',
            background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--cricket) 70%, transparent), transparent)',
            filter: 'blur(2px)',
            transition: 'left 280ms cubic-bezier(0.4, 0, 0.2, 1)',
          }}
        />
      )}
    </div>
  );
}
