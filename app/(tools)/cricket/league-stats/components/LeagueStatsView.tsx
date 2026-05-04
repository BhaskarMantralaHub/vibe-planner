'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { getSupabaseClient } from '@/lib/supabase/client';
import {
  Text,
  SegmentedControl,
  Skeleton,
  EmptyState,
  RefreshButton,
} from '@/components/ui';
import { ChartColumnBig } from 'lucide-react';

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

type DismissalRow = {
  team_id: string;
  batting_team: string;
  cricclubs_name: string;
  dismissal: string | null;
};

type MatchRow = {
  team_id: string;
  team_a: string;
  team_b: string;
  winner_team: string | null;
};

type RosterRow = {
  id: string;
  name: string;
};

type Tab = 'batting' | 'bowling' | 'allround' | 'catches';

type CatchesRow = {
  player_id: string;
  player_name: string;
  catches: number;
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
  dismissals: DismissalRow[],
  roster: RosterRow[],
  myTeamName: string,
): CatchesRow[] => {
  // Catches are credited to fielders on the OPPOSING team in a given innings.
  // In our data, our roster's catches are recorded only when the batting_team
  // is NOT our team (i.e., the opposition is batting and we are fielding).
  const counts = new Map<string, number>();
  for (const d of dismissals) {
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
  }
  return [...counts.entries()].map(([player_id, catches]) => {
    const r = roster.find((p) => p.id === player_id)!;
    return { player_id, player_name: r.name, catches };
  });
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

// ── Sortable table primitive ──────────────────────────────────────────────

type Column<Row> = {
  key: string;
  label: string;
  numeric?: boolean;
  sortable?: boolean;
  get: (row: Row) => string | number | null;
  format?: (row: Row) => string;
};

function StatTable<Row extends { player_name: string; player_id: string | null }>({
  rows,
  columns,
  defaultSortKey,
  emptyLabel,
}: {
  rows: Row[];
  columns: Column<Row>[];
  defaultSortKey: string;
  emptyLabel: string;
}) {
  const [sortKey, setSortKey] = useState(defaultSortKey);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

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

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--border)]/60">
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="bg-[var(--card)]">
            {columns.map((c) => {
              const active = sortKey === c.key;
              const arrow = active ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';
              return (
                <th
                  key={c.key}
                  onClick={() => onHeaderClick(c)}
                  className={
                    'px-2.5 py-2 text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)] ' +
                    (c.numeric ? 'text-right ' : 'text-left ') +
                    (c.sortable === false ? '' : 'cursor-pointer select-none hover:text-[var(--text)]')
                  }
                >
                  {c.label}
                  {arrow}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {sorted.map((row, i) => (
            <tr
              key={row.player_id ?? `${row.player_name}-${i}`}
              className="border-t border-[var(--border)]/50 hover:bg-[var(--hover-bg)]"
            >
              {columns.map((c) => (
                <td
                  key={c.key}
                  className={'px-2.5 py-2 ' + (c.numeric ? 'text-right tabular-nums' : '')}
                >
                  {c.format ? c.format(row) : (c.get(row) ?? '—')}
                </td>
              ))}
            </tr>
          ))}
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
  const [dismissals, setDismissals] = useState<DismissalRow[]>([]);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [roster, setRoster] = useState<RosterRow[]>([]);

  const load = async () => {
    if (!currentTeamId) return;
    setLoading(true);
    setError(null);
    try {
      const supabase = getSupabaseClient();
      if (!supabase) throw new Error('Supabase client unavailable');

      const [bat, bowl, dis, mch, ros] = await Promise.all([
        supabase.from('cricclubs_batting_season').select('*').eq('team_id', currentTeamId),
        supabase.from('cricclubs_bowling_season').select('*').eq('team_id', currentTeamId),
        supabase
          .from('cricclubs_batting')
          .select('team_id, batting_team, cricclubs_name, dismissal')
          .eq('team_id', currentTeamId),
        supabase
          .from('cricclubs_matches')
          .select('team_id, team_a, team_b, winner_team')
          .eq('team_id', currentTeamId),
        supabase
          .from('cricket_players')
          .select('id, name')
          .eq('team_id', currentTeamId)
          .eq('is_active', true),
      ]);

      if (bat.error) throw bat.error;
      if (bowl.error) throw bowl.error;
      if (dis.error) throw dis.error;
      if (mch.error) throw mch.error;
      if (ros.error) throw ros.error;

      setBatting((bat.data ?? []) as BattingSeasonRow[]);
      setBowling((bowl.data ?? []) as BowlingSeasonRow[]);
      setDismissals((dis.data ?? []) as DismissalRow[]);
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

  // Derived: catches and all-rounders
  const catches = useMemo(
    () => computeCatches(dismissals, roster, cricclubsTeamName),
    [dismissals, roster, cricclubsTeamName],
  );
  const allRound = useMemo(
    () => computeAllRound(batting, bowling, catches),
    [batting, bowling, catches],
  );

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
        <SummaryTile label="Matches" value={String(summary.total)} accent="var(--cricket)" />
        <SummaryTile label="Won" value={String(summary.won)} accent="var(--green)" />
        <SummaryTile label="Lost" value={String(summary.lost)} accent="var(--red)" />
      </div>

      {/* Refresh */}
      <div className="flex justify-end">
        <RefreshButton onRefresh={load} />
      </div>

      {/* Tab segmented control */}
      <SegmentedControl
        options={[
          { key: 'batting', label: 'Batting' },
          { key: 'bowling', label: 'Bowling' },
          { key: 'allround', label: 'All-Round' },
          { key: 'catches', label: 'Catches' },
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
            { key: 'runs', label: 'Runs', numeric: true, get: (r) => r.runs },
            { key: 'highest_score', label: 'HS', numeric: true, get: (r) => r.highest_score },
            { key: 'batting_average', label: 'Avg', numeric: true, get: (r) => r.batting_average,
              format: (r) => (r.batting_average == null ? '—' : r.batting_average.toFixed(2)) },
            { key: 'strike_rate', label: 'SR', numeric: true, get: (r) => r.strike_rate,
              format: (r) => (r.strike_rate == null ? '—' : r.strike_rate.toFixed(2)) },
            { key: 'fours', label: '4s', numeric: true, get: (r) => r.fours },
            { key: 'sixes', label: '6s', numeric: true, get: (r) => r.sixes },
          ]}
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
            { key: 'wickets', label: 'W', numeric: true, get: (r) => r.wickets },
            { key: 'bowling_average', label: 'Avg', numeric: true, get: (r) => r.bowling_average,
              format: (r) => (r.bowling_average == null ? '—' : r.bowling_average.toFixed(2)) },
            { key: 'economy', label: 'Econ', numeric: true, get: (r) => r.economy,
              format: (r) => (r.economy == null ? '—' : r.economy.toFixed(2)) },
            { key: 'best_wickets', label: 'Best', numeric: true, get: (r) => r.best_wickets },
          ]}
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
              { key: 'score', label: 'Score', numeric: true, get: (r) => r.score,
                format: (r) => r.score.toFixed(2) },
            ]}
          />
        </>
      )}

      {tab === 'catches' && (
        <StatTable
          rows={catches.map((c) => ({ ...c, player_id: c.player_id }))}
          defaultSortKey="catches"
          emptyLabel="No catches recorded yet (or dismissal text didn't match anyone on the roster)."
          columns={[
            { key: 'player_name', label: 'Player', get: (r) => r.player_name },
            { key: 'catches', label: 'Catches', numeric: true, get: (r) => r.catches },
          ]}
        />
      )}
    </div>
  );
}

function SummaryTile({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div
      className="rounded-xl border border-[var(--border)]/60 bg-gradient-to-br from-[var(--card)] to-[var(--card-end)] p-3 sm:p-4 min-w-0"
      style={{ boxShadow: 'inset 0 1px 0 0 var(--inner-glow)' }}
    >
      <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider" className="mb-1.5">
        {label}
      </Text>
      <Text as="p" size="2xl" weight="bold" tabular className="leading-none" style={{ color: accent }}>
        {value}
      </Text>
    </div>
  );
}
