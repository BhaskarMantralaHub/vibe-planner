'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComponentType } from 'react';

type NavIcon = ComponentType<{ size?: number; className?: string; strokeWidth?: number }>;

/**
 * Cricket bottom navigation — glass-pill bar inspired by Apple Sports /
 * Sofascore / FotMob. Active tab is signalled by tinted icon + label +
 * sliding underline (matching the active label's width). Inactive items
 * stay muted with thinner stroke weight so the active tab clearly wins.
 *
 * Replaces the prior shared `InteractiveMenu` for cricket pages only —
 * other tools (vibe-planner, id-tracker, admin) keep their own nav.
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

export default function CricketSectionNav({
  items,
  activeKey,
  onViewChange,
  onActiveTap,
}: CricketSectionNavProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const labelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const [underline, setUnderline] = useState<{ left: number; width: number }>({ left: 0, width: 0 });

  const activeIdx = items.findIndex((item) => item.key === activeKey);

  // Measure the active label's position so the underline tracks its width.
  // Using useLayoutEffect avoids a flash of underline-at-position-0 on mount.
  useLayoutEffect(() => {
    if (activeIdx < 0) return;
    const label = labelRefs.current[activeIdx];
    const container = containerRef.current;
    if (!label || !container) return;
    const lr = label.getBoundingClientRect();
    const cr = container.getBoundingClientRect();
    setUnderline({ left: lr.left - cr.left, width: lr.width });
  }, [activeIdx, items.length]);

  // Re-measure on viewport resize (label fonts can rewrap at small widths).
  useEffect(() => {
    const onResize = () => {
      if (activeIdx < 0) return;
      const label = labelRefs.current[activeIdx];
      const container = containerRef.current;
      if (!label || !container) return;
      const lr = label.getBoundingClientRect();
      const cr = container.getBoundingClientRect();
      setUnderline({ left: lr.left - cr.left, width: lr.width });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [activeIdx]);

  const handleClick = (i: number) => {
    const item = items[i];
    if (i === activeIdx) {
      // Tap-on-active → let parent clean up first, then scroll to top.
      onActiveTap?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (item.kind === 'view') {
      onViewChange?.(item.key);
    } else {
      router.push(item.href);
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40"
      style={{ bottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
    >
      <div
        ref={containerRef}
        className="relative flex items-stretch rounded-full"
        style={{
          // Translucent glass surface — content scrolling beneath peeks
          // through faintly. Layered shadow + inset highlight + subtle
          // border = soft sheet-like depth without the "white slab" feel.
          background: 'color-mix(in srgb, var(--card) 86%, transparent)',
          backdropFilter: 'blur(22px) saturate(180%)',
          WebkitBackdropFilter: 'blur(22px) saturate(180%)',
          border: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
          boxShadow:
            '0 10px 32px rgba(0,0,0,0.16), 0 3px 8px rgba(0,0,0,0.08), inset 0 1px 0 color-mix(in srgb, white 55%, transparent)',
          padding: '10px 6px 8px',
        }}
      >
        {/* Drag-handle dash at top — pure visual signal, not interactive.
            Says "this is a sheet" in the iOS bottom-sheet language. */}
        <div
          aria-hidden
          className="absolute top-1.5 left-1/2 -translate-x-1/2 h-[3px] w-9 rounded-full"
          style={{ background: 'color-mix(in srgb, var(--muted) 30%, transparent)' }}
        />

        {items.map((item, idx) => {
          const isActive = idx === activeIdx;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              ref={(el) => {
                itemRefs.current[idx] = el;
              }}
              type="button"
              onClick={() => handleClick(idx)}
              aria-current={isActive ? 'page' : undefined}
              aria-label={item.label}
              className="relative flex flex-col items-center justify-center gap-1.5 px-3 pt-2 pb-1 min-w-[58px] min-h-[44px] transition-transform active:scale-[0.94] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/40 rounded-2xl"
              style={{ color: isActive ? 'var(--cricket)' : 'var(--muted)' }}
            >
              {/* Icon — active scales up + gets a soft accent drop-shadow.
                  Inactive uses thinner stroke so it visually recedes. */}
              <span
                className="inline-flex transition-transform duration-200"
                style={{
                  transform: isActive ? 'scale(1.08)' : 'scale(1)',
                  filter: isActive
                    ? 'drop-shadow(0 2px 6px color-mix(in srgb, var(--cricket) 40%, transparent))'
                    : 'none',
                }}
              >
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
                >
                  {item.count}
                </span>
              )}

              <span
                ref={(el) => {
                  labelRefs.current[idx] = el;
                }}
                className="text-[10.5px] leading-none tracking-tight transition-all duration-200"
                style={{
                  fontWeight: isActive ? 700 : 500,
                }}
              >
                {item.label}
              </span>
            </button>
          );
        })}

        {/* Sliding underline — animates to track the active label's width.
            Spring easing curve so the motion feels natural, not linear. */}
        <div
          aria-hidden
          className="absolute bottom-1 h-[2.5px] rounded-full pointer-events-none"
          style={{
            left: underline.left,
            width: underline.width,
            background: 'var(--cricket)',
            boxShadow:
              '0 0 12px color-mix(in srgb, var(--cricket) 55%, transparent), 0 0 2px color-mix(in srgb, var(--cricket) 80%, transparent)',
            transition:
              'left 340ms cubic-bezier(0.16, 1, 0.3, 1), width 340ms cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: underline.width > 0 ? 1 : 0,
          }}
        />
      </div>
    </div>
  );
}
