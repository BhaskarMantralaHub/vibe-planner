/**
 * Client-side equivalents of the `cricclubs_batting_season` and
 * `cricclubs_bowling_season` database views.
 *
 * ── Why these exist ────────────────────────────────────────────────────────
 * Those two views group by `(team_id, player_id)` with NO season or league
 * dimension — despite the `_season` in their names, they are CAREER totals.
 * There is no way to ask them for one season.
 *
 * The raw per-innings rows, however, are already loaded by the stats page and
 * can be traced to a season: `cricclubs_batting.match_row_id` →
 * `cricclubs_matches.cricclubs_league_id` → `cricket_seasons.cricclubs_league_id`.
 * So season scoping needs no new views — it needs the aggregation moved into
 * the client, over whichever subset of rows the chosen season implies.
 *
 * ── The rules are copied from the views, not reinvented ────────────────────
 * Reproduced from `pg_get_viewdef` output, because a subtle difference would
 * make a player's season figures disagree with their career figures in a way
 * people notice and lose confidence in. Pinned by tests that assert the sum of
 * every season equals the career total.
 *
 * The traps, each of which is a real difference between the two views:
 *   • Batting `innings` is `count(DISTINCT match_row_id)`; bowling `innings` is
 *     a plain `count(*)`. They are NOT the same rule.
 *   • Batting excludes `did_not_bat` rows; bowling has no such filter.
 *   • Batting average divides by DISMISSALS, not innings — a not-out is not an
 *     opportunity to be averaged over.
 *   • Bowling balls come from a decimal overs value where the fraction is a
 *     ball count, not a tenth: `floor(overs) * 6 + LEAST(round(frac * 10), 5)`.
 *     The LEAST cap matters — a malformed `3.7` must not become 7 balls.
 *   • Economy is `runs * 6 / balls`, not `runs / overs`.
 *   • Both views drop rows with a null `player_id` (unmatched scorecard names).
 */

/** Only the fields aggregation reads — keeps this module free of page types. */
export interface RawBattingRow {
  match_row_id: string;
  team_id: string;
  player_id: string | null;
  cricclubs_name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  not_out: boolean;
  did_not_bat: boolean;
}

export interface RawBowlingRow {
  match_row_id: string;
  team_id: string;
  player_id: string | null;
  cricclubs_name: string;
  overs: number;
  maidens: number;
  runs: number;
  wickets: number;
}

export interface BattingAggregate {
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
}

export interface BowlingAggregate {
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
}

/**
 * Two decimal places, matching the views' `round(numeric, 2)`.
 *
 * Postgres rounds exact decimals half-away-from-zero; JavaScript rounds binary
 * floats half-up. Every value here is non-negative, so the two agree except for
 * the occasional last-cent difference on a value that is already a display
 * approximation. Not worth a decimal library for a strike rate.
 */
const round2 = (v: number): number => Math.round(v * 100) / 100;

/**
 * Balls from a decimal overs figure.
 *
 * In cricket scorecards `3.4` means three overs and four balls — the fraction
 * is a ball count out of six, not a tenth. The `LEAST(..., 5)` cap is in the
 * view for a reason: a malformed `3.7` would otherwise claim seven balls in an
 * over. Exported for the tests, which is the only way that cap gets checked.
 */
export function ballsFromOvers(overs: number): number {
  const whole = Math.floor(overs);
  const frac = Math.round((overs - whole) * 10);
  return whole * 6 + Math.min(frac, 5);
}

/**
 * `COALESCE(max(cp.name), max(b.cricclubs_name))` — the roster name when the
 * player is on it, otherwise the name as it appeared on the scorecard. Falls
 * back to the lexicographic maximum, exactly as the view does, when a player's
 * scorecard name varies between matches.
 */
function resolveName(rosterName: string | undefined, scorecardNames: string[]): string {
  if (rosterName) return rosterName;
  let best = '';
  for (const n of scorecardNames) if (n > best) best = n;
  return best;
}

export function aggregateBatting(
  rows: RawBattingRow[],
  rosterNameById: Map<string, string>,
): BattingAggregate[] {
  // WHERE player_id IS NOT NULL AND NOT did_not_bat
  const eligible = rows.filter((r) => r.player_id !== null && !r.did_not_bat);

  const groups = new Map<string, RawBattingRow[]>();
  for (const r of eligible) {
    const key = `${r.team_id}|${r.player_id}`;
    const list = groups.get(key);
    if (list) list.push(r); else groups.set(key, [r]);
  }

  const out: BattingAggregate[] = [];
  for (const list of groups.values()) {
    const first = list[0]!;
    const playerId = first.player_id!;

    const runs = list.reduce((s, r) => s + r.runs, 0);
    const balls = list.reduce((s, r) => s + r.balls, 0);
    // count(DISTINCT match_row_id) — a player batting twice in one match
    // (two innings) counts once, which is what the view does.
    const innings = new Set(list.map((r) => r.match_row_id)).size;
    const dismissals = list.filter((r) => !r.not_out).length;

    out.push({
      team_id: first.team_id,
      player_id: playerId,
      player_name: resolveName(rosterNameById.get(playerId), list.map((r) => r.cricclubs_name)),
      innings,
      runs,
      balls,
      fours: list.reduce((s, r) => s + r.fours, 0),
      sixes: list.reduce((s, r) => s + r.sixes, 0),
      not_outs: list.filter((r) => r.not_out).length,
      dismissals,
      highest_score: list.reduce((m, r) => (r.runs > m ? r.runs : m), 0),
      // Divides by dismissals, NOT innings.
      batting_average: dismissals > 0 ? round2(runs / dismissals) : null,
      strike_rate: balls > 0 ? round2((runs / balls) * 100) : null,
    });
  }
  return out;
}

export function aggregateBowling(
  rows: RawBowlingRow[],
  rosterNameById: Map<string, string>,
): BowlingAggregate[] {
  // WHERE player_id IS NOT NULL. No did_not_bat equivalent — a bowling row
  // only exists if they bowled.
  const eligible = rows.filter((r) => r.player_id !== null);

  const groups = new Map<string, RawBowlingRow[]>();
  for (const r of eligible) {
    const key = `${r.team_id}|${r.player_id}`;
    const list = groups.get(key);
    if (list) list.push(r); else groups.set(key, [r]);
  }

  const out: BowlingAggregate[] = [];
  for (const list of groups.values()) {
    const first = list[0]!;
    const playerId = first.player_id!;

    const balls = list.reduce((s, r) => s + ballsFromOvers(r.overs), 0);
    const runs = list.reduce((s, r) => s + r.runs, 0);
    const wickets = list.reduce((s, r) => s + r.wickets, 0);

    out.push({
      team_id: first.team_id,
      player_id: playerId,
      player_name: resolveName(rosterNameById.get(playerId), list.map((r) => r.cricclubs_name)),
      // count(*), NOT distinct matches — unlike batting.
      innings: list.length,
      balls,
      maidens: list.reduce((s, r) => s + r.maidens, 0),
      runs,
      wickets,
      bowling_average: wickets > 0 ? round2(runs / wickets) : null,
      // runs * 6 / balls, not runs / overs.
      economy: balls > 0 ? round2((runs * 6.0) / balls) : null,
      best_wickets: list.reduce((m, r) => (r.wickets > m ? r.wickets : m), 0),
    });
  }
  return out;
}

/**
 * Which cricclubs match ids belong to a season.
 *
 * The link is the LEAGUE id, never dates: MTCA issues a new league per season,
 * and a date range is a guess that breaks the moment two seasons overlap or a
 * season's dates shift.
 *
 * Returns null when the season cannot be resolved — no season selected, or the
 * season has no `cricclubs_league_id` yet because MTCA has not published it.
 * Null means "cannot scope", which callers must distinguish from an empty set
 * ("scoped, and no matches"): the first should fall back, the second should
 * honestly show nothing.
 */
export function matchIdsForLeague(
  matches: { id: string; cricclubs_league_id: number | null }[],
  leagueId: number | null | undefined,
): Set<string> | null {
  if (leagueId === null || leagueId === undefined) return null;
  const ids = new Set<string>();
  for (const m of matches) if (m.cricclubs_league_id === leagueId) ids.add(m.id);
  return ids;
}

/* ── One player, across every season ─────────────────────────────────────── */

export interface SeasonSlice {
  seasonId: string;
  /** Short label for the row, e.g. "Spring 2026". */
  label: string;
  matches: number;
  batting: BattingAggregate | null;
  bowling: BowlingAggregate | null;
}

export interface PlayerHistory {
  seasons: SeasonSlice[];
  /** Totals across every season — recomputed from all rows, NOT summed rates. */
  careerBatting: BattingAggregate | null;
  careerBowling: BowlingAggregate | null;
}

/**
 * A player's record broken down by season, plus career totals.
 *
 * This is the context the player sheet otherwise cannot show: with the page
 * season-scoped, a player's career total and personal best become invisible,
 * and a personal best is precisely the number that should never decay.
 *
 * Bounded by SEASON count, not innings count — three rows after three years,
 * where a career-long match list would be thirty-nine. That is why this
 * replaces the "grows forever" problem rather than managing it.
 *
 * Career figures are recomputed from ALL rows rather than summed from the
 * season slices, because rates cannot be summed: a career average is total
 * runs over total dismissals, never the mean of each season's average.
 */
export function computePlayerHistory(
  playerId: string,
  seasons: { id: string; label: string; leagueId: number | null }[],
  matches: { id: string; cricclubs_league_id: number | null }[],
  battingRows: RawBattingRow[],
  bowlingRows: RawBowlingRow[],
  rosterNameById: Map<string, string>,
): PlayerHistory {
  const mine = {
    bat: battingRows.filter((r) => r.player_id === playerId),
    bowl: bowlingRows.filter((r) => r.player_id === playerId),
  };

  const slices: SeasonSlice[] = [];
  for (const s of seasons) {
    const ids = matchIdsForLeague(matches, s.leagueId);
    // A season with no league id has no attributable matches — skip it rather
    // than showing a row of dashes for a season that has not started.
    if (!ids || ids.size === 0) continue;

    const bat = mine.bat.filter((r) => ids.has(r.match_row_id));
    const bowl = mine.bowl.filter((r) => ids.has(r.match_row_id));
    if (bat.length === 0 && bowl.length === 0) continue;

    // Distinct matches they actually appeared in, batting OR bowling — not the
    // batting innings count, which excludes anyone who was in the XI but never
    // came in.
    const appeared = new Set<string>();
    for (const r of bat) appeared.add(r.match_row_id);
    for (const r of bowl) appeared.add(r.match_row_id);

    slices.push({
      seasonId: s.id,
      label: s.label,
      matches: appeared.size,
      batting: aggregateBatting(bat, rosterNameById)[0] ?? null,
      bowling: aggregateBowling(bowl, rosterNameById)[0] ?? null,
    });
  }

  return {
    seasons: slices,
    careerBatting: aggregateBatting(mine.bat, rosterNameById)[0] ?? null,
    careerBowling: aggregateBowling(mine.bowl, rosterNameById)[0] ?? null,
  };
}
