// Pure helpers for the league-stats redesign.
// Source-of-truth doc: docs/PLAYER_STATS_NEW_SPEC.md
// No React, no UI.

// keep in sync with LeagueStatsView.tsx
export type BattingSeasonRow = {
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
export type BowlingSeasonRow = {
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
export type BattingMatchRow = {
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
export type BowlingMatchRow = {
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
export type MatchRow = {
  id: string;
  team_id: string;
  team_a: string;
  team_b: string;
  match_date: string | null;
  winner_team: string | null;
  league_name: string | null;
  division: string | null;
};
export type CatchesRow = { player_id: string; player_name: string; catches: number };

export type TopPerformerCard = {
  category: 'runs' | 'wickets' | 'economy' | 'catches' | 'mvp';
  label: string;
  metric: string;
  unit: string;
  player_id: string;
  player_name: string;
  trend?: number[];
};

const matchDateMap = (matches: MatchRow[]): Map<string, string> => {
  const m = new Map<string, string>();
  for (const x of matches) m.set(x.id, x.match_date ?? '');
  return m;
};

const sortChronoAsc = <T extends { match_row_id: string }>(
  rows: T[],
  dates: Map<string, string>,
): T[] =>
  [...rows].sort((a, b) =>
    (dates.get(a.match_row_id) ?? '').localeCompare(dates.get(b.match_row_id) ?? ''),
  );

const alpha = (a: string, b: string) => a.localeCompare(b);

/**
 * Shared comparators — both the Top Performers carousel and the
 * leaderboard tables sort using these so the carousel's "Top X" and
 * the leaderboard's "Rank #1" never disagree on a tie.
 *
 * Batting: runs DESC, then average DESC (better avg breaks runs tie),
 *          then strike rate DESC, then alphabetical.
 * Bowling: wickets DESC, then runs ASC (fewer runs conceded breaks the
 *          wickets tie — classic cricket convention), then economy ASC,
 *          then alphabetical.
 * Catches: catches DESC, then alphabetical.
 */
export const compareBattingRows = (a: BattingSeasonRow, b: BattingSeasonRow): number =>
  (b.runs - a.runs) ||
  ((b.batting_average ?? -Infinity) - (a.batting_average ?? -Infinity)) ||
  ((b.strike_rate ?? -Infinity) - (a.strike_rate ?? -Infinity)) ||
  alpha(a.player_name, b.player_name);

export const compareBowlingRows = (a: BowlingSeasonRow, b: BowlingSeasonRow): number =>
  (b.wickets - a.wickets) ||
  (a.runs - b.runs) ||
  ((a.economy ?? Infinity) - (b.economy ?? Infinity)) ||
  alpha(a.player_name, b.player_name);

export const compareCatchesRows = (a: CatchesRow, b: CatchesRow): number =>
  (b.catches - a.catches) ||
  alpha(a.player_name, b.player_name);

export function computeMvpScore(
  player_id: string,
  batting: BattingSeasonRow,
  bowling: BowlingSeasonRow | null,
  catches: number,
  battingMatchRows: BattingMatchRow[],
  bowlingMatchRows: BowlingMatchRow[],
): number {
  const runs = batting?.runs ?? 0;
  const wickets = bowling?.wickets ?? 0;
  let bonus = 0;
  // +2 per 50+ innings, +3 per 5-wicket haul — every instance counts.
  for (const r of battingMatchRows) if (r.player_id === player_id && r.runs >= 50) bonus += 2;
  for (const r of bowlingMatchRows) if (r.player_id === player_id && r.wickets >= 5) bonus += 3;
  // Minimums prevent 1-ball/1-over outliers from earning the SR/econ bonus.
  if (batting && batting.balls >= 15 && (batting.strike_rate ?? 0) > 150) bonus += 1;
  if (bowling && bowling.balls >= 12 && (bowling.economy ?? Infinity) < 6) bonus += 1;
  return Math.round((runs / 20 + wickets * 1.25 + catches + bonus) * 100) / 100;
}

export function computeBestBowlingFigures(
  bowlingMatchRows: BowlingMatchRow[],
): Map<string, { wickets: number; runs: number; display: string }> {
  const best = new Map<string, { wickets: number; runs: number; display: string }>();
  for (const r of bowlingMatchRows) {
    if (!r.player_id) continue;
    const cur = best.get(r.player_id);
    if (!cur || r.wickets > cur.wickets || (r.wickets === cur.wickets && r.runs < cur.runs)) {
      best.set(r.player_id, { wickets: r.wickets, runs: r.runs, display: `${r.wickets}/${r.runs}` });
    }
  }
  return best;
}

// Richer batting recents — preserves `not_out` so leaderboard chips can show
// the "62*" asterisk and not-out can drive distinct chip styling. Returns
// up to 5 entries chronologically (oldest → newest), with null = DNB.
export type RecentBattingEntry = { runs: number; not_out: boolean };
export function recentBattingDetailedForPlayer(
  player_id: string,
  battingMatchRows: BattingMatchRow[],
  matches: MatchRow[],
): Array<RecentBattingEntry | null> {
  const dates = matchDateMap(matches);
  return sortChronoAsc(battingMatchRows.filter((r) => r.player_id === player_id), dates)
    .slice(-5)
    .map((r) => (r.did_not_bat ? null : { runs: r.runs, not_out: r.not_out }));
}

// Richer bowling recents — preserves wickets + runs so leaderboard chips
// can colour-tier by wickets and (optionally) reveal full figures on tap.
export type RecentBowlingEntry = { wickets: number; runs: number };
export function recentBowlingDetailedForPlayer(
  player_id: string,
  bowlingMatchRows: BowlingMatchRow[],
  matches: MatchRow[],
): RecentBowlingEntry[] {
  const dates = matchDateMap(matches);
  return sortChronoAsc(bowlingMatchRows.filter((r) => r.player_id === player_id), dates)
    .slice(-5)
    .map((r) => ({ wickets: r.wickets, runs: r.runs }));
}

export function recentSeriesForPlayer(
  player_id: string,
  category: 'batting' | 'bowling' | 'catches',
  battingMatchRows: BattingMatchRow[],
  bowlingMatchRows: BowlingMatchRow[],
  matches: MatchRow[],
  catchEventsByPlayer?: Map<string, Map<string, number>>,
): Array<number | null> {
  const dates = matchDateMap(matches);
  if (category === 'batting') {
    return sortChronoAsc(battingMatchRows.filter((r) => r.player_id === player_id), dates)
      .slice(-5)
      .map((r) => (r.did_not_bat ? null : r.runs));
  }
  if (category === 'bowling') {
    return sortChronoAsc(bowlingMatchRows.filter((r) => r.player_id === player_id), dates)
      .slice(-5)
      .map((r) => r.wickets);
  }
  const matchIds = new Set<string>();
  for (const r of battingMatchRows) if (r.player_id === player_id) matchIds.add(r.match_row_id);
  for (const r of bowlingMatchRows) if (r.player_id === player_id) matchIds.add(r.match_row_id);
  const recent = [...matchIds]
    .sort((a, b) => (dates.get(a) ?? '').localeCompare(dates.get(b) ?? ''))
    .slice(-5);
  const catchMap = catchEventsByPlayer?.get(player_id);
  return recent.map((mid) => catchMap?.get(mid) ?? 0);
}

const trendNumbers = (
  arr: Array<number | null>,
): number[] => arr.filter((v): v is number => v !== null);

export function computeTopPerformers(
  batting: BattingSeasonRow[],
  bowling: BowlingSeasonRow[],
  catches: CatchesRow[],
  battingMatchRows: BattingMatchRow[],
  bowlingMatchRows: BowlingMatchRow[],
  matches: MatchRow[],
): TopPerformerCard[] {
  const dates = matchDateMap(matches);

  const topBat =
    [...batting.filter((b) => b.player_id && b.runs > 0)].sort(
      (a, b) => compareBattingRows(a, b),
    )[0] ?? null;

  const topBowl =
    [...bowling.filter((b) => b.player_id && b.wickets > 0)].sort(
      (a, b) => compareBowlingRows(a, b),
    )[0] ?? null;

  // Best Economy requires innings >= 2 so a single tight over doesn't dominate.
  const bestEcon =
    [...bowling.filter((b) => b.player_id && b.economy !== null && b.innings >= 2)].sort(
      (a, b) => (a.economy ?? Infinity) - (b.economy ?? Infinity) || alpha(a.player_name, b.player_name),
    )[0] ?? null;

  const topCatch =
    [...catches.filter((c) => c.catches > 0)].sort(compareCatchesRows)[0] ?? null;

  // MVP — score every player who appears in batting or bowling.
  const bowlingByPid = new Map<string, BowlingSeasonRow>();
  for (const b of bowling) if (b.player_id) bowlingByPid.set(b.player_id, b);
  const catchesByPid = new Map<string, number>();
  for (const c of catches) catchesByPid.set(c.player_id, c.catches);
  const seen = new Set<string>();
  type MvpCandidate = { player_id: string; player_name: string; score: number };
  let mvp: MvpCandidate | null = null;
  const consider = (pid: string, name: string, bat: BattingSeasonRow, bow: BowlingSeasonRow | null) => {
    if (seen.has(pid)) return;
    seen.add(pid);
    const score = computeMvpScore(pid, bat, bow, catchesByPid.get(pid) ?? 0, battingMatchRows, bowlingMatchRows);
    if (!mvp || score > mvp.score || (score === mvp.score && alpha(name, mvp.player_name) < 0)) {
      mvp = { player_id: pid, player_name: name, score };
    }
  };
  for (const b of batting) if (b.player_id) consider(b.player_id, b.player_name, b, bowlingByPid.get(b.player_id) ?? null);
  // Pure bowlers (no batting row at all) still deserve consideration.
  const emptyBat = { runs: 0, balls: 0, strike_rate: null } as BattingSeasonRow;
  for (const b of bowling) if (b.player_id) consider(b.player_id, b.player_name, emptyBat, b);

  const cards: Array<TopPerformerCard | null> = [
    topBat && {
      category: 'runs',
      label: 'Top Run Scorer',
      metric: String(topBat.runs),
      unit: 'Runs',
      player_id: topBat.player_id!,
      player_name: topBat.player_name,
      trend: trendNumbers(
        recentSeriesForPlayer(topBat.player_id!, 'batting', battingMatchRows, bowlingMatchRows, matches),
      ),
    },
    topBowl && {
      category: 'wickets',
      label: 'Top Wicket Taker',
      metric: String(topBowl.wickets),
      unit: 'Wickets',
      player_id: topBowl.player_id!,
      player_name: topBowl.player_name,
      trend: trendNumbers(
        recentSeriesForPlayer(topBowl.player_id!, 'bowling', battingMatchRows, bowlingMatchRows, matches),
      ),
    },
    bestEcon && {
      category: 'economy',
      label: 'Best Economy',
      metric: (bestEcon.economy ?? 0).toFixed(2),
      unit: 'Econ',
      player_id: bestEcon.player_id!,
      player_name: bestEcon.player_name,
      trend: sortChronoAsc(
        bowlingMatchRows.filter((r) => r.player_id === bestEcon.player_id),
        dates,
      )
        .slice(-5)
        .map((r) => r.economy ?? 0),
    },
    topCatch && {
      category: 'catches',
      label: 'Most Catches',
      metric: String(topCatch.catches),
      unit: 'Catches',
      player_id: topCatch.player_id,
      player_name: topCatch.player_name,
    },
    // MVP sparkline simplification: reuse batting trend (the dominant signal
    // for most MVPs; per-match MVP would require recomputing scores per innings).
    ((m: MvpCandidate | null): TopPerformerCard | null =>
      m && m.score > 0
        ? {
            category: 'mvp',
            label: 'MVP',
            metric: m.score.toFixed(2),
            unit: 'Score',
            player_id: m.player_id,
            player_name: m.player_name,
            trend: trendNumbers(
              recentSeriesForPlayer(m.player_id, 'batting', battingMatchRows, bowlingMatchRows, matches),
            ),
          }
        : null)(mvp),
  ];

  return cards.filter((c): c is TopPerformerCard => !!c);
}
