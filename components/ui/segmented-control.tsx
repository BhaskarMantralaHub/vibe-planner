'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { haptic } from '@/lib/haptics';

/**
 * The brand accent — used here ONLY for the keyboard focus ring. Taken
 * straight from `--cricket`, never via `useBrand()`: `BrandProvider` is
 * mounted nowhere, so `useBrand()` always resolves to the retired toolkit.
 */
const ACCENT = 'var(--cricket)';

/* ── Segmented Control — Apple-style track with a travelling thumb ──
 *
 * A gray track (`--fill`) with a white thumb (`--segment-selected`; Apple's
 * #636366 in dark) carrying a soft shadow, exactly like iOS. Neutral by rule
 * (2026-10, user feedback "too much blue"): picking a view is navigation
 * state, and in this app colour is reserved for actions.
 *
 * The old version tinted the thumb with 11% of the accent, because a flat
 * `--elevated` thumb was nearly invisible on the previous charcoal theme
 * (a ~7-level lightness delta). Apple's dark palette fixes that at the
 * source: a #636366 thumb on a 24% gray track is a large, hue-free delta.
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
  /** Optional tally after the label ("Upcoming 6"), so a tab says something
   *  before it is tapped. Omit, rather than pass 0, when "none" is not news. */
  count?: number;
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
    // Apple's segmented-control thumb: white (dark: #636366) with UIKit's own
    // two-part shadow plus a 0.5px hairline, so it reads as a raised chip
    // inside the gray track. Neutral on purpose — selection is navigation
    // state, and the accent is reserved for actions.
    background: 'var(--segment-selected)',
    boxShadow: '0 3px 8px rgba(0,0,0,0.12), 0 3px 1px rgba(0,0,0,0.04), 0 0 0 0.5px rgba(0,0,0,0.04)',
    willChange: 'left, right',
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn('relative flex rounded-[14px] p-1', className)}
      style={{ background: 'var(--fill)' }}
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
          className="absolute top-1 bottom-1 rounded-[10px] pointer-events-none"
          style={{
            left,
            right,
            opacity: surging ? 1 : 0,
            boxShadow: '0 0 14px 2px color-mix(in srgb, var(--text) 18%, transparent)',
            transition: `left ${EDGE_TAIL}, right ${EDGE_TAIL}, opacity var(--duration-slow) var(--ease-out)`,
            willChange: 'left, right, opacity',
          }}
        />
      )}

      {activeIdx >= 0 && (
        <div
          aria-hidden
          className="absolute top-1 bottom-1 rounded-[10px] pointer-events-none"
          style={surfaceStyle}
        />
      )}
      {/* iOS's thin dividers between segments, hidden either side of the
          selected one so the white chip never sits on a line. */}
      {options.slice(1).map((o, i) => {
        const hidden = i === activeIdx || i + 1 === activeIdx;
        return (
          <span
            key={`sep-${o.key}`}
            role="presentation"
            className="pointer-events-none absolute top-1/2 h-4 w-px -translate-y-1/2"
            style={{
              left: railEdge(options.length, i + 1),
              background: 'color-mix(in srgb, var(--text) 14%, transparent)',
              opacity: hidden ? 0 : 1,
              transition: 'opacity var(--duration-normal) var(--ease-out)',
            }}
          />
        );
      })}
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
              // 48px tall, 15px text — native iOS proportions. Text only: no
              // icons (user decision, 2026-10).
              'pressable-selection relative z-10 flex min-w-0 flex-1 min-h-12 items-center justify-center gap-1.5 px-2 rounded-[10px] text-[15px] cursor-pointer select-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
              // Weight is the non-colour half of the selected cue.
              isActive ? 'font-semibold' : 'font-medium',
            )}
            style={{
              color: isActive ? 'var(--text)' : 'var(--muted)',
              // Tailwind's ring-offset needs a concrete colour to sit on, and
              // the rail is translucent — name it so focus is visible in both
              // themes rather than ringing against transparent.
              ['--tw-ring-color' as string]: `color-mix(in srgb, ${ACCENT} 60%, transparent)`,
              ['--tw-ring-offset-color' as string]: 'var(--bg)',
            }}
          >
            <span className="truncate">{o.label}</span>
            {o.count !== undefined && (
              <span
                className="shrink-0 rounded-full px-1.5 text-[12px] font-semibold leading-[18px] tabular-nums"
                style={{ background: isActive ? 'var(--fill)' : 'color-mix(in srgb, var(--text) 6%, transparent)', color: 'var(--muted)' }}
              >
                {o.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export { SegmentedControl };
export type { SegmentOption, SegmentedControlProps };
