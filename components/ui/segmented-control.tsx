'use client';

import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptic } from '@/lib/haptics';

/**
 * The brand accent, taken straight from `--cricket` — the SAME token as the
 * Add Expense button (`<Button brand="cricket">`) and the active bottom-nav
 * item (CricketSectionNav).
 *
 * DO NOT route this through `useBrand()`. That was tried and shipped a bug:
 * `BrandContext` defaults to `BRANDS.toolkit` and `BrandProvider` is mounted
 * NOWHERE in this app (grep it), so `useBrand()` always resolves to toolkit —
 * and `--toolkit` is BLUE (#4DBBEB dark / #1A75A8 light). The active tab came
 * out looking like an informational link, clashing with the blue this app
 * already uses semantically for Tournament/percentage badges.
 *
 * Every component that needs the orange passes `brand="cricket"` explicitly
 * for exactly this reason; this constant is that convention for a component
 * with no brand prop. Toolkit is retired (see CLAUDE.md), so there is no
 * second brand to serve.
 */
const ACCENT = 'var(--cricket)';

/* ── Segmented Control — tonal rail with a travelling active surface ──
 *
 * The active state is a single BRAND-TINTED surface that physically SLIDES
 * between segments (spring-ish ease, transform-only so it stays on the GPU) —
 * the user reads "the selection moved", not "the component changed".
 *
 * Cells are equal-width flex-1, so the indicator needs no measurement:
 * width = 1/n of the rail, position = translateX(activeIndex × 100%) of its
 * own width. The rail is a tonal inset (text mixed at 7%), not a bordered
 * box — it reads as carved into the page in both themes without an outline.
 *
 * ── WHY THE ACTIVE SURFACE IS BRAND-TINTED AND NOT JUST `--elevated` ──
 *
 * It used to be flat `--elevated` with a `rgba(16,24,40,…)` shadow, and in
 * dark mode that was nearly invisible. Measured:
 *
 *   dark rail  = 7% of --text over --bg  ≈ #1B1C1F
 *   dark --elevated                      =  #22242C   ← delta of ~7-13/channel
 *   light rail                           ≈ #DFE1E4
 *   light --elevated                     =  #FFFFFF   ← delta of ~30/channel
 *
 * Two things follow. First, dark had almost no surface delta, so "Expenses"
 * did not read as selected. Second, the shadow is a DARK shadow — it does
 * nothing on a dark ground, so dark mode had no elevation cue either and the
 * whole burden fell on a 7-level lightness difference.
 *
 * Mixing the brand into --elevated fixes both themes with one expression,
 * because both tokens already flip per theme:
 *
 *   light: 11% #C2410C over #FFFFFF → warm cream, clearly raised
 *   dark:  11% #FB923C over #22242C → warm, clearly lighter than the rail
 *
 * Restrained on purpose: 11% is a tint, not a fill. This is a finance screen,
 * so the active tab must be obvious at a glance without becoming a CTA — and
 * it must stay SUBORDINATE to the Pool Balance card and the Add Expense
 * button, which is why there is no shadow, no ring and no outline.
 *
 * 11% is not an arbitrary number: it is the exact tint strength the active
 * bottom-nav item already uses, so "selected" looks the same at both levels
 * of the finance flow.
 *
 * ── SELECTION IS NOT SIGNALLED BY COLOUR ALONE ──
 * Three independent cues: the raised surface (lightness, not hue), the label
 * weight (bold vs semibold), and `aria-selected` for assistive tech. Any one
 * of them is enough — which is what makes this legible to a colour-blind
 * reader and to a screen reader alike.
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
      style={{ background: 'color-mix(in srgb, var(--text) 7%, transparent)' }}
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
            /* 11% of --cricket is the EXACT tint the active bottom-nav item
               uses (CricketSectionNav), so the two selected states in the
               finance flow are the same colour at the same strength. Mixed
               over --elevated rather than transparent because this surface
               sits inside a tonal rail and has to read as raised within it. */
            background: `color-mix(in srgb, ${ACCENT} 11%, var(--elevated))`,
            /* NO drop shadow and NO ring, deliberately. Both were tried and
               made the active segment read as a separate button sitting ON
               TOP of the control rather than a segment selected INSIDE it —
               and a floating, outlined pill competed with the Pool Balance
               card and the Add Expense CTA for attention. The tint plus the
               orange label carry the state; the tabs stay subordinate. */
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
            /* min-h-11 = a 44px touch target, up from the old ~40px.
             *
             * `pressable-selection` is the SHARED press primitive from
             * globals.css — the same 0.98 selection depth used by the
             * settlement rows and filter options. It replaced a hand-rolled
             * `active:scale-[0.98] transition-[color,transform]` pair, which
             * was subtly broken: Tailwind v4's scale utilities set the
             * standalone `scale` property (`scale: var(--tw-scale-x) …`), NOT
             * `transform`, so a transition naming `transform` never animated
             * it and the press snapped. The shared class transitions
             * `transform` (which it also sets) plus the colour properties,
             * and is built on the duration tokens so it goes instant under
             * prefers-reduced-motion for free.
             *
             * A press, not a bounce: the SELECTION itself is animated by the
             * sliding indicator above, never by the tab moving. */
            className={cn(
              'pressable-selection relative z-10 flex-1 min-h-11 px-1 rounded-xl text-[13px] cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              // Weight is the non-colour half of the selected cue.
              isActive ? 'font-bold' : 'font-semibold',
            )}
            style={{
              color: isActive ? ACCENT : 'var(--muted)',
              // Tailwind's ring-offset needs a concrete colour to sit on, and
              // the rail is translucent — name it so focus is visible in both
              // themes rather than ringing against transparent.
              ['--tw-ring-color' as string]: `color-mix(in srgb, ${ACCENT} 60%, transparent)`,
              ['--tw-ring-offset-color' as string]: 'var(--bg)',
            }}
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
