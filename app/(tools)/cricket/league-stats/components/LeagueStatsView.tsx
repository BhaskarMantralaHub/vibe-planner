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
import { ChartColumnBig, ChevronDown, ChevronRight } from 'lucide-react';

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
};

type RosterRow = {
  id: string;
  name: string;
};

type Tab = 'batting' | 'bowling' | 'allround';

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

/* ── Rank badge — gold/silver/bronze for top 3, dim for the rest. Compact
   so a single-line player name reads as the dominant element. ── */
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const s =
      rank === 1
        ? { bg: 'linear-gradient(135deg, #FFD700 0%, #FFA500 100%)', text: '#7C5300' }
        : rank === 2
          ? { bg: 'linear-gradient(135deg, #C0C0C0, #909090)', text: '#1A1A1A' }
          : { bg: 'linear-gradient(135deg, #CD7F32, #A0522D)', text: '#fff' };
    return (
      <div
        className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-extrabold"
        style={{ background: s.bg, color: s.text }}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </div>
    );
  }
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
                    // Numeric cols: shrink to content. Player col: capped width
                    // so long names truncate instead of pushing numbers off-screen.
                    ...(c.numeric
                      ? { width: '1%' }
                      : { width: '40%', maxWidth: 180 }),
                    ...(isFirst ? { background: 'var(--card)' } : {}),
                  }}
                >
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
                          style={{ width: '40%', maxWidth: 180, background: rowBg }}
                        >
                          <PlayerCell
                            name={row.player_name}
                            rank={rank}
                            chevron={expandable ? (isExpanded ? 'down' : 'right') : null}
                          />
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

// ── Main component ────────────────────────────────────────────────────────

export default function LeagueStatsView() {
  const { currentTeamId, userTeams } = useAuthStore();
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

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client unavailable');

      const [bat, bowl, batm, bowm, mch, ros] = await Promise.all([
        supabase.from('cricclubs_batting_season').select('*').eq('team_id', currentTeamId),
        supabase.from('cricclubs_bowling_season').select('*').eq('team_id', currentTeamId),
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
        supabase
          .from('cricclubs_matches')
          .select('id, team_id, team_a, team_b, match_date, winner_team')
          .eq('team_id', currentTeamId)
          .order('match_date', { ascending: true }),
        supabase
          .from('cricket_players')
          .select('id, name')
          .eq('team_id', currentTeamId)
          .eq('is_active', true),
      ]);

      if (bat.error) throw bat.error;
      if (bowl.error) throw bowl.error;
      if (batm.error) throw batm.error;
      if (bowm.error) throw bowm.error;
      if (mch.error) throw mch.error;
      if (ros.error) throw ros.error;

      setBatting((bat.data ?? []) as BattingSeasonRow[]);
      setBowling((bowl.data ?? []) as BowlingSeasonRow[]);
      setBattingMatches((batm.data ?? []) as BattingMatchRow[]);
      setBowlingMatches((bowm.data ?? []) as BowlingMatchRow[]);
      setMatches((mch.data ?? []) as MatchRow[]);
      setRoster((ros.data ?? []) as RosterRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTeamId]);

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

  // Derived: W-L summary
  const summary = useMemo(() => {
    const total = matches.length;
    let won = 0;
    let lost = 0;
    for (const m of matches) {
      if (!m.winner_team) continue;
      if (m.winner_team.toLowerCase().includes((cricclubsTeamName.match(/sunrisers.*/i)?.[0] ?? cricclubsTeamName).toLowerCase())) {
        won += 1;
      } else {
        lost += 1;
      }
    }
    return { total, won, lost, undecided: total - won - lost };
  }, [matches, cricclubsTeamName]);

  if (loading) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-12" />
        <Skeleton className="h-9" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<ChartColumnBig size={32} />}
        title="Couldn't load stats"
        description={error}
        action={{ label: 'Retry', onClick: load }}
      />
    );
  }

  return (
    <div className="space-y-3">
      {/* Season summary strip */}
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <SummaryTile
          label="Matches"
          value={String(summary.total)}
          accent="var(--cricket)"
          href="/cricket/schedule#completed"
        />
        <SummaryTile
          label="Won"
          value={String(summary.won)}
          accent="var(--green)"
          href="/cricket/schedule#completed"
        />
        <SummaryTile
          label="Lost"
          value={String(summary.lost)}
          accent="var(--red)"
          href="/cricket/schedule#completed"
        />
      </div>

      {/* Tab segmented control */}
      <SegmentedControl
        options={[
          { key: 'batting', label: 'Batting' },
          { key: 'bowling', label: 'Bowling' },
          { key: 'allround', label: 'All-Round' },
        ]}
        active={tab}
        onChange={(v) => setTab(v as Tab)}
      />

      {/* Tab body */}
      {tab === 'batting' && (
        <StatTable
          rows={batting}
          defaultSortKey="runs"
          emptyLabel="No batting innings recorded yet."
          columns={[
            { key: 'player_name', label: 'Player', get: (r) => r.player_name },
            { key: 'innings', label: 'Inn', numeric: true, get: (r) => r.innings },
            { key: 'runs', label: 'Runs', numeric: true, primary: true, get: (r) => r.runs },
            { key: 'highest_score', label: 'HS', numeric: true, get: (r) => r.highest_score },
            { key: 'batting_average', label: 'Avg', numeric: true, get: (r) => r.batting_average,
              format: (r) => (r.batting_average == null ? '—' : r.batting_average.toFixed(2)) },
            { key: 'strike_rate', label: 'SR', numeric: true, get: (r) => r.strike_rate,
              format: (r) => (r.strike_rate == null ? '—' : r.strike_rate.toFixed(2)) },
            { key: 'fours', label: '4s', numeric: true, get: (r) => r.fours },
            { key: 'sixes', label: '6s', numeric: true, get: (r) => r.sixes },
          ]}
          renderDetail={(row) => {
            if (!row.player_id) return null;
            const innings = battingByPlayer.get(row.player_id) ?? [];
            const detailRows: DetailRow[] = innings
              .slice()
              .sort((a, b) => {
                const da = matchLookup.get(a.match_row_id)?.date ?? '';
                const db = matchLookup.get(b.match_row_id)?.date ?? '';
                return db.localeCompare(da); // newest first
              })
              .map((inn) => {
                const m = matchLookup.get(inn.match_row_id);
                const opp = shortenOpponent(m?.opponent ?? 'Unknown');
                const date = formatMatchDate(m?.date ?? null);
                const matchLabel = (
                  <Text as="span" size="xs" weight="medium">
                    {opp}
                    {date && <Text as="span" size="2xs" color="muted">{' · '}{date}</Text>}
                  </Text>
                );
                if (inn.did_not_bat) {
                  return {
                    matchKey: inn.match_row_id,
                    cells: [
                      matchLabel,
                      <Text as="span" size="2xs" color="muted" key="dnb">DNB</Text>,
                      '—', '—', '—',
                    ],
                  };
                }
                return {
                  matchKey: inn.match_row_id,
                  cells: [
                    matchLabel,
                    <Text as="span" size="xs" weight="bold" color="cricket" key="rb">
                      {inn.runs}{inn.not_out ? '*' : ''}({inn.balls})
                    </Text>,
                    inn.fours,
                    inn.sixes,
                    inn.strike_rate == null ? '—' : inn.strike_rate.toFixed(1),
                  ],
                };
              });
            return (
              <DetailTable
                headers={['Match', 'R(B)', '4s', '6s', 'SR']}
                rows={detailRows}
                emptyText="No batting innings for this player."
              />
            );
          }}
        />
      )}

      {tab === 'bowling' && (
        <StatTable
          rows={bowling}
          defaultSortKey="wickets"
          emptyLabel="No bowling innings recorded yet."
          columns={[
            { key: 'player_name', label: 'Player', get: (r) => r.player_name },
            { key: 'innings', label: 'Inn', numeric: true, get: (r) => r.innings },
            { key: 'overs', label: 'Overs', numeric: true,
              get: (r) => r.balls,
              format: (r) => `${Math.floor(r.balls / 6)}.${r.balls % 6}`,
            },
            { key: 'maidens', label: 'M', numeric: true, get: (r) => r.maidens },
            { key: 'runs', label: 'R', numeric: true, get: (r) => r.runs },
            { key: 'wickets', label: 'W', numeric: true, primary: true, get: (r) => r.wickets },
            { key: 'bowling_average', label: 'Avg', numeric: true, get: (r) => r.bowling_average,
              format: (r) => (r.bowling_average == null ? '—' : r.bowling_average.toFixed(2)) },
            { key: 'economy', label: 'Econ', numeric: true, get: (r) => r.economy,
              format: (r) => (r.economy == null ? '—' : r.economy.toFixed(2)) },
            { key: 'best_wickets', label: 'Best', numeric: true, get: (r) => r.best_wickets },
          ]}
          renderDetail={(row) => {
            if (!row.player_id) return null;
            const innings = bowlingByPlayer.get(row.player_id) ?? [];
            const detailRows: DetailRow[] = innings
              .slice()
              .sort((a, b) => {
                const da = matchLookup.get(a.match_row_id)?.date ?? '';
                const db = matchLookup.get(b.match_row_id)?.date ?? '';
                return db.localeCompare(da);
              })
              .map((inn) => {
                const m = matchLookup.get(inn.match_row_id);
                const opp = shortenOpponent(m?.opponent ?? 'Unknown');
                const date = formatMatchDate(m?.date ?? null);
                return {
                  matchKey: inn.match_row_id,
                  cells: [
                    <Text as="span" size="xs" weight="medium" key="m">
                      {opp}
                      {date && <Text as="span" size="2xs" color="muted">{' · '}{date}</Text>}
                    </Text>,
                    <Text as="span" size="xs" weight="bold" color="cricket" key="fig">
                      {formatFigures(inn.overs, inn.maidens, inn.runs, inn.wickets)}
                    </Text>,
                    inn.economy == null ? '—' : inn.economy.toFixed(2),
                  ],
                };
              });
            return (
              <DetailTable
                headers={['Match', 'O-M-R-W', 'Econ']}
                rows={detailRows}
                emptyText="No bowling innings for this player."
              />
            );
          }}
        />
      )}

      {tab === 'allround' && (
        <>
          <Text size="2xs" color="muted" className="px-1">
            Score = runs/25 + wickets + catches/2. Players need contributions in ≥2 disciplines.
          </Text>
          <StatTable
            rows={allRound}
            defaultSortKey="score"
            emptyLabel="No multi-discipline performances yet."
            columns={[
              { key: 'player_name', label: 'Player', get: (r) => r.player_name },
              { key: 'runs', label: 'Runs', numeric: true, get: (r) => r.runs },
              { key: 'wickets', label: 'Wkts', numeric: true, get: (r) => r.wickets },
              { key: 'catches', label: 'Ct', numeric: true, get: (r) => r.catches },
              { key: 'score', label: 'Score', numeric: true, primary: true, get: (r) => r.score,
                format: (r) => r.score.toFixed(2) },
            ]}
            renderDetail={(row) => {
              if (!row.player_id) return null;
              const battingInnings = battingByPlayer.get(row.player_id) ?? [];
              const bowlingInnings = bowlingByPlayer.get(row.player_id) ?? [];
              const catchMap = catchesByPlayer.get(row.player_id) ?? new Map();
              const matchIds = new Set<string>([
                ...battingInnings.map((b) => b.match_row_id),
                ...bowlingInnings.map((b) => b.match_row_id),
                ...catchMap.keys(),
              ]);
              const detailRows: DetailRow[] = [...matchIds]
                .sort((a, b) => {
                  const da = matchLookup.get(a)?.date ?? '';
                  const db = matchLookup.get(b)?.date ?? '';
                  return db.localeCompare(da);
                })
                .map((mid) => {
                  const m = matchLookup.get(mid);
                  const opp = shortenOpponent(m?.opponent ?? 'Unknown');
                  const date = formatMatchDate(m?.date ?? null);
                  const bat = battingInnings.find((x) => x.match_row_id === mid);
                  const bowl = bowlingInnings.find((x) => x.match_row_id === mid);
                  const ct = catchMap.get(mid) ?? 0;
                  const batCell =
                    bat && !bat.did_not_bat ? (
                      <Text as="span" size="xs" weight="bold" color="cricket">
                        {bat.runs}{bat.not_out ? '*' : ''}({bat.balls})
                      </Text>
                    ) : '—';
                  const bowlCell = bowl ? (
                    <Text as="span" size="xs" weight="bold" color="cricket">
                      {formatFigures(bowl.overs, bowl.maidens, bowl.runs, bowl.wickets)}
                    </Text>
                  ) : '—';
                  return {
                    matchKey: mid,
                    cells: [
                      <Text as="span" size="xs" weight="medium" key="m">
                        {opp}
                        {date && <Text as="span" size="2xs" color="muted">{' · '}{date}</Text>}
                      </Text>,
                      batCell,
                      bowlCell,
                      ct > 0 ? ct : '—',
                    ],
                  };
                });
              return (
                <DetailTable
                  headers={['Match', 'Bat', 'Bowl', 'Ct']}
                  rows={detailRows}
                  emptyText="No contributions found."
                />
              );
            }}
          />
        </>
      )}

    </div>
  );
}

function SummaryTile({
  label,
  value,
  accent,
  href,
}: {
  label: string;
  value: string;
  accent: string;
  href?: string;
}) {
  const inner = (
    <>
      <div className="flex items-center justify-between mb-1.5">
        <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
          {label}
        </Text>
        {href && <ChevronRight size={12} className="flex-shrink-0 text-[var(--dim)]" />}
      </div>
      <Text as="p" size="2xl" weight="bold" tabular className="leading-none" style={{ color: accent }}>
        {value}
      </Text>
    </>
  );

  const baseClass =
    'rounded-xl border border-[var(--border)]/60 bg-gradient-to-br from-[var(--card)] to-[var(--card-end)] p-3 sm:p-4 min-w-0 text-left w-full';
  const baseStyle = { boxShadow: 'inset 0 1px 0 0 var(--inner-glow)' as const };

  if (!href) {
    return (
      <div className={baseClass} style={baseStyle}>
        {inner}
      </div>
    );
  }
  // Use a Next Link for client-side navigation (no full page reload). Hash
  // is appended so MatchSchedule lands on its `completed` tab on arrival.
  return (
    <Link
      href={href}
      className={baseClass + ' cursor-pointer hover:bg-[var(--hover-bg)] active:scale-[0.98] transition-all block'}
      style={baseStyle}
      aria-label={`View ${label.toLowerCase()} matches in schedule`}
    >
      {inner}
    </Link>
  );
}
