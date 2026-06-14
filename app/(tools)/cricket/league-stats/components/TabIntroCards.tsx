'use client';

import { Target, FileCode } from 'lucide-react';
import type { JSX } from 'react';

/* -------------------------------------------------------------------------- */
/* AllRoundFormulaCard                                                        */
/* -------------------------------------------------------------------------- */

type FormulaPillProps = { label: string; expr: string; accent: string };

function FormulaPill({ label, expr, accent }: FormulaPillProps): JSX.Element {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl px-3 py-2 min-w-[64px]"
      style={{
        background: `color-mix(in srgb, ${accent} 12%, transparent)`,
        border: `1px solid color-mix(in srgb, ${accent} 25%, transparent)`,
        color: accent,
      }}
    >
      <span className="text-[9px] font-semibold uppercase tracking-wider opacity-80">{label}</span>
      <span className="text-[12px] font-bold tabular-nums leading-tight">{expr}</span>
    </div>
  );
}

export function AllRoundFormulaCard(): JSX.Element {
  return (
    <div
      className="relative rounded-2xl p-3.5 overflow-hidden"
      style={{
        // Vertical accent gradient surface — matches the leaderboard card
        // language so the formula card reads as part of the same family.
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--stat-allround) 9%, var(--card)) 0%, var(--card) 100%)',
        border: '1px solid color-mix(in srgb, var(--stat-allround) 22%, var(--border))',
      }}
    >
      {/* Left edge accent ribbon to match leaderboard cards. */}
      <div
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: 'color-mix(in srgb, var(--stat-allround) 60%, transparent)' }}
      />
      <div
        className="relative text-[10px] font-bold uppercase tracking-[0.15em] mb-3"
        style={{ color: 'var(--stat-allround)' }}
      >
        All-Round Score Formula
      </div>

      <div className="relative flex items-center justify-center gap-2 flex-wrap">
        <FormulaPill label="Runs" expr="/ 25" accent="var(--stat-batting)" />
        <span className="text-base font-bold text-muted-foreground">+</span>
        <FormulaPill label="Wickets" expr="× 1" accent="var(--stat-bowling)" />
        <span className="text-base font-bold text-muted-foreground">+</span>
        <FormulaPill label="Catches" expr="/ 2" accent="var(--stat-catches)" />
      </div>

      <p className="relative mt-3 text-[11px] text-muted-foreground text-center">
        Players must contribute in 2+ disciplines.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* CatchesRulesCard                                                           */
/* -------------------------------------------------------------------------- */

type CatchPatternProps = { pattern: string; meaning: string };

function CatchPatternChip({ pattern, meaning }: CatchPatternProps): JSX.Element {
  return (
    <div
      className="flex items-start gap-2 rounded-xl p-2.5"
      style={{
        background: 'color-mix(in srgb, var(--stat-catches) 10%, var(--card))',
        border: '1px solid color-mix(in srgb, var(--stat-catches) 25%, var(--border))',
      }}
    >
      <FileCode
        size={14}
        className="mt-0.5 shrink-0"
        style={{ color: 'var(--stat-catches)' }}
      />
      <div className="flex flex-col min-w-0">
        <code
          className="text-[11px] font-bold font-mono leading-tight"
          style={{ color: 'var(--stat-catches)' }}
        >
          {pattern}
        </code>
        <span className="text-[10px] text-muted-foreground leading-tight mt-0.5">{meaning}</span>
      </div>
    </div>
  );
}

export function CatchesRulesCard(): JSX.Element {
  return (
    <div
      className="relative rounded-2xl p-3.5 overflow-hidden"
      style={{
        background: 'linear-gradient(180deg, color-mix(in srgb, var(--stat-catches) 9%, var(--card)) 0%, var(--card) 100%)',
        border: '1px solid color-mix(in srgb, var(--stat-catches) 22%, var(--border))',
      }}
    >
      <div
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{ background: 'color-mix(in srgb, var(--stat-catches) 60%, transparent)' }}
      />
      <div
        className="relative text-[10px] font-bold uppercase tracking-[0.15em] mb-3"
        style={{ color: 'var(--stat-catches)' }}
      >
        What Counts as a Catch?
      </div>

      <div className="relative grid grid-cols-2 gap-2">
        <CatchPatternChip pattern="c X b Y" meaning="Standard catch by X off Y's bowling" />
        <CatchPatternChip pattern="c †X b Y" meaning="Wicketkeeper catch (dagger = keeper)" />
        <CatchPatternChip pattern="c & b X" meaning="Caught and bowled — X gets credit" />
        <CatchPatternChip pattern="st †X b Y" meaning="Stumped (credited like a catch for v1)" />
      </div>

      <p className="relative mt-3 text-[10.5px] text-muted-foreground leading-snug">
        Catches by opposition fielders when our team is batting are ignored. Stumpings count for v1.
      </p>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* BestSpellChip                                                              */
/* -------------------------------------------------------------------------- */

export type BestSpellChipProps = {
  wickets: number;
  runs: number;
  showPrefix?: boolean;
};

export function BestSpellChip({ wickets, runs, showPrefix = true }: BestSpellChipProps): JSX.Element {
  // 5-wicket haul or better = solid accent (celebratory). Otherwise a soft
  // accent tint. Single hue, no gold gradient/glow — calm and modern.
  const elite = wickets >= 5;
  const style = elite
    ? {
        background: 'var(--cricket)',
        border: '1px solid var(--cricket)',
        color: '#fff',
      }
    : {
        background: 'color-mix(in srgb, var(--cricket) 14%, transparent)',
        border: '1px solid color-mix(in srgb, var(--cricket) 28%, transparent)',
        color: 'var(--cricket)',
      };
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-extrabold tabular-nums"
      style={style}
    >
      <Target size={12} aria-hidden="true" />
      {showPrefix ? `Best ${wickets}/${runs}` : `${wickets}/${runs}`}
    </span>
  );
}

/* -------------------------------------------------------------------------- */
/* EconomyHeatBadge                                                           */
/* -------------------------------------------------------------------------- */

export type EconomyHeatBadgeProps = {
  economy: number | null;
  variant?: 'inline' | 'swatch';
};

function getHeatColor(econ: number): string {
  if (econ <= 4.0) return 'var(--stat-batting-deep)';
  if (econ <= 5.5) return 'var(--stat-batting)';
  if (econ <= 7.0) return '#EAB308'; // yellow-500
  if (econ <= 8.5) return '#F97316'; // orange-500
  return '#EF4444'; // red-500
}

export function EconomyHeatBadge({ economy, variant = 'inline' }: EconomyHeatBadgeProps): JSX.Element {
  if (economy === null || Number.isNaN(economy)) {
    return <span className="text-muted-foreground tabular-nums">—</span>;
  }

  const color = getHeatColor(economy);
  const formatted = economy.toFixed(2);

  if (variant === 'swatch') {
    return (
      <span className="inline-flex items-center tabular-nums">
        <span
          className="inline-block h-2 w-2 rounded-full mr-1.5"
          style={{ background: color }}
          aria-hidden="true"
        />
        {formatted}
      </span>
    );
  }

  return (
    <span className="font-bold tabular-nums" style={{ color }}>
      {formatted}
    </span>
  );
}
