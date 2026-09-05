'use client';

import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptic } from '@/lib/haptics';

/* ── Segmented Control — tonal rail with a travelling active surface ──
 *
 * The active state is a single ELEVATED NEUTRAL surface (iOS-style) that
 * physically SLIDES between segments (spring-ish ease, transform-only so it
 * stays on the GPU) — the user reads "the selection moved", not "the
 * component changed". Deliberately NOT a brand-colored fill: the rail lives
 * directly under the brand-heavy nav and hero, and a quiet elevated chip
 * with strong label contrast is the calmer, more premium read.
 *
 * Cells are equal-width flex-1, so the indicator needs no measurement:
 * width = 1/n of the rail, position = translateX(activeIndex × 100%) of its
 * own width. The rail is a tonal inset (text mixed at 6%), not a bordered
 * box — it reads as carved into the page in both themes without an outline.
 */

interface SegmentOption {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  ariaLabel?: string;
}

function SegmentedControl({ options, active, onChange, className, ariaLabel }: SegmentedControlProps) {
  const reducedMotion = useReducedMotion();
  const activeIdx = options.findIndex((o) => o.key === active);

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative flex rounded-2xl p-1', className)}
      style={{ background: 'color-mix(in srgb, var(--text) 6%, transparent)' }}
    >
      {activeIdx >= 0 && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-xl pointer-events-none"
          style={{
            left: 4,
            width: `calc((100% - 8px) / ${options.length})`,
            transform: `translateX(${activeIdx * 100}%)`,
            transition: reducedMotion ? 'none' : 'transform 260ms var(--ease-spring)',
            background: 'var(--elevated)',
            boxShadow: '0 1px 2px rgba(16,24,40,0.08), 0 3px 10px rgba(16,24,40,0.10)',
            willChange: 'transform',
          }}
        />
      )}
      {options.map((o) => {
        const isActive = active === o.key;
        return (
          <button
            key={o.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => {
              // Only when the selection actually MOVES. Re-tapping the active
              // segment is a no-op, and a no-op that vibrates teaches people
              // the buzz means nothing. Fired before onChange so the tick
              // lands with the tap rather than after the re-render.
              if (!isActive) haptic('selection');
              onChange(o.key);
            }}
            className="relative z-10 flex-1 py-3 rounded-xl text-[13px] font-semibold cursor-pointer select-none active:scale-[0.97] transition-[color,transform] duration-200"
            style={{ color: isActive ? 'var(--text)' : 'var(--muted)' }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
export type { SegmentOption, SegmentedControlProps };
