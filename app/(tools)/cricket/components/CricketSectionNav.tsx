'use client';

import { useRouter } from 'next/navigation';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ComponentType, CSSProperties } from 'react';

type NavIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/**
 * Cricket bottom navigation — glass-pill bar inspired by Apple Sports /
 * Sofascore / FotMob. Active tab is signalled by tinted icon + label +
 * sliding underline (matching the active label's width). Inactive items
 * stay muted with thinner stroke weight so the active tab clearly wins.
 *
 * Engineering notes:
 *  • Underline width is measured from the active label's DOMRect — single
 *    `measureUnderline()` function shared by initial layout, ResizeObserver,
 *    and post-font-load remeasure.
 *  • Motion respects `prefers-reduced-motion`.
 *  • Surfaces have rgba fallbacks for browsers that don't parse `color-mix`.
 *  • Style objects are memoized so they don't churn on every render.
 *  • Replaces the prior shared `InteractiveMenu` for cricket pages only —
 *    other tools (vibe-planner, id-tracker, admin) keep their own nav.
 */
export type CricketSectionNavItem =
  | {
      kind: 'view';
      key: string;
      label: string;
      icon: NavIcon;
      count?: number;
    }
  | {
      kind: 'route';
      key: string;
      label: string;
      icon: NavIcon;
      href: string;
      count?: number;
    };

interface CricketSectionNavProps {
  items: CricketSectionNavItem[];
  activeKey: string;
  /** Fires when a `view` item is tapped (and isn't already active). */
  onViewChange?: (key: string) => void;
  /** Fires when the already-active item is tapped (just before scroll-to-top).
   *  Useful for cleaning up open menus / drawers in the parent. */
  onActiveTap?: () => void;
}

// ── Style constants ─────────────────────────────────────────────────────
// Hoisted so they're stable identities across renders + so theming /
// tweaks live in one place.

const SURFACE_SHADOW =
  '0 10px 32px rgba(0,0,0,0.16), 0 3px 8px rgba(0,0,0,0.08), inset 0 1px 0 color-mix(in srgb, white 55%, transparent)';

const UNDERLINE_TRANSITION =
  'left 340ms cubic-bezier(0.16, 1, 0.3, 1), width 340ms cubic-bezier(0.16, 1, 0.3, 1)';
const UNDERLINE_TRANSITION_REDUCED = 'left 1ms linear, width 1ms linear';
const UNDERLINE_GLOW =
  '0 0 12px color-mix(in srgb, var(--cricket) 55%, transparent), 0 0 2px color-mix(in srgb, var(--cricket) 80%, transparent)';

const ICON_TRANSITION =
  'transform 280ms cubic-bezier(0.22, 1.2, 0.36, 1), filter 220ms ease-out';

const FONT_WEIGHT_TRANSITION = 'font-weight 200ms ease-out';

// Reduced-motion: collapse expressive transitions to a near-instant swap.
// We don't kill them entirely (which would feel jumpy on slower devices) —
// 1ms still lets the GPU compositor handle paint without easing curves.
function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

export default function CricketSectionNav({
  items,
  activeKey,
  onViewChange,
  onActiveTap,
}: CricketSectionNavProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [underline, setUnderline] = useState<{ left: number; width: number }>({ left: 0, width: 0 });
  const reducedMotion = useReducedMotion();

  const activeIdx = items.findIndex((item) => item.key === activeKey);

  // ── Underline measurement (single source of truth) ─────────────────
  // Called by:
  //  • initial useLayoutEffect (sync with first paint, no flicker)
  //  • ResizeObserver (pill width changes, e.g. orientation rotate)
  //  • document.fonts.ready (web fonts load late — label width can shift)
  const measureUnderline = useCallback(() => {
    if (activeIdx < 0) return;
    const label = labelRefs.current[activeIdx];
    const container = containerRef.current;
    if (!label || !container) return;
    const lr = label.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    setUnderline({ left: lr.left - cr.left, width: lr.width });
  }, [activeIdx]);

  // Initial + active-tab-change measurement. useLayoutEffect runs sync
  // before paint so we don't see an "underline at 0" frame.
  useLayoutEffect(() => {
    measureUnderline();
  }, [measureUnderline, items.length]);

  // ResizeObserver — fires precisely when the container's box changes
  // (orientation, dynamic viewport, font swap). Falls back to a window
  // resize listener for older browsers that lack ResizeObserver.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureUnderline);
      return () => window.removeEventListener('resize', measureUnderline);
    }
    const ro = new ResizeObserver(() => measureUnderline());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measureUnderline]);

  // Re-measure after web fonts finish loading. Without this, label widths
  // measured pre-font-load will be slightly off and the underline jitters
  // when the font swaps in. The .catch is defensive — font loading
  // failure is non-fatal; underline just keeps its last good measurement.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const ready = document.fonts?.ready;
    if (!ready) return;
    ready.then(measureUnderline).catch(() => {
      /* no-op — font loading failure is non-fatal */
    });
  }, [measureUnderline]);

  const handleClick = useCallback(
    (i: number) => {
      const item = items[i];
      if (i === activeIdx) {
        // Tap-on-active → let parent clean up first, then scroll to top.
        // Reduced-motion users get an instant jump instead of smooth-scroll.
        onActiveTap?.();
        window.scrollTo({ top: 0, behavior: reducedMotion ? 'auto' : 'smooth' });
        return;
      }
      if (item.kind === 'view') {
        onViewChange?.(item.key);
      } else {
        router.push(item.href);
      }
    },
    [items, activeIdx, onActiveTap, onViewChange, router, reducedMotion],
  );

  // Memoized so it's a stable reference across renders. The pill surface
  // style doesn't depend on anything reactive — only the underline does.
  const surfaceStyle = useMemo<CSSProperties>(
    () => ({
      // backgroundColor is the rgba fallback; the shorthand `background`
      // line below overrides it in browsers that understand color-mix.
      // Browsers without color-mix discard the shorthand and use the
      // backgroundColor fallback, so the bar never renders transparent.
      backgroundColor: 'rgba(255,255,255,0.86)',
      background: 'color-mix(in srgb, var(--card) 86%, transparent)',
      backdropFilter: 'blur(22px) saturate(180%)',
      WebkitBackdropFilter: 'blur(22px) saturate(180%)',
      border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
      boxShadow: SURFACE_SHADOW,
      // Internal padding includes a slice of safe-area-inset-bottom so
      // the pill visually extends to absorb the iOS home indicator
      // without us double-counting the outer offset.
      padding: '10px 6px',
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom) * 0.35)',
    }),
    [],
  );

  const underlineStyle = useMemo<CSSProperties>(
    () => ({
      left: underline.left,
      width: underline.width,
      background: 'var(--cricket)',
      boxShadow: UNDERLINE_GLOW,
      transition: reducedMotion ? UNDERLINE_TRANSITION_REDUCED : UNDERLINE_TRANSITION,
      opacity: underline.width > 0 ? 1 : 0,
      // Promote the underline to its own compositing layer — keeps the
      // left/width transitions on the GPU instead of repainting the bar.
      willChange: 'left, width',
    }),
    [underline.left, underline.width, reducedMotion],
  );

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40"
      style={{ bottom: 'max(0.5rem, env(safe-area-inset-bottom))' }}
    >
      {/* Gradient fade above the nav — content scrolling past gently
          dissolves into the page background just before reaching the
          pill, giving stronger visual separation than the blur alone. */}
      <div
        aria-hidden
        className="absolute -top-10 inset-x-0 h-10 pointer-events-none"
        style={{
          background:
            'linear-gradient(to top, color-mix(in srgb, var(--bg) 70%, transparent) 0%, transparent 100%)',
        }}
      />

      <div
        ref={containerRef}
        className="relative flex items-stretch rounded-full"
        style={surfaceStyle}
      >
        {/* Subtle texture dash — toned WAY down from the previous drag
            handle so users don't expect drag-to-dismiss behaviour. Stays
            only as a soft "this is a sheet" cue. */}
        <div
          aria-hidden
          className="absolute top-[3px] left-1/2 -translate-x-1/2 h-[1.5px] w-6 rounded-full opacity-50"
          style={{ background: 'color-mix(in srgb, var(--muted) 22%, transparent)' }}
        />

        {items.map((item, idx) => {
          const isActive = idx === activeIdx;
          const Icon = item.icon;
          // Per-item icon style — built inline because it depends on the
          // active state, but `transition` is hoisted to a constant so the
          // string identity is stable.
          const iconStyle: CSSProperties = {
            transform: isActive ? 'scale(1.08)' : 'scale(1)',
            filter: isActive
              ? 'drop-shadow(0 2px 6px color-mix(in srgb, var(--cricket) 40%, transparent))'
              : 'none',
            transition: reducedMotion ? 'none' : ICON_TRANSITION,
            // Hint the compositor that transform changes on this element.
            willChange: 'transform',
          };
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => handleClick(idx)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className={[
                'relative flex flex-col items-center justify-center gap-1.5',
                'px-3 pt-2 pb-1 min-w-[58px] min-h-[44px] rounded-2xl',
                'transition-all duration-150 ease-out',
                // Tap feedback: tiny compression + opacity dip — feels
                // like a physical press release.
                'active:scale-[0.94] active:opacity-80',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/40',
              ].join(' ')}
              style={{ color: isActive ? 'var(--cricket)' : 'var(--muted)' }}
            >
              <span className="inline-flex" style={iconStyle}>
                <Icon size={22} strokeWidth={isActive ? 2.4 : 1.8} />
              </span>

              {/* Count badge (e.g. unread / pending) — preserved from prior API. */}
              {typeof item.count === 'number' && item.count > 0 && (
                <span
                  className="absolute top-0.5 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full flex items-center justify-center text-[9px] font-extrabold leading-none"
                  style={{
                    background: isActive ? 'var(--cricket)' : 'var(--muted)',
                    color: 'white',
                  }}
                  aria-label={`${item.count} unread`}
                >
                  {item.count}
                </span>
              )}

              <span
                ref={(el) => {
                  labelRefs.current[idx] = el;
                }}
                className="text-[10.5px] leading-none tracking-tight"
                style={{
                  fontWeight: isActive ? 700 : 500,
                  transition: reducedMotion ? 'none' : FONT_WEIGHT_TRANSITION,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Sliding underline — animates to track the active label's width. */}
        <div
          aria-hidden
          className="absolute bottom-1 h-[2.5px] rounded-full pointer-events-none"
          style={underlineStyle}
        />
      </div>
    </div>
  );
}
