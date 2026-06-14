'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Text,
  SegmentedControl,
  Skeleton,
  EmptyState,
} from '@/components/ui';
import { NumberTicker } from '@/components/ui/number-ticker';
import { ChartColumnBig, ChevronDown, ChevronRight, Info, Star, Hand, Trophy, XCircle } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';
import { GiTennisBall } from 'react-icons/gi';
import SeasonSelector from '../../components/SeasonSelector';
// ── New mobile-redesign components (parallel agent build, integrated here) ──
import StickyPillTabs, { type StickyTabKey } from './StickyPillTabs';
import LeaderboardCard from './LeaderboardCard';
import TopPerformersCarousel from './TopPerformersCarousel';
import PlayerDetailSheet from './PlayerDetailSheet';
import { AllRoundFormulaCard, CatchesRulesCard, BestSpellChip, EconomyHeatBadge } from './TabIntroCards';
import {
  computeTopPerformers,
  computeBestBowlingFigures,
  recentSeriesForPlayer,
  recentBattingDetailedForPlayer,
  recentBowlingDetailedForPlayer,
  compareBattingRows,
  compareBowlingRows,
  compareCatchesRows,
  type RecentBattingEntry,
  type RecentBowlingEntry,
} from '../lib/computeStats';

// ── Types matching the Supabase views & raw tables ────────────────────────

type BattingSeasonRow = {
  team_id: string;
  player_id: string | null;
  player_name: string;
  innings: number;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  not_outs: number;
  dismissals: number;
  highest_score: number;
  batting_average: number | null;
  strike_rate: number | null;
};

type BowlingSeasonRow = {
  team_id: string;
  player_id: string | null;
  player_name: string;
  innings: number;
  balls: number;
  maidens: number;
  runs: number;
  wickets: number;
  bowling_average: number | null;
  economy: number | null;
  best_wickets: number;
};

// Full per-innings batting row (richer than the dismissal-only fetch we used
// before). Used both for catches parsing and for per-match detail panels.
type BattingMatchRow = {
  match_row_id: string;
  team_id: string;
  player_id: string | null;
  cricclubs_name: string;
  batting_team: string;
  innings_number: number;
  batting_position: number | null;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number | null;
  dismissal: string | null;
  not_out: boolean;
  did_not_bat: boolean;
};

type BowlingMatchRow = {
  match_row_id: string;
  team_id: string;
  player_id: string | null;
  cricclubs_name: string;
  bowling_team: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
  economy: number | null;
};

type MatchRow = {
  id: string;
  team_id: string;
  team_a: string;
  team_b: string;
  match_date: string | null;
  winner_team: string | null;
  league_name: string | null;
  division: string | null;
};

type RosterRow = {
  id: string;
  name: string;
  photo_url?: string | null;
};

type Tab = StickyTabKey; // 'batting' | 'bowling' | 'allround' | 'catches'

type CatchesRow = {
  player_id: string;
  player_name: string;
  catches: number;
};

// Per-match catch event — used to render the catches detail panel
// (e.g. "vs Sapphires (Apr 25): 2 catches").
type CatchEvent = {
  catcher_player_id: string;
  match_row_id: string;
};

type AllRoundRow = {
  player_id: string;
  player_name: string;
  innings: number;
  runs: number;
  wickets: number;
  catches: number;
  score: number;
};

// ── Catches parsing ───────────────────────────────────────────────────────
//
// Cricclubs dismissal text follows a few patterns. We extract the FIELDER:
//   "c X b Y"           → fielder = X
//   "c †X b Y"          → fielder = X (wicketkeeper, with the dagger marker)
//   "c & b X"           → caught & bowled — fielder = X (the bowler)
//   "st †X b Y"         → stumped — credited as a "fielder" too for v1
// Anything else (run out, bowled, lbw, hit wicket, etc.) yields no fielder.
const extractFielderShortName = (dismissal: string): string | null => {
  const text = dismissal.trim();
  // Caught and bowled: the bowler is the fielder
  const cAndB = text.match(/^c\s*&\s*b\s+(.+)$/i);
  if (cAndB) return cAndB[1].trim();
  // Caught or stumped: capture the fielder name between the marker and "b"
  const std = text.match(/^(?:c|st)\s+(?:†\s*)?([^]+?)\s+b\s+/i);
  if (std) return std[1].trim();
  return null;
};

const computeCatches = (
  battingRows: BattingMatchRow[],
  roster: RosterRow[],
  myTeamName: string,
): { totals: CatchesRow[]; events: CatchEvent[] } => {
  // Catches are credited to fielders on the OPPOSING team in a given innings.
  // In our data, our roster's catches are recorded only when the batting_team
  // is NOT our team (i.e., the opposition is batting and we are fielding).
  const counts = new Map<string, number>();
  const events: CatchEvent[] = [];
  for (const d of battingRows) {
    if (!d.dismissal) continue;
    if (d.batting_team === myTeamName) continue; // we batted; opposition fielded
    const fielder = extractFielderShortName(d.dismissal);
    if (!fielder) continue;
    // Prefix-match against roster names (case-insensitive). Cricclubs uses
    // short forms like "Bhaskar B" vs roster "Bhaskar Baachi"; prefix wins.
    const fLow = fielder.toLowerCase();
    const match = roster.find((r) => r.name.toLowerCase().startsWith(fLow));
    if (!match) continue;
    counts.set(match.id, (counts.get(match.id) ?? 0) + 1);
    events.push({ catcher_player_id: match.id, match_row_id: d.match_row_id });
  }
  const totals = [...counts.entries()].map(([player_id, catches]) => {
    const r = roster.find((p) => p.id === player_id)!;
    return { player_id, player_name: r.name, catches };
  });
  return { totals, events };
};

const computeAllRound = (
  batting: BattingSeasonRow[],
  bowling: BowlingSeasonRow[],
  catches: CatchesRow[],
): AllRoundRow[] => {
  const byPlayer = new Map<string, AllRoundRow>();
  const ensure = (id: string, name: string) => {
    if (!byPlayer.has(id)) {
      byPlayer.set(id, {
        player_id: id,
        player_name: name,
        innings: 0,
        runs: 0,
        wickets: 0,
        catches: 0,
        score: 0,
      });
    }
    return byPlayer.get(id)!;
  };
  for (const b of batting) {
    if (!b.player_id) continue;
    const r = ensure(b.player_id, b.player_name);
    r.runs = b.runs;
    r.innings = Math.max(r.innings, b.innings);
  }
  for (const b of bowling) {
    if (!b.player_id) continue;
    const r = ensure(b.player_id, b.player_name);
    r.wickets = b.wickets;
    r.innings = Math.max(r.innings, b.innings);
  }
  for (const c of catches) {
    const r = ensure(c.player_id, c.player_name);
    r.catches = c.catches;
  }
  // Score formula: runs/25 + wickets + catches/2 — common all-rounder weighting.
  for (const r of byPlayer.values()) {
    r.score = +(r.runs / 25 + r.wickets + r.catches / 2).toFixed(2);
  }
  // Only include players who actually contributed in ≥2 disciplines.
  return [...byPlayer.values()]
    .filter((r) => [r.runs > 0, r.wickets > 0, r.catches > 0].filter(Boolean).length >= 2)
    .sort((a, b) => b.score - a.score);
};

// ── Detail-row helpers ────────────────────────────────────────────────────

const formatMatchDate = (iso: string | null): string => {
  if (!iso) return '';
  // Append a noon-local time so DATE columns ('YYYY-MM-DD') don't get pulled
  // back by a day in west-of-UTC timezones. JS would otherwise parse the
  // bare ISO date as UTC midnight, which is the previous day in PT.
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

// Strip the "MTCA " club prefix from team names — every team in this league
// shares it, so it's noise inside a per-match detail panel.
const shortenOpponent = (name: string): string =>
  name.replace(/^MTCA\s+/i, '');

const formatFigures = (
  overs: number,
  maidens: number,
  runs: number,
  wickets: number,
): string => `${overs.toFixed(1)}-${maidens}-${runs}-${wickets}`;

// Each row is the data for a single match in a player's expanded panel.
type DetailRow = {
  matchKey: string;
  cells: React.ReactNode[];
};

// Compact mini-table used inside the expanded panel of the parent table.
function DetailTable({
  headers,
  rows,
  emptyText,
}: {
  headers: string[];
  rows: DetailRow[];
  emptyText: string;
}) {
  if (rows.length === 0) {
    return (
      <Text as="p" size="2xs" color="muted">
        {emptyText}
      </Text>
    );
  }
  return (
    // table-auto + width:1% on stat columns shrinks them to content. The
    // first (Match) column gets the remaining space but stats sit tight on
    // the right — eliminates the dead-space gap that w-full + auto-distribute
    // creates when content is short.
    <table className="w-full border-collapse table-auto">
      <thead>
        <tr>
          {headers.map((h, i) => (
            <th
              key={h}
              className={
                'pb-1.5 px-2 whitespace-nowrap ' +
                (i === 0 ? 'text-left' : 'text-right')
              }
              style={i === 0 ? undefined : { width: '1%' }}
            >
              <Text as="span" size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
                {h}
              </Text>
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.matchKey} className="border-t border-[var(--border)]/30">
            {r.cells.map((c, i) => (
              <td
                key={i}
                className={
                  'py-1.5 px-2 ' +
                  (i === 0 ? 'text-left' : 'text-right tabular-nums whitespace-nowrap')
                }
                style={i === 0 ? undefined : { width: '1%' }}
              >
                {c}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Sortable table primitive ──────────────────────────────────────────────

type Column<Row> = {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
  primary?: boolean; // visually emphasize this column (the headline stat)
  get: (row: Row) => string | number | null;
  format?: (row: Row) => string;
};

/* ── Rank badge — neutral numeric for every rank. Compact so a single-line
   player name reads as the dominant element. ── */
function RankBadge({ rank }: { rank: number }) {
  return (
    <div
      className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-semibold"
      style={{ color: 'var(--dim)' }}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </div>
  );
}

/* ── Player cell — single-line full name with truncation. Names like
   "Manigopal V" or "Madhu G" don't split cleanly into first/last, so we
   keep the canonical display intact. Optional chevron signals expandable. ── */
function PlayerCell({
  name,
  rank,
  chevron,
}: {
  name: string;
  rank: number;
  chevron?: 'right' | 'down' | null;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <RankBadge rank={rank} />
      <Text as="span" size="sm" weight="semibold" truncate className="min-w-0 flex-1">
        {name}
      </Text>
      {chevron === 'right' && (
        <ChevronRight size={14} className="flex-shrink-0 text-[var(--muted)]" />
      )}
      {chevron === 'down' && (
        <ChevronDown size={14} className="flex-shrink-0 text-[var(--cricket)]" />
      )}
    </div>
  );
}

function StatTable<Row extends { player_name: string; player_id: string | null }>({
  rows,
  columns,
  defaultSortKey,
  emptyLabel,
  renderDetail,
}: {
  rows: Row[];
  columns: Column<Row>[];
  defaultSortKey: string;
  emptyLabel: string;
  renderDetail?: (row: Row) => React.ReactNode | null;
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const toggleExpand = (id: string | null) => {
    if (!id) return;
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const sorted = useMemo(() => {
    const col = columns.find((c) => c.key === sortKey);
    if (!col) return rows;
    return [...rows].sort((a, b) => {
      const av = col.get(a);
      const bv = col.get(b);
      const an = av === null || av === undefined ? -Infinity : av;
      const bn = bv === null || bv === undefined ? -Infinity : bv;
      if (an < bn) return sortDir === 'asc' ? -1 : 1;
      if (an > bn) return sortDir === 'asc' ? 1 : -1;
      return a.player_name.localeCompare(b.player_name);
    });
  }, [rows, sortKey, sortDir, columns]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<ChartColumnBig size={32} />}
        title="No data yet"
        description={emptyLabel}
      />
    );
  }

  const onHeaderClick = (col: Column<Row>) => {
    if (col.sortable === false) return;
    if (sortKey === col.key) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(col.key);
      setSortDir(col.numeric ? 'desc' : 'asc');
    }
  };

  // Adaptive min-width: tables with few columns (catches=2, all-round=5)
  // shouldn't stretch to 560px and look empty. Wide-stat tables (batting=8,
  // bowling=10) need horizontal scroll on phones.
  const numericCount = columns.filter((c) => c.numeric).length;
  const tableMinWidth = Math.max(260, 140 + numericCount * 56);

  return (
    <div
      className="overflow-x-auto rounded-xl border border-[var(--border)]/60"
      style={{ background: 'var(--card)' }}
    >
      <table className="w-full border-collapse table-auto" style={{ minWidth: `${tableMinWidth}px` }}>
        <thead>
          <tr style={{ background: 'var(--card)' }}>
            {columns.map((c, idx) => {
              const active = sortKey === c.key;
              const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
              const isFirst = idx === 0;
              return (
                <th
                  key={c.key}
                  onClick={() => onHeaderClick(c)}
                  className={
                    (c.numeric ? 'px-2 py-2.5 text-right ' : 'pl-3 pr-2 py-2.5 text-left ') +
                    'whitespace-nowrap ' +
                    (isFirst ? 'sticky left-0 z-10 ' : '') +
                    (c.sortable === false ? '' : 'cursor-pointer select-none')
                  }
                  style={{
                    ...(c.numeric
                      ? { width: '1%' }
                      : { width: 160, minWidth: 160, maxWidth: 160 }),
                    ...(isFirst ? { background: 'var(--card)' } : {}),
                  }}
                >
                  <div style={isFirst ? { width: 152 } : undefined}>
                    <Text
                      as="span"
                      size="2xs"
                      weight={active ? 'bold' : 'semibold'}
                      color={active && c.primary ? 'cricket' : active ? 'default' : 'muted'}
                      uppercase
                      tracking="wider"
                    >
                      {c.label}
                      {arrow}
                    </Text>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => {
            const rank = i + 1;
            const isExpanded = row.player_id ? expandedIds.has(row.player_id) : false;
            const expandable = !!renderDetail && !!row.player_id;
            const rowBg = i % 2 === 0 ? 'var(--card)' : 'var(--surface)';
            return (
              <Fragment key={row.player_id ?? `${row.player_name}-${i}`}>
                <tr
                  onClick={expandable ? () => toggleExpand(row.player_id) : undefined}
                  className={
                    'border-t border-[var(--border)]/50 transition-colors ' +
                    (expandable ? 'cursor-pointer hover:bg-[var(--hover-bg)]' : 'hover:bg-[var(--hover-bg)]')
                  }
                >
                  {columns.map((c, idx) => {
                    const isFirst = idx === 0;
                    if (isFirst) {
                      return (
                        <td
                          key={c.key}
                          className="pl-3 pr-2 py-2.5 sticky left-0 z-10"
                          style={{ width: 160, minWidth: 160, maxWidth: 160, background: rowBg }}
                        >
                          {/* Locked-width inner wrapper guarantees identical
                              visible width across tabs. Browser table-auto
                              honors `width:160` on td loosely; an inner div
                              of fixed width forces consistent truncation. */}
                          <div style={{ width: 152 }}>
                            <PlayerCell
                              name={row.player_name}
                              rank={rank}
                              chevron={expandable ? (isExpanded ? 'down' : 'right') : null}
                            />
                          </div>
                        </td>
                      );
                    }
                    const value = c.format ? c.format(row) : (c.get(row) ?? '—');
                    return (
                      <td
                        key={c.key}
                        className={
                          'px-2 py-2.5 ' +
                          (c.numeric ? 'text-right tabular-nums whitespace-nowrap ' : 'whitespace-nowrap ')
                        }
                        style={c.numeric ? { width: '1%' } : undefined}
                      >
                        <Text
                          as="span"
                          size="sm"
                          weight={c.primary ? 'bold' : 'medium'}
                          color={c.primary ? 'cricket' : 'default'}
                        >
                          {value}
                        </Text>
                      </td>
                    );
                  })}
                </tr>
                {expandable && isExpanded && renderDetail && (
                  <tr className="border-t border-[var(--border)]/30">
                    <td colSpan={columns.length} style={{ background: rowBg, padding: 0 }}>
                      {/* The td is as wide as the parent table (which can exceed
                          the viewport on phones — bowling has 10 cols). Pin the
                          detail panel to the left of the scroll container so it
                          stays visible regardless of horizontal scroll, and let
                          its width shrink to the panel's own content. */}
                      <div
                        className="sticky left-0"
                        style={{ width: 'fit-content', maxWidth: '100vw' }}
                      >
                        <div
                          className="px-3 py-3"
                          style={{ background: 'color-mix(in srgb, var(--cricket) 4%, transparent)' }}
                        >
                          {renderDetail(row)}
                        </div>
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ── Compact sticky hero ──────────────────────────────────────────────────
//
// Replaces (and absorbs) the prior brand banner + SeasonScorecard split.
// Sticky-top during scroll so the season selector + W/L momentum + form
// stay visible while users explore the leaderboard below.
// See docs/PLAYER_STATS_NEW_SPEC.md for the design rationale.
type FormOutcome = 'won' | 'lost' | 'draw';
function CompactHero({
  won, lost, undecided, total, formDescending, streak,
  seasonSelector,
}: {
  won: number;
  lost: number;
  undecided: number;
  total: number;
  formDescending: FormOutcome[];
  streak: { type: FormOutcome; count: number } | null;
  seasonSelector: React.ReactNode;
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 100) : 0);
  const recent = formDescending.slice(0, 5);
  return (
    <div
      // Negative margin escapes the page's px-4 so the hero spans full width;
      // inner padding restores the breathing room. `sticky top-0` keeps the
      // hero pinned during scroll for the scan-first UX described in the spec.
      className="sticky top-0 z-20 -mx-4 px-4 pt-3 pb-2"
      style={{ background: 'var(--bg)' }}
    >
      <div
        className="relative overflow-hidden rounded-2xl px-4 py-3.5"
        style={{
          background: 'var(--card)',
          border: '1px solid var(--border)',
          boxShadow: '0 1px 2px rgba(0,0,0,0.04)',
        }}
      >
        {/* Row 1 — eyebrow + title + season selector */}
        <div className="relative flex items-start justify-between gap-3 mb-2.5">
          <div className="min-w-0">
            <Text as="p" size="2xs" color="cricket" weight="semibold" uppercase tracking="wider" className="mb-0.5 text-[10px]">
              League Performance
            </Text>
            <Text as="h1" size="lg" weight="bold" className="sm:text-[20px] leading-tight">
              Season Stats
            </Text>
          </div>
          <div className="flex-shrink-0">{seasonSelector}</div>
        </div>

        {/* Row 2 — W/L/UND with percentages + streak */}
        <div className="relative flex items-end justify-between gap-3 mb-2.5">
          <div className="flex items-end gap-3.5">
            <MomentumStat label="WON" value={won} pct={pct(won)} color="var(--green)" />
            <MomentumStat label="LOST" value={lost} pct={pct(lost)} color="var(--red)" />
            <MomentumStat label="UND" value={undecided} pct={pct(undecided)} color="var(--muted)" />
          </div>
          {streak && streak.count >= 2 && (() => {
            const tone = streak.type === 'won' ? 'var(--green)' : streak.type === 'lost' ? 'var(--red)' : 'var(--muted)';
            const glyph = streak.type === 'won' ? '🔥' : streak.type === 'lost' ? '❄️' : '⚖️';
            const letter = streak.type === 'won' ? 'W' : streak.type === 'lost' ? 'L' : 'D';
            const hot = streak.count >= 3;
            return (
              <div
                className={
                  'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg flex-shrink-0 ' +
                  (hot ? 'animate-streak-glow' : '')
                }
                style={{
                  background: `color-mix(in srgb, ${tone} 14%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${tone} 32%, transparent)`,
                  ...(hot ? ({ ['--glow-color' as string]: tone }) : {}),
                }}
                aria-label={`${streak.count} match ${streak.type} streak`}
              >
                <span aria-hidden className="text-[14px] leading-none">{glyph}</span>
                <span className="text-[15px] font-bold tabular-nums leading-none" style={{ color: tone }}>
                  <NumberTicker value={streak.count} />
                </span>
                <Text size="2xs" color="muted" className="text-[9px] uppercase tracking-wider font-semibold leading-none">
                  {letter} streak
                </Text>
              </div>
            );
          })()}
        </div>

        {/* Row 3 — Recent form. Newest pulses subtly. */}
        {recent.length > 0 && (
          <div className="relative flex items-center gap-2">
            <Text size="2xs" color="muted" weight="semibold" uppercase tracking="wider" className="text-[10px] flex-shrink-0">
              Form
            </Text>
            <div className="flex items-center gap-1">
              {recent.map((outcome, i) => {
                const tone = outcome === 'won' ? 'var(--green)' : outcome === 'lost' ? 'var(--red)' : 'var(--muted)';
                const letter = outcome === 'won' ? 'W' : outcome === 'lost' ? 'L' : 'D';
                const label = outcome === 'won' ? 'Won' : outcome === 'lost' ? 'Lost' : 'Draw';
                const newest = i === 0;
                return (
                  <span
                    key={i}
                    className={
                      'inline-flex items-center justify-center h-5 w-5 rounded-full text-[10px] font-extrabold ' +
                      (newest ? 'animate-form-pulse' : '')
                    }
                    style={{
                      background: `color-mix(in srgb, ${tone} 22%, transparent)`,
                      color: tone,
                    }}
                    aria-label={label}
                  >
                    {letter}
                  </span>
                );
              })}
              <Text as="span" size="2xs" color="dim" className="ml-1 text-[9px]">newest first</Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MomentumStat({ label, value, pct, color }: { label: string; value: number; pct: number; color: string }) {
  return (
    <div className="flex flex-col items-start leading-none">
      <Text size="2xs" color="muted" weight="semibold" uppercase tracking="wider" className="text-[9px] mb-1">
        {label}
      </Text>
      <span className="text-[22px] font-bold tabular-nums" style={{ color }}>
        <NumberTicker value={value} />
      </span>
      <Text size="2xs" color="dim" className="text-[9px] mt-0.5 font-semibold">
        {pct}%
      </Text>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────

export default function LeagueStatsView() {
  const { currentTeamId, userTeams } = useAuthStore();
  // Pull the cricket-store's seasons loader. Landing directly on
  // /cricket/league-stats (no prior cricket-page visit) leaves `seasons`
  // empty, which makes the SeasonSelector in the hero render "No seasons".
  // Trigger a load on mount — cheap query, idempotent. Only the loader is
  // pulled (not the whole store) so render is not coupled to season changes.
  const loadSeasons = useCricketStore((s) => s.loadSeasons);
  useEffect(() => {
    loadSeasons().catch(() => {
      // Non-fatal — stats can render without seasons; the selector just
      // stays as "No seasons" until the next attempt.
    });
  }, [loadSeasons]);
  const cricclubsTeamName = useMemo(() => {
    // In cricclubs scorecards our team is named "MTCA Sunrisers Manteca";
    // here we accept whatever cricclubs uses by checking if the cricket_team
    // name is a suffix. Fallback to the literal string.
    const myTeam = userTeams.find((t) => t.team_id === currentTeamId);
    if (!myTeam) return 'MTCA Sunrisers Manteca';
    return `MTCA ${myTeam.team_name}`;
  }, [currentTeamId, userTeams]);

  const [tab, setTab] = useState<Tab>('batting');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [batting, setBatting] = useState<BattingSeasonRow[]>([]);
  const [bowling, setBowling] = useState<BowlingSeasonRow[]>([]);
  const [battingMatches, setBattingMatches] = useState<BattingMatchRow[]>([]);
  const [bowlingMatches, setBowlingMatches] = useState<BowlingMatchRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);
  // Bump to re-fire the data-load effect (used by the error-state Retry button).
  const [reloadKey, setReloadKey] = useState(0);
  const reload = () => setReloadKey((k) => k + 1);

  // ── Phased load: render the main batting/bowling tables as soon as the
  // 4 fast aggregate queries return; let the heavier per-innings queries
  // (which only feed drilldowns + catches/all-rounder rankings) fill in
  // afterwards. ~30-50% perceived-load-time win when raw innings tables grow.
  useEffect(() => {
    if (!currentTeamId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);

    const supabase = getSupabaseClient();
    if (!supabase) {
      setError('Supabase client unavailable');
      setLoading(false);
      return;
    }

    // Fast tier — season aggregates, matches, roster (all small views/tables).
    Promise.all([
      supabase.from('cricclubs_batting_season').select('*').eq('team_id', currentTeamId),
      supabase.from('cricclubs_bowling_season').select('*').eq('team_id', currentTeamId),
      supabase
        .from('cricclubs_matches')
        .select('id, team_id, team_a, team_b, match_date, winner_team, league_name, division')
        .eq('team_id', currentTeamId)
        .order('match_date', { ascending: true }),
      supabase
        .from('cricket_players')
        .select('id, name, photo_url')
        .eq('team_id', currentTeamId)
        .eq('is_active', true),
    ]).then(([bat, bowl, mch, ros]) => {
      if (cancelled) return;
      const err = bat.error ?? bowl.error ?? mch.error ?? ros.error;
      if (err) {
        setError(err.message);
        setLoading(false);
        return;
      }
      setBatting((bat.data ?? []) as BattingSeasonRow[]);
      setBowling((bowl.data ?? []) as BowlingSeasonRow[]);
      setMatches((mch.data ?? []) as MatchRow[]);
      setRoster((ros.data ?? []) as RosterRow[]);
      setLoading(false);
    });

    // Slow tier — raw per-innings rows for drilldowns + catches/all-rounders.
    // Fires concurrently; UI fills in when ready without blocking first paint.
    Promise.all([
      supabase
        .from('cricclubs_batting')
        .select(
          'match_row_id, team_id, player_id, cricclubs_name, batting_team, ' +
            'innings_number, batting_position, runs, balls, fours, sixes, ' +
            'strike_rate, dismissal, not_out, did_not_bat',
        )
        .eq('team_id', currentTeamId),
      supabase
        .from('cricclubs_bowling')
        .select(
          'match_row_id, team_id, player_id, cricclubs_name, bowling_team, ' +
            'overs, maidens, runs, wickets, economy',
        )
        .eq('team_id', currentTeamId),
    ]).then(([batm, bowm]) => {
      if (cancelled) return;
      // Per-innings errors don't block the main UI — log and continue.
      if (batm.error || bowm.error) {
        console.warn('League stats: per-innings load failed', batm.error ?? bowm.error);
        return;
      }
      setBattingMatches((batm.data ?? []) as BattingMatchRow[]);
      setBowlingMatches((bowm.data ?? []) as BowlingMatchRow[]);
    });

    return () => { cancelled = true; };
  }, [currentTeamId, reloadKey]);

  // Derived: catches (totals + per-match events) and all-rounders
  const { catchesTotals, catchEvents } = useMemo(() => {
    const r = computeCatches(battingMatches, roster, cricclubsTeamName);
    return { catchesTotals: r.totals, catchEvents: r.events };
  }, [battingMatches, roster, cricclubsTeamName]);
  const allRound = useMemo(
    () => computeAllRound(batting, bowling, catchesTotals),
    [batting, bowling, catchesTotals],
  );

  // Lookup: match_row_id → opponent name + display date.
  const matchLookup = useMemo(() => {
    const m = new Map<string, { opponent: string; date: string | null }>();
    for (const match of matches) {
      const opponent = match.team_a === cricclubsTeamName ? match.team_b : match.team_a;
      m.set(match.id, { opponent, date: match.match_date });
    }
    return m;
  }, [matches, cricclubsTeamName]);

  // Lookup: player_id → list of their batting / bowling rows / catches by match.
  const battingByPlayer = useMemo(() => {
    const m = new Map<string, BattingMatchRow[]>();
    for (const r of battingMatches) {
      if (!r.player_id) continue;
      if (!m.has(r.player_id)) m.set(r.player_id, []);
      m.get(r.player_id)!.push(r);
    }
    return m;
  }, [battingMatches]);

  const bowlingByPlayer = useMemo(() => {
    const m = new Map<string, BowlingMatchRow[]>();
    for (const r of bowlingMatches) {
      if (!r.player_id) continue;
      if (!m.has(r.player_id)) m.set(r.player_id, []);
      m.get(r.player_id)!.push(r);
    }
    return m;
  }, [bowlingMatches]);

  const catchesByPlayer = useMemo(() => {
    const m = new Map<string, Map<string, number>>(); // player_id -> match_row_id -> count
    for (const ev of catchEvents) {
      if (!m.has(ev.catcher_player_id)) m.set(ev.catcher_player_id, new Map());
      const inner = m.get(ev.catcher_player_id)!;
      inner.set(ev.match_row_id, (inner.get(ev.match_row_id) ?? 0) + 1);
    }
    return m;
  }, [catchEvents]);

  // Derived: W-L summary + recent form + current streak.
  const seasonOutcomes = useMemo(() => {
    const myKeyword = (cricclubsTeamName.match(/sunrisers.*/i)?.[0] ?? cricclubsTeamName).toLowerCase();
    type Outcome = 'won' | 'lost' | 'draw';
    const outcomes: { date: string; outcome: Outcome | 'pending' }[] = matches.map((m) => {
      if (!m.winner_team) return { date: m.match_date ?? '', outcome: 'pending' };
      const won = m.winner_team.toLowerCase().includes(myKeyword);
      return { date: m.match_date ?? '', outcome: won ? 'won' : 'lost' };
    });

    const total = matches.length;
    const won = outcomes.filter((o) => o.outcome === 'won').length;
    const lost = outcomes.filter((o) => o.outcome === 'lost').length;
    const undecided = total - won - lost;

    // Form is most-recent-first, decided matches only.
    const formDescending = outcomes
      .filter((o) => o.outcome !== 'pending')
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((o) => o.outcome as Outcome);

    // Streak: how many in a row of the most-recent outcome.
    let streak: { type: Outcome; count: number } | null = null;
    if (formDescending.length > 0) {
      const first = formDescending[0]!;
      let count = 1;
      for (let i = 1; i < formDescending.length; i++) {
        if (formDescending[i] === first) count += 1;
        else break;
      }
      if (count >= 2) streak = { type: first, count };
    }

    return { total, won, lost, undecided, formDescending, streak };
  }, [matches, cricclubsTeamName]);
  const summary = seasonOutcomes;

  // ── New redesign derived data ──────────────────────────────────────────────
  // Top performers carousel (Summary Layer per spec): 5 season-highlight cards.
  const topPerformers = useMemo(
    () => computeTopPerformers(batting, bowling, catchesTotals, battingMatches, bowlingMatches, matches),
    [batting, bowling, catchesTotals, battingMatches, bowlingMatches, matches],
  );

  // Best bowling figures per player ("4/18" display strings). Used in the
  // Bowling tab footer to surface the season-best spell per player.
  const bestBowlingByPlayer = useMemo(
    () => computeBestBowlingFigures(bowlingMatches),
    [bowlingMatches],
  );

  // player_id → photo_url Map for fast Avatar lookups across cards.
  const photoUrlByPlayer = useMemo(() => {
    const m = new Map<string, string | null>();
    for (const r of roster) m.set(r.id, r.photo_url ?? null);
    return m;
  }, [roster]);

  // PlayerDetailSheet state — opens when a leaderboard card is tapped.
  // `context` is the originating tab so the sheet renders the right summary.
  const [sheetOpen, setSheetOpen] = useState(false);
  const [sheetPlayerId, setSheetPlayerId] = useState<string | null>(null);
  const [sheetContext, setSheetContext] = useState<Tab>('batting');
  const openPlayerSheet = (playerId: string | null, ctx: Tab) => {
    if (!playerId) return;
    setSheetPlayerId(playerId);
    setSheetContext(ctx);
    setSheetOpen(true);
  };
  const closePlayerSheet = () => setSheetOpen(false);

  // Build the props object for PlayerDetailSheet when open.
  const sheetPlayer = useMemo(() => {
    if (!sheetPlayerId) return null;
    const rosterRow = roster.find((r) => r.id === sheetPlayerId);
    if (!rosterRow) return null;
    const bat = batting.find((b) => b.player_id === sheetPlayerId);
    const bowl = bowling.find((b) => b.player_id === sheetPlayerId);
    const ct = catchesTotals.find((c) => c.player_id === sheetPlayerId);
    return {
      player_id: sheetPlayerId,
      name: rosterRow.name,
      photo_url: rosterRow.photo_url ?? null,
      summary: {
        runs: bat?.runs,
        innings: bat?.innings ?? bowl?.innings,
        average: bat?.batting_average,
        strike_rate: bat?.strike_rate,
        wickets: bowl?.wickets,
        economy: bowl?.economy,
        best_wickets: bowl?.best_wickets,
        catches: ct?.catches,
      },
    };
  }, [sheetPlayerId, roster, batting, bowling, catchesTotals]);

  if (loading) {
    // Skeleton mimics the final layout: hero card, top-performers carousel
    // row, sticky tab pill bar, and 4 leaderboard card placeholders. This
    // avoids the disorienting "shape-shift" you get when generic rectangles
    // resolve into a totally different layout (spec P9, mobile UX principle).
    return <LeagueStatsSkeleton />;
  }

  if (error) {
    return (
      <EmptyState
        icon={<ChartColumnBig size={32} />}
        title="Couldn't load stats"
        description={error}
        action={{ label: 'Retry', onClick: reload }}
      />
    );
  }

  return (
    <>
    <div className="space-y-3">
      {/* Compact sticky hero — absorbs the prior brand banner + SeasonScorecard.
          Title + season selector + W/L/UND momentum + recent form + streak,
          all in ~180px. Sticky-top during scroll for scan-first UX. */}
      <CompactHero
        won={summary.won}
        lost={summary.lost}
        undecided={summary.undecided}
        total={summary.total}
        formDescending={summary.formDescending}
        streak={summary.streak}
        seasonSelector={<SeasonSelector />}
      />

      {/* Top Performers — Summary Layer per spec. Pre-computed cards
          showing the leaders across disciplines. Tap → opens player sheet
          in that card's discipline context. */}
      {topPerformers.length > 0 && (
        <TopPerformersCarousel
          cards={topPerformers}
          photoUrlByPlayer={photoUrlByPlayer}
          onCardTap={(playerId) => {
            // Map the carousel card's discipline to the right sheet context
            const card = topPerformers.find((c) => c.player_id === playerId);
            const ctx: Tab = card?.category === 'wickets' || card?.category === 'economy'
              ? 'bowling'
              : card?.category === 'catches'
                ? 'catches'
                : card?.category === 'mvp'
                  ? 'allround'
                  : 'batting';
            openPlayerSheet(playerId, ctx);
          }}
        />
      )}

      {/* Tab bar — sticky pill tabs with 4-tab (Catches restored) + animated
          underline. Sits below the CompactHero (sticky top 0) and acts as
          its own sticky layer. Together they form the persistent "scan
          first" header bar. */}
      <StickyPillTabs
        active={tab}
        onChange={setTab}
        stickyTop="0"
      />

      {/* Tab bodies — card-first per spec. Each tab maps its rows to
          <LeaderboardCard>s; tapping a card opens the PlayerDetailSheet.
          Wrapper is keyed on `tab` so switching tabs replays the slide-in
          animation, giving a subtle but native-feeling transition. */}
      <div key={tab} className="animate-slide-in space-y-3">
        {tab === 'batting' && (
          <BattingTabBody
            rows={batting}
            photoUrlByPlayer={photoUrlByPlayer}
            battingMatches={battingMatches}
            bowlingMatches={bowlingMatches}
            matches={matches}
            onPlayerTap={(id) => openPlayerSheet(id, 'batting')}
          />
        )}

        {tab === 'bowling' && (
          <BowlingTabBody
            rows={bowling}
            photoUrlByPlayer={photoUrlByPlayer}
            bestBowlingByPlayer={bestBowlingByPlayer}
            bowlingMatches={bowlingMatches}
            matches={matches}
            onPlayerTap={(id) => openPlayerSheet(id, 'bowling')}
          />
        )}

        {tab === 'allround' && (
          <>
            <AllRoundTabBody
              rows={allRound}
              photoUrlByPlayer={photoUrlByPlayer}
              onPlayerTap={(id) => openPlayerSheet(id, 'allround')}
            />
            {/* Formula explainer moved to bottom — leaders/cards are the
                primary content; the algorithm reference sits as a footer
                so it doesn't push the leaderboard below the fold. */}
            <AllRoundFormulaCard />
          </>
        )}

        {tab === 'catches' && (
          <>
            <CatchesTabBody
              rows={catchesTotals}
              photoUrlByPlayer={photoUrlByPlayer}
              catchesByPlayer={catchesByPlayer}
              onPlayerTap={(id) => openPlayerSheet(id, 'catches')}
            />
            {/* Catch-type explainer moved to bottom (was above the leaders). */}
            <CatchesRulesCard />
          </>
        )}
      </div>

    </div>

    {/* Player detail bottom sheet — opens from any tab's card tap or from
        a top-performer carousel tap. Renders the per-context summary +
        trends + match timeline + achievements. */}
    {sheetPlayer && (
      <PlayerDetailSheet
        open={sheetOpen}
        onClose={closePlayerSheet}
        context={sheetContext}
        player={sheetPlayer}
        battingInnings={battingByPlayer.get(sheetPlayer.player_id) ?? []}
        bowlingInnings={bowlingByPlayer.get(sheetPlayer.player_id) ?? []}
        catchesByMatch={catchesByPlayer.get(sheetPlayer.player_id)}
        matchLookup={matchLookup}
      />
    )}
  </>
  );
}

/* Cricket-themed empty state per tab — discipline icon inside a soft halo
   ring + optimistic copy. Replaces the generic ChartColumnBig fallback.
   Avoids feeling "broken" when a season starts with no data yet. */
function TabEmptyState({
  accent,
  icon,
  title,
  description,
}: {
  accent: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center text-center py-10 px-6 relative overflow-hidden rounded-2xl"
      style={{
        background: 'var(--card)',
        border: '1px solid var(--border)',
      }}
    >
      <div
        className="relative h-16 w-16 rounded-full flex items-center justify-center mb-3"
        style={{
          background: `color-mix(in srgb, ${accent} 10%, transparent)`,
          color: accent,
        }}
      >
        {icon}
      </div>
      <Text as="h3" size="md" weight="bold" className="relative mb-1">{title}</Text>
      <Text as="p" size="sm" color="muted" className="relative max-w-[260px] leading-relaxed">
        {description}
      </Text>
    </div>
  );
}

// ── Layout-mimicking loading skeleton ─────────────────────────────────────
//
// Mirrors the final shape (hero card, top-performers row, sticky tab bar,
// leaderboard cards) so the page doesn't visually "jump" when data lands.
// All blocks use the shared `<Skeleton>` shimmer so reduced-motion is honored.

function LeagueStatsSkeleton() {
  return (
    <div className="space-y-3.5">
      {/* Hero placeholder — matches CompactHero height + rounding. */}
      <Skeleton className="h-[148px] rounded-2xl" />

      {/* Top performers carousel placeholder — 3 visible peeks of cards. */}
      <div className="-mx-4 px-4 overflow-hidden">
        <div className="flex gap-3">
          <CarouselCardSkeleton />
          <CarouselCardSkeleton />
          <CarouselCardSkeleton />
        </div>
      </div>

      {/* Sticky pill tabs placeholder. */}
      <Skeleton className="h-11 rounded-full" />

      {/* Leaderboard cards — internal structure mimics the real card so
          the layout doesn't visibly lurch when data lands. */}
      <div className="space-y-3.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <LeaderboardCardSkeleton key={i} podium={i < 3} />
        ))}
      </div>
    </div>
  );
}

function LeaderboardCardSkeleton({ podium }: { podium: boolean }) {
  return (
    <div
      className={`relative rounded-[20px] overflow-hidden border border-[var(--border)]/30 ${
        podium ? 'px-4 py-4' : 'px-4 py-3'
      }`}
      style={{ background: 'var(--card)' }}
    >
      <div className="flex items-start gap-3 min-w-0">
        {/* Avatar circle. */}
        <Skeleton className="h-12 w-12 rounded-full flex-shrink-0" />
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          {/* Header row — rank dot + name line. */}
          <div className="flex items-center gap-2">
            <Skeleton className="h-6 w-6 rounded-full flex-shrink-0" />
            <Skeleton className="h-4 w-32 rounded-md" />
          </div>
          {/* Hero numeral + label. */}
          <div className="flex items-baseline gap-2">
            <Skeleton className="h-9 w-16 rounded-md" />
            <Skeleton className="h-3 w-10 rounded-md" />
          </div>
          {/* Stat chip row. */}
          <div className="flex items-center gap-1.5">
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
            <Skeleton className="h-5 w-14 rounded-full" />
          </div>
          {/* Footer line. */}
          <Skeleton className="h-3 w-40 rounded-md" />
        </div>
      </div>
    </div>
  );
}

function CarouselCardSkeleton() {
  return (
    <div
      className="flex-shrink-0 w-[156px] rounded-2xl p-3 border border-[var(--border)]/30 space-y-2"
      style={{ background: 'var(--card)' }}
    >
      <Skeleton className="h-7 w-7 rounded-full" />
      <Skeleton className="h-3 w-20 rounded-md" />
      <Skeleton className="h-12 w-12 rounded-full" />
      <Skeleton className="h-7 w-20 rounded-md" />
      <Skeleton className="h-3 w-24 rounded-md" />
      <Skeleton className="h-[22px] w-full rounded-md" />
    </div>
  );
}

// ── Card-based tab body components ────────────────────────────────────────
//
// Each tab body is a vertical stack of LeaderboardCards. The card primary/
// footer/rightInline slots differ per discipline; the wrappers below hold
// each tab's stat-cell shape so the main render stays readable.

function StatCell({
  label, value, accent, primary,
}: { label: string; value: string | number; accent?: string; primary?: boolean }) {
  // Apply count-up animation only to integer sport counts on the primary stat
  // (runs / wickets / catches). Avoids running the ticker on decimals (Avg, SR,
  // Econ) where the partial frames look noisy, and on already-formatted strings
  // like "4.5" overs. Memory `feedback_number_ticker_currency` explicitly
  // limits the ticker to sport counts, never currency — that's why we don't use
  // it elsewhere on the page.
  const useTicker =
    primary && typeof value === 'number' && Number.isInteger(value);
  // Strong size hierarchy: the primary stat dominates (22px), secondary stats
  // sit smaller (14px). Without this, adjacent values like "43.33" and "49.4"
  // collide visually in a grid since the eye reads them as a single string.
  return (
    <div className="flex flex-col items-start leading-none min-w-0">
      <span
        className={
          primary
            ? 'text-[22px] font-bold tabular-nums'
            : 'text-[14px] font-bold tabular-nums text-[var(--text)]'
        }
        style={primary && accent ? { color: accent } : undefined}
      >
        {useTicker ? <NumberTicker value={value as number} /> : value}
      </span>
      <span className="text-[9px] font-semibold mt-1 uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
    </div>
  );
}

function BattingTabBody({
  rows, photoUrlByPlayer, battingMatches, bowlingMatches: _bowlingMatches, matches, onPlayerTap,
}: {
  rows: BattingSeasonRow[];
  photoUrlByPlayer: Map<string, string | null>;
  battingMatches: BattingMatchRow[];
  bowlingMatches: BowlingMatchRow[];
  matches: MatchRow[];
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        accent="var(--stat-batting)"
        icon={<MdSportsCricket size={32} />}
        title="First innings coming soon"
        description="Batting stats land as soon as the first scorecard publishes for this season."
      />
    );
  }
  // Sort using the shared comparator so the carousel "Top Run Scorer" and
  // the leaderboard rank #1 never disagree on a tie.
  const sorted = [...rows].sort(compareBattingRows);
  return (
    <div className="space-y-3.5">
      {sorted.map((row, i) => {
        const rank = i + 1;
        const recent: Array<RecentBattingEntry | null> = row.player_id
          ? recentBattingDetailedForPlayer(row.player_id, battingMatches, matches)
          : [];
        return (
          <LeaderboardCard
            key={row.player_id ?? row.player_name}
            rank={rank}
            playerName={row.player_name}
            playerPhotoUrl={row.player_id ? photoUrlByPlayer.get(row.player_id) : null}
            accentColor="var(--stat-batting)"
            revealIndex={i}
            primaryRow={
              <BattingHeroStats
                runs={row.runs}
                innings={row.innings}
                average={row.batting_average}
                strikeRate={row.strike_rate}
              />
            }
            footer={
              <BattingFooter
                highest={row.highest_score}
                fours={row.fours}
                sixes={row.sixes}
                recent={recent}
              />
            }
            onTap={row.player_id ? () => onPlayerTap(row.player_id!) : undefined}
          />
        );
      })}
    </div>
  );
}

/* Cinematic batting hero — large primary numeral + supporting stat chips.
   The eye lands on RUNS first, then scans Avg/SR/Inn as discrete pill chips
   (faster than text-with-dots, and the pill shape suggests "interactive
   data" rather than "prose"). */
function BattingHeroStats({
  runs, innings, average, strikeRate,
}: { runs: number; innings: number; average: number | null; strikeRate: number | null }) {
  return (
    <div className="flex flex-col gap-2 leading-none">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold tabular-nums leading-none"
          style={{
            color: 'var(--stat-batting)',
          }}
        >
          <NumberTicker value={runs} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-0.5">
          Runs
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatChip label="Avg" value={average == null ? '—' : average.toFixed(1)} />
        <StatChip label="SR" value={strikeRate == null ? '—' : strikeRate.toFixed(1)} />
        <StatChip label="Inn" value={innings} />
      </div>
    </div>
  );
}

function DotSeparator() {
  return <span aria-hidden className="text-[var(--dim)]">·</span>;
}

/* Subtle tinted pill — compact "data badge" for supporting stats. Replaces
   the dot-separated text row. Background is a faint surface tint so the
   chip reads as a discrete unit without competing with the primary numeral. */
function StatChip({ label, value }: { label: string; value: string | number }) {
  return (
    <span
      className="inline-flex items-baseline gap-1 px-2 py-[3px] rounded-full text-[11px] tabular-nums"
      style={{
        background: 'color-mix(in srgb, var(--muted) 9%, var(--card))',
        border: '1px solid color-mix(in srgb, var(--muted) 14%, transparent)',
      }}
    >
      <span className="text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">
        {label}
      </span>
      <span className="font-bold text-[var(--text)]">{value}</span>
    </span>
  );
}

/* Batting footer — highlights line + color-coded recent chips with the
   not-out asterisk preserved (e.g. "62*"). Threshold colour rules:
     50+ runs   → gold gradient
     30+ runs   → batting-green
     0 (duck)   → red
     1-29       → neutral muted
     DNB (null) → outlined dash
     not_out    → outlined ring on top of the perf colour
*/
function BattingFooter({
  highest, fours, sixes, recent,
}: { highest: number; fours: number; sixes: number; recent: Array<RecentBattingEntry | null> }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)] flex-wrap">
        <span className="inline-flex items-center gap-1 font-semibold">
          <span aria-hidden style={{ color: 'var(--stat-allround)' }}>★</span>
          <span>HS</span>
          <span className="font-bold tabular-nums text-[var(--text)]">{highest}</span>
        </span>
        <DotSeparator />
        <span className="font-semibold">
          <span className="tabular-nums font-bold text-[var(--text)]">{fours}</span>×4
        </span>
        <DotSeparator />
        <span className="font-semibold">
          <span className="tabular-nums font-bold text-[var(--text)]">{sixes}</span>×6
        </span>
      </div>
      {recent.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-[var(--dim)] flex-shrink-0">
            Recent
          </span>
          <div className="flex items-center gap-1.5">
            {recent.map((entry, idx) => (
              <BattingRecentChip key={idx} entry={entry} idx={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function BattingRecentChip({ entry, idx = 0 }: { entry: RecentBattingEntry | null; idx?: number }) {
  // Cap stagger at 5 chips so we never animate longer than ~0.4s total.
  const delay = `${Math.min(idx, 5) * 60}ms`;
  if (entry === null) {
    // DNB — slim outlined dash
    return (
      <span
        className="inline-flex items-center justify-center min-w-[30px] h-[22px] rounded-full text-[10px] font-bold tabular-nums px-1.5 border animate-chip-pop"
        style={{
          color: 'var(--dim)',
          borderColor: 'color-mix(in srgb, var(--dim) 40%, transparent)',
          background: 'transparent',
          animationDelay: delay,
        }}
        title="Did not bat"
      >
        DNB
      </span>
    );
  }
  const { runs, not_out } = entry;
  const tier = runs >= 50 ? 'gold' : runs >= 30 ? 'green' : runs === 0 ? 'duck' : 'neutral';
  const palette = {
    gold: { fill: 'var(--cricket)', text: '#fff', glow: 'none' },
    green: { fill: 'color-mix(in srgb, var(--stat-batting) 22%, transparent)', text: 'var(--stat-batting)', glow: 'none' },
    duck: { fill: 'color-mix(in srgb, var(--red) 22%, transparent)', text: 'var(--red)', glow: 'none' },
    neutral: { fill: 'color-mix(in srgb, var(--muted) 14%, transparent)', text: 'var(--muted)', glow: 'none' },
  }[tier];
  return (
    <span
      className="inline-flex items-center justify-center min-w-[30px] h-[22px] rounded-full text-[11px] font-extrabold tabular-nums px-2 animate-chip-pop"
      style={{
        background: palette.fill,
        color: palette.text,
        boxShadow: palette.glow,
        border: not_out ? `1.5px solid ${palette.text}` : 'none',
        animationDelay: delay,
      }}
      title={`${runs}${not_out ? ' not out' : ''}`}
    >
      {runs}{not_out ? '*' : ''}
    </span>
  );
}

function BowlingTabBody({
  rows, photoUrlByPlayer, bestBowlingByPlayer, bowlingMatches, matches, onPlayerTap,
}: {
  rows: BowlingSeasonRow[];
  photoUrlByPlayer: Map<string, string | null>;
  bestBowlingByPlayer: Map<string, { wickets: number; runs: number; display: string }>;
  bowlingMatches: BowlingMatchRow[];
  matches: MatchRow[];
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        accent="var(--stat-bowling)"
        icon={<GiTennisBall size={32} />}
        title="No spells bowled yet"
        description="Watch this space — wickets, economy and best figures show up after the first scorecard."
      />
    );
  }
  // Shared comparator → same tiebreaker chain as carousel "Top Wicket Taker".
  // Wickets DESC, then runs ASC (fewer runs conceded breaks the tie), then
  // economy, then alphabetical.
  const sorted = [...rows].sort(compareBowlingRows);
  return (
    <div className="space-y-3.5">
      {sorted.map((row, i) => {
        const rank = i + 1;
        const overs = `${Math.floor(row.balls / 6)}.${row.balls % 6}`;
        const best = (row.player_id ? bestBowlingByPlayer.get(row.player_id) : null) ?? null;
        const recent: RecentBowlingEntry[] = row.player_id
          ? recentBowlingDetailedForPlayer(row.player_id, bowlingMatches, matches)
          : [];
        return (
          <LeaderboardCard
            key={row.player_id ?? row.player_name}
            rank={rank}
            playerName={row.player_name}
            playerPhotoUrl={row.player_id ? photoUrlByPlayer.get(row.player_id) : null}
            accentColor="var(--stat-bowling)"
            revealIndex={i}
            primaryRow={
              <BowlingHeroStats
                wickets={row.wickets}
                overs={overs}
                economy={row.economy}
                average={row.bowling_average}
              />
            }
            footer={
              <BowlingFooter best={best} economy={row.economy} recent={recent} />
            }
            onTap={row.player_id ? () => onPlayerTap(row.player_id!) : undefined}
          />
        );
      })}
    </div>
  );
}

function BowlingHeroStats({
  wickets, overs, economy, average,
}: { wickets: number; overs: string; economy: number | null; average: number | null }) {
  return (
    <div className="flex flex-col gap-2 leading-none">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold tabular-nums leading-none"
          style={{
            color: 'var(--stat-bowling)',
          }}
        >
          <NumberTicker value={wickets} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-0.5">
          Wickets
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatChip label="Overs" value={overs} />
        <StatChip label="Econ" value={economy == null ? '—' : economy.toFixed(1)} />
        <StatChip label="Avg" value={average == null ? '—' : average.toFixed(1)} />
      </div>
    </div>
  );
}

function BowlingFooter({
  best, economy, recent,
}: { best: { wickets: number; runs: number; display: string } | null; economy: number | null; recent: RecentBowlingEntry[] }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 flex-wrap text-[11px]">
        {best && <BestSpellChip wickets={best.wickets} runs={best.runs} />}
        <span className="inline-flex items-center gap-1 text-[var(--muted)]">
          <span className="text-[9px] uppercase tracking-wider font-bold">Econ</span>
          <EconomyHeatBadge economy={economy} variant="swatch" />
        </span>
      </div>
      {recent.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-[var(--dim)] flex-shrink-0">
            Recent
          </span>
          <div className="flex items-center gap-1.5">
            {recent.map((entry, idx) => (
              <BowlingRecentChip key={idx} entry={entry} idx={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/* Bowling recent chip — tiered by wickets (5+ gold, 3+ blue, 1-2 neutral,
   0 red). Mirrors the batting chip language but with bowling-specific
   thresholds (5-fer is the gold standard, not 50). */
function BowlingRecentChip({ entry, idx = 0 }: { entry: RecentBowlingEntry; idx?: number }) {
  const { wickets, runs } = entry;
  const tier = wickets >= 5 ? 'gold' : wickets >= 3 ? 'blue' : wickets === 0 ? 'duck' : 'neutral';
  const palette = {
    gold: { fill: 'var(--cricket)', text: '#fff', glow: 'none' },
    blue: { fill: 'color-mix(in srgb, var(--stat-bowling) 22%, transparent)', text: 'var(--stat-bowling)', glow: 'none' },
    duck: { fill: 'color-mix(in srgb, var(--red) 18%, transparent)', text: 'var(--red)', glow: 'none' },
    neutral: { fill: 'color-mix(in srgb, var(--muted) 14%, transparent)', text: 'var(--muted)', glow: 'none' },
  }[tier];
  return (
    <span
      className="inline-flex items-center justify-center min-w-[30px] h-[22px] rounded-full text-[11px] font-extrabold tabular-nums px-2 animate-chip-pop"
      style={{
        background: palette.fill,
        color: palette.text,
        boxShadow: palette.glow,
        animationDelay: `${Math.min(idx, 5) * 60}ms`,
      }}
      title={`${wickets}/${runs}`}
    >
      {wickets}W
    </span>
  );
}

function AllRoundTabBody({
  rows, photoUrlByPlayer, onPlayerTap,
}: {
  rows: AllRoundRow[];
  photoUrlByPlayer: Map<string, string | null>;
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        accent="var(--stat-allround)"
        icon={<Star size={32} strokeWidth={2.2} />}
        title="No all-rounders yet"
        description="Players need contributions in 2+ disciplines to appear here. They'll start showing up after a couple of matches."
      />
    );
  }
  // Compute the leader's contributions so we can size each player's
  // discipline bar relative to the top. Avoids each player's bars being
  // self-normalized (which would make everyone's strongest discipline look
  // identical) — instead we show actual relative strength across the team.
  const maxRuns = Math.max(...rows.map((r) => r.runs), 1);
  const maxWickets = Math.max(...rows.map((r) => r.wickets), 1);
  const maxCatches = Math.max(...rows.map((r) => r.catches), 1);
  return (
    <div className="space-y-3.5">
      {rows.map((row, i) => {
        const rank = i + 1;
        return (
          <LeaderboardCard
            key={row.player_id}
            rank={rank}
            playerName={row.player_name}
            playerPhotoUrl={photoUrlByPlayer.get(row.player_id)}
            accentColor="var(--stat-allround)"
            revealIndex={i}
            primaryRow={
              <AllRoundHeroStats
                score={row.score}
                runs={row.runs}
                wickets={row.wickets}
                catches={row.catches}
              />
            }
            footer={
              <AllRoundFooter
                runs={row.runs}
                wickets={row.wickets}
                catches={row.catches}
                innings={row.innings}
                maxRuns={maxRuns}
                maxWickets={maxWickets}
                maxCatches={maxCatches}
              />
            }
            onTap={() => onPlayerTap(row.player_id)}
          />
        );
      })}
    </div>
  );
}

function AllRoundHeroStats({
  score, runs, wickets, catches,
}: { score: number; runs: number; wickets: number; catches: number }) {
  return (
    <div className="flex flex-col gap-2 leading-none">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold tabular-nums leading-none"
          style={{
            color: 'var(--stat-allround)',
          }}
        >
          {score.toFixed(1)}
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-0.5">
          Score
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatChip label="Runs" value={runs} />
        <StatChip label="W" value={wickets} />
        <StatChip label="C" value={catches} />
      </div>
    </div>
  );
}

/* All-round footer — three mini contribution bars (Bat / Bowl / Field)
   sized relative to the team leader in that discipline. Visualizes
   *balance* — a true all-rounder lights up all three bars; a specialist
   lights only one. Bigger emotional payoff than "Multi-discipline" text. */
function AllRoundFooter({
  runs, wickets, catches, innings, maxRuns, maxWickets, maxCatches,
}: {
  runs: number; wickets: number; catches: number; innings: number;
  maxRuns: number; maxWickets: number; maxCatches: number;
}) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="grid grid-cols-3 gap-2">
        <ContributionBar label="BAT" value={runs} max={maxRuns} color="var(--stat-batting)" />
        <ContributionBar label="BOWL" value={wickets} max={maxWickets} color="var(--stat-bowling)" />
        <ContributionBar label="FIELD" value={catches} max={maxCatches} color="var(--stat-catches)" />
      </div>
      <div className="text-[11px] text-[var(--muted)]">
        <span className="font-semibold">{innings}</span>{' '}innings · all-round contributor
      </div>
    </div>
  );
}

function ContributionBar({
  label, value, max, color,
}: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  // Grow the bar from 0 to its final width on mount. We start at 0, then in
  // a layout effect bump it to the real value — the CSS transition handles
  // the visible "fill" animation. Feels like a competitive meter filling
  // up rather than static data.
  const [renderedPct, setRenderedPct] = useState(0);
  useEffect(() => {
    // Defer by one frame so the initial 0 width paints before transitioning.
    const id = requestAnimationFrame(() => setRenderedPct(pct));
    return () => cancelAnimationFrame(id);
  }, [pct]);
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[9px] uppercase tracking-wider font-bold text-[var(--muted)]">
          {label}
        </span>
        <span className="text-[10px] font-extrabold tabular-nums" style={{ color }}>
          {value}
        </span>
      </div>
      <div
        className="h-[4px] rounded-full overflow-hidden"
        style={{ background: 'color-mix(in srgb, var(--muted) 12%, transparent)' }}
      >
        <div
          className="h-full rounded-full"
          style={{
            width: `${renderedPct}%`,
            background: `linear-gradient(90deg, ${color}, color-mix(in srgb, ${color} 75%, white))`,
            boxShadow: `0 0 8px color-mix(in srgb, ${color} 35%, transparent)`,
            transition: 'width 700ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        />
      </div>
    </div>
  );
}

function CatchesTabBody({
  rows, photoUrlByPlayer, catchesByPlayer, onPlayerTap,
}: {
  rows: CatchesRow[];
  photoUrlByPlayer: Map<string, string | null>;
  catchesByPlayer: Map<string, Map<string, number>>;
  onPlayerTap: (playerId: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <TabEmptyState
        accent="var(--stat-catches)"
        icon={<Hand size={32} strokeWidth={2.2} />}
        title="Hands not yet on the ball"
        description="Catches surface from scorecard dismissals — the first c X b Y entry fills this in."
      />
    );
  }
  // Shared comparator → matches carousel "Most Catches" tiebreaker.
  const sorted = [...rows].sort(compareCatchesRows);
  return (
    <div className="space-y-3.5">
      {sorted.map((row, i) => {
        const rank = i + 1;
        const matchMap = catchesByPlayer.get(row.player_id);
        const matchesWithCatches = matchMap ? matchMap.size : 0;
        const bestMatch = matchMap ? Math.max(...matchMap.values()) : 0;
        const ctPerGame = matchesWithCatches > 0 ? (row.catches / matchesWithCatches) : 0;
        // Recent catches series — last 5 matches with catches, chronological.
        const recent: number[] = matchMap
          ? [...matchMap.entries()].slice(-5).map(([, n]) => n)
          : [];
        return (
          <LeaderboardCard
            key={row.player_id}
            rank={rank}
            playerName={row.player_name}
            playerPhotoUrl={photoUrlByPlayer.get(row.player_id)}
            accentColor="var(--stat-catches)"
            revealIndex={i}
            primaryRow={
              <CatchesHeroStats
                catches={row.catches}
                matches={matchesWithCatches}
                best={bestMatch}
              />
            }
            footer={
              <CatchesFooter ctPerGame={ctPerGame} recent={recent} />
            }
            onTap={() => onPlayerTap(row.player_id)}
          />
        );
      })}
    </div>
  );
}

function CatchesHeroStats({
  catches, matches, best,
}: { catches: number; matches: number; best: number }) {
  return (
    <div className="flex flex-col gap-2 leading-none">
      <div className="flex items-baseline gap-1.5">
        <span
          className="text-[28px] font-bold tabular-nums leading-none"
          style={{
            color: 'var(--stat-catches)',
          }}
        >
          <NumberTicker value={catches} />
        </span>
        <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[var(--muted)] mb-0.5">
          Catches
        </span>
      </div>
      <div className="flex items-center gap-1.5 flex-wrap">
        <StatChip label="Matches" value={matches} />
        <StatChip label="Best" value={best} />
      </div>
    </div>
  );
}

function CatchesFooter({
  ctPerGame, recent,
}: { ctPerGame: number; recent: number[] }) {
  return (
    <div className="flex flex-col gap-2 min-w-0">
      <div className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
        <span aria-hidden style={{ color: 'var(--stat-catches)' }}>🧤</span>
        <span className="font-bold tabular-nums text-[var(--text)]">{ctPerGame.toFixed(2)}</span>
        <span>per match</span>
      </div>
      {recent.length > 0 && (
        <div className="flex items-center gap-2">
          <span className="text-[9px] uppercase tracking-[0.15em] font-bold text-[var(--dim)] flex-shrink-0">
            Recent
          </span>
          <div className="flex items-center gap-1.5">
            {recent.map((n, idx) => (
              <CatchesRecentChip key={idx} count={n} idx={idx} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function CatchesRecentChip({ count, idx = 0 }: { count: number; idx?: number }) {
  // 3+ catches in one match = elite (gold). 2 = strong (purple). 1 = present.
  const tier = count >= 3 ? 'gold' : count >= 2 ? 'purple' : 'neutral';
  const palette = {
    gold: { fill: 'var(--cricket)', text: '#fff', glow: 'none' },
    purple: { fill: 'color-mix(in srgb, var(--stat-catches) 22%, transparent)', text: 'var(--stat-catches)', glow: 'none' },
    neutral: { fill: 'color-mix(in srgb, var(--muted) 14%, transparent)', text: 'var(--muted)', glow: 'none' },
  }[tier];
  return (
    <span
      className="inline-flex items-center justify-center min-w-[26px] h-[22px] rounded-full text-[11px] font-extrabold tabular-nums px-2 animate-chip-pop"
      style={{
        background: palette.fill,
        color: palette.text,
        boxShadow: palette.glow,
        animationDelay: `${Math.min(idx, 5) * 60}ms`,
      }}
    >
      {count}
    </span>
  );
}

// ── Season Scorecard — rich performance card replacing the 3-tile strip.
// SVG ring shows wins/losses split visually; recent form pills tell the
// story of "what's been happening lately"; streak callout adds emotional
// stakes ("on a 3-match win streak"). One card, one tap → schedule.
function SeasonScorecard({
  won,
  lost,
  undecided,
  total,
  formDescending,
  streak,
  href,
}: {
  won: number;
  lost: number;
  undecided: number;
  total: number;
  formDescending: ('won' | 'lost' | 'draw')[];
  streak: { type: 'won' | 'lost' | 'draw'; count: number } | null;
  href: string;
}) {
  const winRate = total > 0 ? Math.round((won / total) * 100) : 0;

  // SVG ring: 88×88 viewBox, stroke 7. Two arcs (won + lost) + bg track.
  const r = 36;
  const c = 2 * Math.PI * r;
  const winLen = total > 0 ? (won / total) * c : 0;
  const lossLen = total > 0 ? (lost / total) * c : 0;
  const drawLen = total > 0 ? (undecided / total) * c : 0;

  const formToShow = formDescending.slice(0, 5).reverse(); // newest on right

  return (
    <Link
      href={href}
      aria-label="View season schedule"
      className="block group relative overflow-hidden rounded-2xl border transition-all active:scale-[0.99] cursor-pointer"
      style={{
        background:
          'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 22%, var(--card)) 0%, color-mix(in srgb, var(--cricket-accent) 12%, var(--card-end)) 100%)',
        borderColor: 'color-mix(in srgb, var(--cricket) 30%, var(--border))',
        boxShadow:
          '0 8px 28px color-mix(in srgb, var(--cricket) 18%, transparent), inset 0 1px 0 0 var(--inner-glow)',
      }}
    >
      {/* Decorative oversized trophy — same vibe as the page hero */}
      <Trophy
        size={140}
        className="absolute -right-6 -top-6 opacity-[0.05] pointer-events-none rotate-12"
        style={{ color: 'var(--cricket)' }}
      />

      <div className="relative p-4 sm:p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-3">
          <Text as="p" size="2xs" color="cricket" weight="bold" uppercase tracking="wider">
            Season Performance
          </Text>
          <ChevronRight
            size={16}
            className="flex-shrink-0 text-[var(--cricket)] opacity-60 group-hover:translate-x-0.5 transition-transform"
          />
        </div>

        {/* Top row: ring + counts */}
        <div className="flex items-center gap-4 sm:gap-5">
          {/* Win-rate ring */}
          <svg width="88" height="88" viewBox="0 0 88 88" className="flex-shrink-0">
            <circle
              cx="44" cy="44" r={r}
              fill="none" stroke="color-mix(in srgb, var(--cricket) 12%, transparent)" strokeWidth="7"
            />
            {won > 0 && (
              <circle
                cx="44" cy="44" r={r}
                fill="none" stroke="var(--green)" strokeWidth="7" strokeLinecap="butt"
                strokeDasharray={`${winLen} ${c}`}
                transform="rotate(-90 44 44)"
              />
            )}
            {lost > 0 && (
              <circle
                cx="44" cy="44" r={r}
                fill="none" stroke="var(--red)" strokeWidth="7" strokeLinecap="butt"
                strokeDasharray={`${lossLen} ${c}`}
                strokeDashoffset={-winLen}
                transform="rotate(-90 44 44)"
              />
            )}
            {undecided > 0 && (
              <circle
                cx="44" cy="44" r={r}
                fill="none" stroke="var(--muted)" strokeWidth="7" strokeLinecap="butt"
                strokeDasharray={`${drawLen} ${c}`}
                strokeDashoffset={-(winLen + lossLen)}
                transform="rotate(-90 44 44)"
                opacity="0.4"
              />
            )}
            <text
              x="44" y="46"
              textAnchor="middle"
              dominantBaseline="middle"
              className="font-bold"
              fill="var(--text)"
              fontSize="22"
            >
              {winRate}%
            </text>
          </svg>

          {/* Counts */}
          <div className="min-w-0 flex-1 flex flex-col gap-1">
            <Text as="p" size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
              Win rate
            </Text>
            <div className="flex items-baseline gap-1.5 flex-wrap">
              <Text as="span" size="lg" weight="bold" tabular style={{ color: 'var(--green)' }}>
                <NumberTicker value={won} />W
              </Text>
              <Text as="span" size="2xs" color="muted">·</Text>
              <Text as="span" size="lg" weight="bold" tabular style={{ color: 'var(--red)' }}>
                <NumberTicker value={lost} delay={0.1} />L
              </Text>
              {undecided > 0 && (
                <>
                  <Text as="span" size="2xs" color="muted">·</Text>
                  <Text as="span" size="md" weight="semibold" tabular color="muted">
                    <NumberTicker value={undecided} delay={0.2} /> pending
                  </Text>
                </>
              )}
            </div>
            <Text as="p" size="2xs" color="muted">
              <NumberTicker value={total} delay={0.3} /> match{total === 1 ? '' : 'es'} played
            </Text>
          </div>
        </div>

        {/* Recent form */}
        {formToShow.length > 0 && (
          <div className="mt-4 flex items-center gap-2.5">
            <Text as="span" size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
              Form
            </Text>
            <div className="flex items-center gap-1">
              {formToShow.map((o, i) => {
                const c =
                  o === 'won' ? 'var(--green)' : o === 'lost' ? 'var(--red)' : 'var(--muted)';
                const letter = o === 'won' ? 'W' : o === 'lost' ? 'L' : 'D';
                return (
                  <span
                    key={i}
                    className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold text-white"
                    style={{ background: c }}
                    aria-label={letter}
                    title={letter}
                  >
                    {letter}
                  </span>
                );
              })}
            </div>
            <Text as="span" size="2xs" color="muted" className="ml-auto">
              newest →
            </Text>
          </div>
        )}

        {/* Streak callout — only when there's an active 2+ streak */}
        {streak && streak.count >= 2 && (
          <div
            className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2"
            style={{
              background: streak.type === 'won'
                ? 'color-mix(in srgb, var(--green) 14%, transparent)'
                : 'color-mix(in srgb, var(--red) 14%, transparent)',
              border: streak.type === 'won'
                ? '1px solid color-mix(in srgb, var(--green) 35%, transparent)'
                : '1px solid color-mix(in srgb, var(--red) 35%, transparent)',
            }}
          >
            <span className="text-[14px]" aria-hidden>
              {streak.type === 'won' ? '🔥' : streak.type === 'lost' ? '💧' : '➖'}
            </span>
            <Text
              as="span"
              size="xs"
              weight="bold"
              style={{
                color: streak.type === 'won' ? 'var(--green)' : streak.type === 'lost' ? 'var(--red)' : 'var(--muted)',
              }}
            >
              {streak.count}-match {streak.type === 'won' ? 'win' : streak.type === 'lost' ? 'losing' : 'draw'} streak
            </Text>
          </div>
        )}
      </div>
    </Link>
  );
}

// Small pill rendering one term of the all-rounder formula, e.g.
// "Runs ÷ 25" or just "Wickets". Visual: cricket-tinted bg, semibold label.
function FormulaPill({ label, divisor }: { label: string; divisor?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md"
      style={{
        background: 'color-mix(in srgb, var(--cricket) 12%, var(--card))',
        border: '1px solid color-mix(in srgb, var(--cricket) 30%, var(--border))',
      }}
    >
      <Text as="span" size="2xs" weight="bold" color="cricket">
        {label}
      </Text>
      {divisor && (
        <>
          <Text as="span" size="2xs" color="muted">÷</Text>
          <Text as="span" size="2xs" weight="bold" color="cricket" tabular>
            {divisor}
          </Text>
        </>
      )}
    </span>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  href,
  icon,
}: {
  label: string;
  value: string;
  accent: string;
  href?: string;
  icon: React.ReactNode;
}) {
  const inner = (
    <>
      {/* Top row: rounded icon chip in accent color + label + chevron. */}
      <div className="flex items-center gap-2 mb-2">
        <span
          className="flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
          style={{
            background: `color-mix(in srgb, ${accent} 14%, transparent)`,
            color: accent,
          }}
        >
          {icon}
        </span>
        <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider" className="flex-1 truncate">
          {label}
        </Text>
        {href && <ChevronRight size={13} className="flex-shrink-0 text-[var(--dim)]" />}
      </div>
      <Text
        as="p"
        size="2xl"
        weight="bold"
        tabular
        className="leading-none sm:text-[28px]"
        style={{ color: accent }}
      >
        {value}
      </Text>
    </>
  );

  // Tile bg subtly tinted with the accent color (4% mix) — keeps cards in
  // the same visual family but each tile reads as its own thing.
  const baseClass =
    'rounded-2xl border p-3 sm:p-4 min-w-0 text-left w-full transition-all';
  const baseStyle = {
    background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 5%, var(--card)), var(--card-end))`,
    borderColor: `color-mix(in srgb, ${accent} 20%, var(--border))`,
    boxShadow: `inset 0 1px 0 0 var(--inner-glow), 0 1px 2px 0 color-mix(in srgb, ${accent} 8%, transparent)`,
  } as const;

  if (!href) {
    return (
      <div className={baseClass} style={baseStyle}>
        {inner}
      </div>
    );
  }
  return (
    <Link
      href={href}
      className={baseClass + ' cursor-pointer hover:brightness-105 active:scale-[0.98] block'}
      style={baseStyle}
      aria-label={`View ${label.toLowerCase()} matches in schedule`}
    >
      {inner}
    </Link>
  );
}
