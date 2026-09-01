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
import { useReducedMotion } from '@/hooks/use-reduced-motion';

type NavIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/**
 * Cricket bottom navigation — floating translucent bar inspired by Apple
 * Sports / Sofascore / FotMob. The active tab is signalled by a soft
 * brand-tinted pill that SLIDES between tabs (plus tinted icon + label);
 * inactive items stay muted with thinner stroke weight.
 *
 * Engineering notes:
 *  • Indicator geometry is measured from the active BUTTON's DOMRect —
 *    single `measureIndicator()` shared by initial layout, ResizeObserver,
 *    and post-font-load remeasure. Tabs have variable widths (labels), so
 *    this cannot be index math like SegmentedControl.
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
  '0 8px 28px rgba(0,0,0,0.14), 0 2px 6px rgba(0,0,0,0.06), inset 0 1px 0 color-mix(in srgb, white 40%, transparent)';

const INDICATOR_TRANSITION =
  'left 320ms cubic-bezier(0.16, 1, 0.3, 1), width 320ms cubic-bezier(0.16, 1, 0.3, 1)';
const INDICATOR_TRANSITION_REDUCED = 'left 1ms linear, width 1ms linear';

const ICON_TRANSITION =
  'transform 280ms cubic-bezier(0.22, 1.2, 0.36, 1)';

const FONT_WEIGHT_TRANSITION = 'font-weight 200ms ease-out';

// Reduced-motion: collapse expressive transitions to a near-instant swap.
// We don't kill them entirely (which would feel jumpy on slower devices) —
// 1ms still lets the GPU compositor handle paint without easing curves.
// The hook itself now lives in hooks/use-reduced-motion.ts — the stat tiles on
// the cricket dashboard needed it too, and two copies would drift.

export default function CricketSectionNav({
  items,
  activeKey,
  onViewChange,
  onActiveTap,
}: CricketSectionNavProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [indicator, setIndicator] = useState<{ left: number; width: number; top: number; height: number }>({ left: 0, width: 0, top: 0, height: 0 });
  const reducedMotion = useReducedMotion();

  const activeIdx = items.findIndex((item) => item.key === activeKey);

  // ── Indicator measurement (single source of truth) ─────────────────
  // Called by:
  //  • initial useLayoutEffect (sync with first paint, no flicker)
  //  • ResizeObserver (pill width changes, e.g. orientation rotate)
  //  • document.fonts.ready (web fonts load late — label width can shift)
  const measureIndicator = useCallback(() => {
    if (activeIdx < 0) return;
    const btn = buttonRefs.current[activeIdx];
    const container = containerRef.current;
    if (!btn || !container) return;
    const br = btn.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    setIndicator({ left: br.left - cr.left, width: br.width, top: br.top - cr.top, height: br.height });
  }, [activeIdx]);

  // Initial + active-tab-change measurement. useLayoutEffect runs sync
  // before paint so we don't see an "indicator at 0" frame.
  useLayoutEffect(() => {
    measureIndicator();
  }, [measureIndicator, items.length]);

  // ResizeObserver — fires precisely when the container's box changes
  // (orientation, dynamic viewport, font swap). Falls back to a window
  // resize listener for older browsers that lack ResizeObserver.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measureIndicator);
      return () => window.removeEventListener('resize', measureIndicator);
    }
    const ro = new ResizeObserver(() => measureIndicator());
    ro.observe(container);
    return () => ro.disconnect();
  }, [measureIndicator]);

  // Re-measure after web fonts finish loading. Without this, widths
  // measured pre-font-load will be slightly off and the indicator jitters
  // when the font swaps in. The .catch is defensive — font loading
  // failure is non-fatal; the indicator just keeps its last good measurement.
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const ready = document.fonts?.ready;
    if (!ready) return;
    ready.then(measureIndicator).catch(() => {
      /* no-op — font loading failure is non-fatal */
    });
  }, [measureIndicator]);

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
      backgroundColor: 'rgba(255,255,255,0.9)',
      background: 'color-mix(in srgb, var(--card) 88%, transparent)',
      backdropFilter: 'blur(16px) saturate(160%)',
      WebkitBackdropFilter: 'blur(16px) saturate(160%)',
      border: '1px solid color-mix(in srgb, var(--border) 40%, transparent)',
      boxShadow: SURFACE_SHADOW,
      // Internal padding includes a slice of safe-area-inset-bottom so
      // the pill visually extends to absorb the iOS home indicator
      // without us double-counting the outer offset.
      // KEEP IN SYNC with --cricket-nav-height in globals.css (10 + 44 + 8),
      // which is what CricketFab uses to sit clear of this pill.
      padding: '10px 6px',
      paddingBottom: 'calc(8px + env(safe-area-inset-bottom) * 0.35)',
    }),
    [],
  );

  const indicatorStyle = useMemo<CSSProperties>(
    () => ({
      left: indicator.left,
      width: indicator.width,
      top: indicator.top + 3,
      height: Math.max(indicator.height - 6, 0),
      // 11%, deliberately faint — the orange icon + label carry the active
      // emphasis; the pill is only the seat under them.
      background: 'color-mix(in srgb, var(--cricket) 11%, transparent)',
      borderRadius: 16,
      transition: reducedMotion ? INDICATOR_TRANSITION_REDUCED : INDICATOR_TRANSITION,
      opacity: indicator.width > 0 ? 1 : 0,
      // Promote the indicator to its own compositing layer — keeps the
      // left/width transitions on the GPU instead of repainting the bar.
      willChange: 'left, width',
    }),
    [indicator.left, indicator.width, indicator.top, indicator.height, reducedMotion],
  );

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40"
      // Read from the token so the pill and everything that must clear it
      // (CricketFab) are positioned from one number. See --cricket-nav-inset
      // in globals.css; --cricket-nav-height there mirrors the padding below.
      style={{ bottom: 'var(--cricket-nav-inset)' }}
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
        {/* Sliding active surface — a soft brand-tinted pill that travels
            between tabs so a section change reads as "the selection moved". */}
        <div
          aria-hidden
          className="absolute pointer-events-none"
          style={indicatorStyle}
        />

        {items.map((item, idx) => {
          const isActive = idx === activeIdx;
          const Icon = item.icon;
          // Per-item icon style — built inline because it depends on the
          // active state, but `transition` is hoisted to a constant so the
          // string identity is stable.
          const iconStyle: CSSProperties = {
            transform: isActive ? 'scale(1.06)' : 'scale(1)',
            transition: reducedMotion ? 'none' : ICON_TRANSITION,
            // Hint the compositor that transform changes on this element.
            willChange: 'transform',
          };
          return (
            <button
              key={item.key}
              type="button"
              ref={(el) => {
                buttonRefs.current[idx] = el;
              }}
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
      </div>
    </div>
  );
}
