'use client';

import type { CSSProperties, JSX } from 'react';
import PlayerAvatar from './PlayerAvatar';

export type LeaderboardEntry = {
  id: string | null;
  name: string;
  photoUrl?: string | null;
  /** Drives the bar; the leader's value is the full width. */
  value: number;
  /** The headline figure as shown ("306", "4.5"). */
  display: string;
  /** Supporting figures, already joined ("14 inns · Avg 25.5"). */
  detail: string;
};

/**
 * The ranked view: one discipline, one number per player, and the row itself
 * is the bar. Each row's fill is its share of the leader's figure, so the gap
 * between first and fifth is visible before a single number is read — which
 * is the question this page is opened with.
 *
 * Neutral by rule: the fill is the gray well colour and the ranks are ink.
 * The bar is decoration of the data, never a status colour.
 */
export default function LeaderboardList({
  entries, unit, onPlayerTap,
}: {
  entries: LeaderboardEntry[];
  /** Unit under each figure, singular and plural: ['run', 'runs']. */
  unit: [string, string];
  onPlayerTap: (playerId: string) => void;
}): JSX.Element {
  const max = Math.max(...entries.map((e) => e.value), 0);
  return (
    <ol className="flex flex-col gap-1">
      {entries.map((e, i) => {
        const rank = i + 1;
        const pct = max > 0 ? Math.max((e.value / max) * 100, 0) : 0;
        const label = e.value === 1 ? unit[0] : unit[1];
        const body = (
          <>
            <span
              aria-hidden
              className="lb-bar absolute inset-y-0 left-0 rounded-xl bg-[var(--fill)]"
              style={{ width: `${pct}%`, '--i': Math.min(i, 10) } as CSSProperties}
            />
            <span
              className={
                'relative w-6 flex-shrink-0 text-center text-[15px] tabular-nums '
                + (rank <= 3 ? 'font-semibold text-[var(--text)]' : 'font-medium text-[var(--dim)]')
              }
            >
              {rank}
            </span>
            <PlayerAvatar name={e.name} photoUrl={e.photoUrl} size={40} className="relative" />
            <span className="relative flex min-w-0 flex-1 flex-col">
              <span className="truncate text-[16px] font-semibold leading-snug text-[var(--text)]">{e.name}</span>
              <span className="truncate text-[13px] leading-snug text-[var(--muted)] tabular-nums">{e.detail}</span>
            </span>
            <span className="relative flex flex-shrink-0 flex-col items-end">
              <span className="text-[22px] font-bold leading-none tracking-tight tabular-nums text-[var(--text)]">
                {e.display}
              </span>
              <span className="mt-1 text-[12px] leading-none text-[var(--muted)]">{label}</span>
            </span>
          </>
        );
        const rowClass = 'relative flex min-h-[64px] w-full items-center gap-3 rounded-xl py-2 pl-1 pr-3 text-left';
        return (
          <li key={e.id ?? e.name}>
            {e.id ? (
              <button
                type="button"
                onClick={() => onPlayerTap(e.id!)}
                aria-label={`${rank}. ${e.name}, ${e.display} ${label}. ${e.detail}. Open player stats.`}
                className={`${rowClass} pressable-selection cursor-pointer active:bg-[var(--hover-bg)]`}
              >
                {body}
              </button>
            ) : (
              <div className={rowClass}>{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}
