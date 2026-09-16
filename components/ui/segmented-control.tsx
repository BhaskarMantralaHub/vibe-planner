'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
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
 *
 * ── THE SURGE: WHY `left`/`right` AND NOT `translateX` ──
 *
 * The travelling surface used to be a fixed-width box moved by
 * `transform: translateX(activeIndex × 100%)`. That cannot express the effect
 * this is now after — the surface STRETCHES toward the tab you tapped, its
 * leading edge arriving before its trailing edge catches up, so the move reads
 * as a charge running along the rail rather than a box gliding.
 *
 * A transform cannot do it. `scaleX` is the only way to deform a fixed box,
 * and scaling a rounded rectangle squashes its corner radii with it — the chip
 * visibly goes oval mid-flight. So the two edges are positioned independently
 * (`left` and `right`, each a fraction of the rail) and transitioned with
 * DIFFERENT durations. The stretch is not drawn; it is the gap between two
 * timings. Cells are equal-width, so this still needs no measurement.
 *
 * `left`/`right` on an absolutely positioned element is a paint, not a
 * composite — cheaper than it sounds here (one small out-of-flow box, no
 * reflow of the tabs) and the same trade CricketSectionNav already makes for
 * its variable-width tabs.
 *
 * WHICH EDGE LEADS DEPENDS ON DIRECTION: tapping rightward makes `right` the
 * head and `left` the tail; tapping leftward swaps them. Get this backwards
 * and the surface stretches BACKWARDS away from the tab you tapped, which
 * reads as recoil.
 *
 * ── REDUCED MOTION IS HANDLED BY THE TOKENS, NOT BY A BRANCH ──
 * Both edge durations are `--duration-*` custom properties, which the global
 * `prefers-reduced-motion` block in globals.css already zeroes. The explicit
 * `reducedMotion` check exists only for the glow, whose opacity is driven by a
 * timer rather than by CSS — see below.
 */

/** Leading edge: leaves immediately, decelerates in, never overshoots. */
const EDGE_HEAD = 'var(--duration-slow) var(--ease-out)';
/** Trailing edge: hangs, then dashes to catch up. The hang IS the stretch. */
const EDGE_TAIL = 'var(--duration-slower) cubic-bezier(0.7, 0, 0.25, 1)';

/** How long the glow stays lit after a move. Matches EDGE_TAIL's duration
 *  token (`--duration-slower` = 500ms) so it fades as the surface settles.
 *  Hardcoded because a JS timer cannot read a CSS custom property. */
const GLOW_MS = 500;

/**
 * One edge of the travelling surface, as a fraction of the rail.
 *
 * The rail is `p-1` (4px), and percentages on an absolutely positioned child
 * resolve against the containing block's PADDING box — which includes that
 * padding. So the usable track is `100% - 8px`, and `before` is how many whole
 * cells sit between this edge and its side of the rail.
 */
const railEdge = (cells: number, before: number) =>
  `calc(4px + (100% - 8px) * ${before} / ${cells})`;

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

  /* Which way the selection last moved, and whether it is still moving.
   *
   * Derived DURING RENDER (React's documented "adjusting state when a prop
   * changes" pattern) rather than in an effect. That ordering is load-bearing:
   * React re-runs this render before committing, so the new geometry and the
   * new per-edge durations reach the DOM in the SAME commit. Set from a layout
   * effect instead and the first frame of the move would still be using the
   * PREVIOUS direction's timings — the stretch would point the wrong way for
   * one frame on every other tap. */
  const [prevIdx, setPrevIdx] = useState(activeIdx);
  const [dir, setDir] = useState(0);
  const [surging, setSurging] = useState(false);
  if (prevIdx !== activeIdx) {
    setDir(Math.sign(activeIdx - prevIdx));
    setPrevIdx(activeIdx);
    setSurging(true);
  }

  // Put the glow out once the surface has settled. `activeIdx` is in the deps
  // so a second tap mid-flight RESTARTS the timer instead of letting the first
  // one cut the glow off early.
  useEffect(() => {
    if (!surging) return;
    const t = window.setTimeout(() => setSurging(false), GLOW_MS);
    return () => window.clearTimeout(t);
  }, [surging, activeIdx]);

  // Clamped so a control rendered with no matching key (activeIdx === -1)
  // computes a valid box rather than a negative one; it stays unrendered.
  const idx = Math.max(activeIdx, 0);
  const left = railEdge(options.length, idx);
  const right = railEdge(options.length, options.length - 1 - idx);

  // Moving left (dir < 0) → the LEFT edge is the head. Anything else (right,
  // or the very first paint) → the RIGHT edge leads.
  const edgeTransition =
    dir < 0
      ? `left ${EDGE_HEAD}, right ${EDGE_TAIL}`
      : `left ${EDGE_TAIL}, right ${EDGE_HEAD}`;

  const surfaceStyle: CSSProperties = {
    left,
    right,
    transition: edgeTransition,
    /* 11% of --cricket is the EXACT tint the active bottom-nav item uses
       (CricketSectionNav), so the two selected states in the finance flow are
       the same colour at the same strength. Mixed over --elevated rather than
       transparent because this surface sits inside a tonal rail and has to
       read as raised within it. */
    background: `color-mix(in srgb, ${ACCENT} 11%, var(--elevated))`,
    /* NO drop shadow and NO ring on the SURFACE, deliberately. Both were tried
       and made the active segment read as a separate button sitting ON TOP of
       the control rather than a segment selected INSIDE it — and a floating,
       outlined pill competed with the Pool Balance card and the Add Expense
       CTA for attention. The glow below is the exception that proves it: it
       exists only while the selection is in flight and is gone at rest, so the
       resting state is still the flat tint. */
    willChange: 'left, right',
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative flex rounded-2xl p-1', className)}
      style={{ background: 'color-mix(in srgb, var(--text) 7%, transparent)' }}
    >
      {/* The trail. BOTH its edges use the tail timing, so the whole glow lags
          behind the surface and smears out of the tab you just left. Rendered
          before the surface so it sits underneath, and skipped outright under
          reduced motion — its opacity is timer-driven, which is the one part
          of this the CSS duration tokens cannot switch off.

          A box-shadow, not `filter: blur()`: a filter would force a repaint of
          its whole region on every frame of a left/right animation, which is
          exactly the combination Safari handles worst. The element has no
          background, so what paints is only the soft halo outside its box. */}
      {activeIdx >= 0 && !reducedMotion && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-xl pointer-events-none"
          style={{
            left,
            right,
            opacity: surging ? 1 : 0,
            boxShadow: `0 0 14px 2px color-mix(in srgb, ${ACCENT} 55%, transparent)`,
            transition: `left ${EDGE_TAIL}, right ${EDGE_TAIL}, opacity var(--duration-slow) var(--ease-out)`,
            willChange: 'left, right, opacity',
          }}
        />
      )}

      {activeIdx >= 0 && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-xl pointer-events-none"
          style={surfaceStyle}
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
