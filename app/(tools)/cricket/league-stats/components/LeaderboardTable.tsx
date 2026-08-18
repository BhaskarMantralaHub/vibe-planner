'use client';

import type { JSX, ReactNode } from 'react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import PlayerAvatar from './PlayerAvatar';

/* ── LeaderboardTable ──────────────────────────────────────────────────────
 *
 * The dense counterpart to <LeaderboardCard>. Cards answer "how is this one
 * player doing?"; this answers "who is actually best?" — many players in one
 * glance, every stat in a comparable column.
 *
 * Layout contract on a phone: the player column is frozen (`sticky left-0`)
 * and the stat columns scroll horizontally underneath it, so you never lose
 * track of whose row you are reading. That means EVERY sticky cell must paint
 * its own opaque background — a background on the <tr> alone leaves the
 * scrolling numbers visible through the frozen column on iOS Safari.
 */

export type TableColumn<Row> = {
  key: string;
  /* Short header label — column widths are tight, so 2-5 characters. */
  label: string;
  /* Sort key. Return null for "no data"; nulls always sort to the bottom
     regardless of direction, so an empty cell never wins a leaderboard. */
  sortValue: (row: Row) => number | null;
  /* Cell content. Kept separate from sortValue so "3/18" or "—" can display
     while the column still sorts numerically. */
  render: (row: Row) => ReactNode;
  /* The tab's headline stat (Runs / Wkts / Score / Ct) — tinted + bolder. */
  primary?: boolean;
  /* Econ, bowling Avg: first tap should sort ascending, because low is good. */
  lowerIsBetter?: boolean;
  /* Tooltip on the header cell — room for the full stat name. */
  title?: string;
};

export type LeaderboardTableProps<Row> = {
  rows: Row[];
  columns: TableColumn<Row>[];
  /* Identity accessor — keeps the table generic across the four tab shapes. */
  getPlayer: (row: Row) => { id: string | null; name: string; photoUrl?: string | null };
  defaultSortKey: string;
  accentColor: string;
  onPlayerTap: (playerId: string) => void;
};

export default function LeaderboardTable<Row>({
  rows,
  columns,
  getPlayer,
  defaultSortKey,
  accentColor,
  onPlayerTap,
}: LeaderboardTableProps<Row>): JSX.Element {
  const initial = columns.find((c) => c.key === defaultSortKey) ?? columns[0];
  const [sortKey, setSortKey] = useState(initial?.key ?? '');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>(
    initial?.lowerIsBetter ? 'asc' : 'desc',
  );

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.sortValue(a);
      const bv = col.sortValue(b);
      // Nulls last in BOTH directions — a player with no economy recorded
      // should never top an "economy ascending" sort.
      if (av === null && bv === null) return getPlayer(a).name.localeCompare(getPlayer(b).name);
      if (av === null) return 1;
      if (bv === null) return -1;
      if (av !== bv) return sortDir === 'asc' ? av - bv : bv - av;
      return getPlayer(a).name.localeCompare(getPlayer(b).name);
    });
  }, [rows, columns, sortKey, sortDir, getPlayer]);

  const onHeaderClick = (col: TableColumn<Row>) => {
    if (sortKey === col.key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(col.key);
      // Open on the "good end" of the stat: most runs first, best economy first.
      setSortDir(col.lowerIsBetter ? 'asc' : 'desc');
    }
  };

  // Stat columns are fixed-width so the numbers form clean vertical rules;
  // the frozen player column takes 148px, which fits "Sai Krishna N." at 13px.
  const PLAYER_COL = 148;
  const STAT_COL = 56;
  const minWidth = PLAYER_COL + columns.length * STAT_COL;

  return (
    <div className="relative">
      <ScrollArea minWidth={minWidth}>
        <table
          className="border-collapse text-left"
          style={{ minWidth: `${minWidth}px`, width: '100%' }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                className="sticky left-0 z-20 text-left px-3 py-2.5"
                style={{
                  width: PLAYER_COL,
                  minWidth: PLAYER_COL,
                  background: 'var(--surface)',
                  borderBottom: '1px solid var(--border)',
                  boxShadow: '1px 0 0 0 var(--border)',
                }}
              >
                <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[var(--muted)]">
                  Player
                </span>
              </th>
              {columns.map((col) => {
                const active = sortKey === col.key;
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sortDir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    style={{
                      width: STAT_COL,
                      minWidth: STAT_COL,
                      background: 'var(--surface)',
                      borderBottom: '1px solid var(--border)',
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => onHeaderClick(col)}
                      title={col.title ?? col.label}
                      // 44px min touch target per the mobile rules in CLAUDE.md.
                      className="w-full h-11 px-1 flex items-center justify-end gap-0.5 cursor-pointer select-none transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60 rounded"
                      style={{ color: active ? accentColor : 'var(--muted)' }}
                    >
                      <span className="text-[9px] font-bold uppercase tracking-[0.08em] leading-none">
                        {col.label}
                      </span>
                      {active &&
                        (sortDir === 'asc' ? (
                          <ArrowUp size={9} strokeWidth={3.5} />
                        ) : (
                          <ArrowDown size={9} strokeWidth={3.5} />
                        ))}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => {
              const player = getPlayer(row);
              // Rank follows the ACTIVE sort — sorting by Average makes the
              // best average #1. A rank pinned to season order would read as
              // "2, 1, 4, 3" down the column and look like a bug.
              const rank = i + 1;
              const tappable = Boolean(player.id);
              // Zebra striping must be painted per-cell, not per-row: the
              // frozen cell needs its own opaque fill to hide what scrolls
              // beneath it, and a transparent stripe would show through.
              const rowBg =
                i % 2 === 1
                  ? 'color-mix(in srgb, var(--muted) 4%, var(--card))'
                  : 'var(--card)';
              return (
                <tr
                  key={player.id ?? player.name}
                  onClick={tappable ? () => onPlayerTap(player.id!) : undefined}
                  onKeyDown={
                    tappable
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            onPlayerTap(player.id!);
                          }
                        }
                      : undefined
                  }
                  role={tappable ? 'button' : undefined}
                  tabIndex={tappable ? 0 : undefined}
                  aria-label={
                    tappable ? `Rank ${rank}, ${player.name}. Open detailed stats.` : undefined
                  }
                  className={
                    tappable
                      ? 'cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--cricket)]/60'
                      : ''
                  }
                >
                  <td
                    className="sticky left-0 z-10 px-3 py-2"
                    style={{
                      width: PLAYER_COL,
                      minWidth: PLAYER_COL,
                      background: rowBg,
                      borderTop: '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                      boxShadow: '1px 0 0 0 var(--border)',
                    }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="flex-shrink-0 w-4 text-[10px] font-bold tabular-nums text-right"
                        style={{ color: rank <= 3 ? accentColor : 'var(--dim)' }}
                      >
                        {rank}
                      </span>
                      <PlayerAvatar
                        name={player.name}
                        photoUrl={player.photoUrl}
                        size={32}
                        ringColor={rank <= 3 ? accentColor : undefined}
                      />
                      <span className="text-[13px] font-semibold truncate min-w-0 text-[var(--text)]">
                        {player.name}
                      </span>
                    </div>
                  </td>
                  {columns.map((col) => {
                    const active = sortKey === col.key;
                    return (
                      <td
                        key={col.key}
                        className="px-1 py-2 text-right tabular-nums"
                        style={{
                          width: STAT_COL,
                          minWidth: STAT_COL,
                          background: rowBg,
                          borderTop:
                            '1px solid color-mix(in srgb, var(--border) 55%, transparent)',
                        }}
                      >
                        <span
                          className={
                            col.primary
                              ? 'text-[13px] font-extrabold'
                              : active
                                ? 'text-[12px] font-bold'
                                : 'text-[12px] font-medium'
                          }
                          style={{
                            color: col.primary
                              ? accentColor
                              : active
                                ? 'var(--text)'
                                : 'var(--muted)',
                          }}
                        >
                          {col.render(row)}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </ScrollArea>
    </div>
  );
}

/* Horizontal scroll container with an edge fade that tells the user there is
   more to the right — without it, a phone user has no cue that the table
   scrolls at all. The fade disappears once they reach the end. */
function ScrollArea({ children, minWidth }: { children: ReactNode; minWidth: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(false);
  // Start false so a desktop table that fits never flashes a fade it doesn't
  // need; the mount measurement below turns it on when there really is overflow.
  const [scrollable, setScrollable] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // 2px slack: sub-pixel layout means scrollLeft rarely hits the exact max.
    setAtEnd(el.scrollLeft + el.clientWidth >= el.scrollWidth - 2);
    setScrollable(el.scrollWidth > el.clientWidth + 2);
  }, []);

  // Measure on mount and on resize — rotating the phone or switching tabs
  // changes whether the fade is warranted.
  useEffect(() => {
    measure();
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [measure, minWidth]);

  return (
    <div
      className="relative rounded-2xl overflow-hidden"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
    >
      <div
        ref={ref}
        onScroll={measure}
        // -webkit-overflow-scrolling is the iOS momentum-scroll opt-in; without
        // it the table drags stiffly inside the page's own vertical scroll.
        className="overflow-x-auto overflow-y-hidden [-webkit-overflow-scrolling:touch]"
        style={{ scrollbarWidth: 'thin' }}
      >
        <div style={{ minWidth: `${minWidth}px` }}>{children}</div>
      </div>
      {scrollable && !atEnd && (
        <div
          aria-hidden
          className="absolute top-0 right-0 bottom-0 w-8 pointer-events-none transition-opacity"
          style={{
            background: 'linear-gradient(to right, transparent, var(--card))',
          }}
        />
      )}
    </div>
  );
}
