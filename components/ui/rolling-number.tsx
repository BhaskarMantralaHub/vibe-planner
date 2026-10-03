'use client';

import { cn } from '@/lib/utils';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A figure whose digits roll to their new value like a scoreboard, instead of
 * swapping. Takes the already-formatted string ("$1,240.50") so every caller
 * keeps its own formatting; only 0-9 roll, everything else is static.
 *
 * Layout: an invisible copy of the text sets the width, height and baseline,
 * so the figure lines up with surrounding text exactly as plain text would.
 * The rolling columns sit over it. Columns are keyed from the RIGHT, so
 * $9.99 → $10.00 rolls the cents and units in place and only the new leading
 * digit arrives fresh.
 *
 * No JS animation: each column is a 0-9 strip moved with a CSS transition on
 * the motion tokens, which go to 0ms (and the stagger with them) under
 * prefers-reduced-motion.
 */
export function RollingNumber({ value, className }: { value: string; className?: string }) {
  const chars = value.split('');
  return (
    <span className={cn('relative inline-block whitespace-nowrap tabular-nums', className)}>
      <span className="sr-only">{value}</span>
      <span aria-hidden className="invisible">{value}</span>
      <span aria-hidden className="pointer-events-none absolute inset-0 flex select-none">
        {chars.map((ch, i) => {
          const fromRight = chars.length - 1 - i;
          const d = DIGITS.indexOf(ch);
          if (d < 0) return <span key={`s${fromRight}`}>{ch}</span>;
          return (
            <span key={`d${fromRight}`} className="roll-col relative h-full overflow-hidden">
              <span
                className="roll-strip flex h-full flex-col"
                style={{
                  transform: `translateY(${-d * 100}%)`,
                  // Rightmost digit leads; each column to its left follows a beat later.
                  transitionDelay: `calc(var(--duration-fast) * ${fromRight * 0.35})`,
                }}
              >
                {DIGITS.map((n) => <span key={n} className="h-full flex-none">{n}</span>)}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}
