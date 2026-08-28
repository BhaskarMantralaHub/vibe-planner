import { describe, it, expect } from 'vitest';
import {
  aggregateBatting,
  aggregateBowling,
  ballsFromOvers,
  matchIdsForLeague,
  type RawBattingRow,
  type RawBowlingRow,
} from '@/app/(tools)/cricket/league-stats/lib/seasonAggregates';

const bat = (over: Partial<RawBattingRow> = {}): RawBattingRow => ({
  match_row_id: 'm1',
  team_id: 'team-1',
  player_id: 'p1',
  cricclubs_name: 'Sai Krishna',
  runs: 0, balls: 0, fours: 0, sixes: 0,
  not_out: false, did_not_bat: false,
  ...over,
});

const bowl = (over: Partial<RawBowlingRow> = {}): RawBowlingRow => ({
  match_row_id: 'm1',
  team_id: 'team-1',
  player_id: 'p1',
  cricclubs_name: 'Naresh',
  overs: 0, maidens: 0, runs: 0, wickets: 0,
  ...over,
});

const ROSTER = new Map([['p1', 'Sai Krishna Nimmala'], ['p2', 'Naresh Muthaluru']]);

describe('ballsFromOvers', () => {
  it('treats the fraction as balls, not tenths', () => {
    // "3.4" is three overs and four balls = 22, not 3.4 × 6.
    expect(ballsFromOvers(3.4)).toBe(22);
    expect(ballsFromOvers(4)).toBe(24);
    expect(ballsFromOvers(0.3)).toBe(3);
    expect(ballsFromOvers(0)).toBe(0);
  });

  it('caps the fraction at 5 — the view has LEAST(..., 5) for a reason', () => {
    // A malformed 3.7 must not claim seven balls in an over.
    expect(ballsFromOvers(3.7)).toBe(23);
    expect(ballsFromOvers(3.9)).toBe(23);
    expect(ballsFromOvers(3.5)).toBe(23);
  });

  it('survives binary float representation of one-decimal overs', () => {
    // 2.3 - 2 is 0.2999999999999998 in binary floating point; rounding must
    // still land on 3 balls or every economy rate drifts.
    expect(ballsFromOvers(2.3)).toBe(15);
    expect(ballsFromOvers(7.1)).toBe(43);
    expect(ballsFromOvers(9.2)).toBe(56);
  });
});

describe('aggregateBatting', () => {
  it('matches the view on a worked example', () => {
    const rows = [
      bat({ match_row_id: 'm1', runs: 59, balls: 38, fours: 1, sixes: 6 }),
      bat({ match_row_id: 'm2', runs: 0, balls: 1 }),
      bat({ match_row_id: 'm3', runs: 8, balls: 6, not_out: true }),
    ];
    const [a] = aggregateBatting(rows, ROSTER);

    expect(a).toMatchObject({
      player_name: 'Sai Krishna Nimmala',
      innings: 3,
      runs: 67,
      balls: 45,
      fours: 1,
      sixes: 6,
      not_outs: 1,
      dismissals: 2,
      highest_score: 59,
      // 67 / 2 dismissals — NOT 67 / 3 innings.
      batting_average: 33.5,
      // 67 / 45 × 100
      strike_rate: 148.89,
    });
  });

  it('divides the average by dismissals, so an all-not-out record has none', () => {
    // Postgres returns NULL rather than dividing by zero; so must this.
    const rows = [bat({ runs: 20, balls: 10, not_out: true })];
    expect(aggregateBatting(rows, ROSTER)[0]!.batting_average).toBeNull();
  });

  it('returns a null strike rate rather than dividing by zero balls', () => {
    const rows = [bat({ runs: 0, balls: 0 })];
    expect(aggregateBatting(rows, ROSTER)[0]!.strike_rate).toBeNull();
  });

  it('excludes did_not_bat rows entirely', () => {
    // A player in the XI who never batted must not appear as a 0-run innings.
    const rows = [
      bat({ match_row_id: 'm1', runs: 30, balls: 20 }),
      bat({ match_row_id: 'm2', did_not_bat: true }),
    ];
    expect(aggregateBatting(rows, ROSTER)[0]!.innings).toBe(1);
  });

  it('drops rows with no linked player, as the view does', () => {
    // Unmatched scorecard names — about half the raw rows in production.
    const rows = [bat({ player_id: null, runs: 40 })];
    expect(aggregateBatting(rows, ROSTER)).toEqual([]);
  });

  it('counts DISTINCT matches for innings, so two knocks in one match count once', () => {
    const rows = [
      bat({ match_row_id: 'm1', runs: 10, balls: 8 }),
      bat({ match_row_id: 'm1', runs: 5, balls: 4 }),
    ];
    const [a] = aggregateBatting(rows, ROSTER);
    expect(a!.innings).toBe(1);
    // Runs still sum — only the innings COUNT is de-duplicated.
    expect(a!.runs).toBe(15);
  });

  it('falls back to the scorecard name when the player is off the roster', () => {
    const rows = [bat({ player_id: 'ghost', cricclubs_name: 'A Visitor', runs: 5 })];
    expect(aggregateBatting(rows, ROSTER)[0]!.player_name).toBe('A Visitor');
  });

  it('groups by team as well as player', () => {
    const rows = [
      bat({ team_id: 'team-1', runs: 10 }),
      bat({ team_id: 'team-2', runs: 20 }),
    ];
    expect(aggregateBatting(rows, ROSTER)).toHaveLength(2);
  });
});

describe('aggregateBowling', () => {
  it('matches the view on a worked example', () => {
    const rows = [
      bowl({ match_row_id: 'm1', player_id: 'p2', overs: 4, runs: 18, wickets: 4, maidens: 1 }),
      bowl({ match_row_id: 'm2', player_id: 'p2', overs: 3.4, runs: 30, wickets: 1 }),
    ];
    const [a] = aggregateBowling(rows, ROSTER);

    expect(a).toMatchObject({
      player_name: 'Naresh Muthaluru',
      innings: 2,
      balls: 46,       // 24 + 22
      maidens: 1,
      runs: 48,
      wickets: 5,
      bowling_average: 9.6,   // 48 / 5
      best_wickets: 4,
    });
    // 48 × 6 / 46 — economy is per over, from balls.
    expect(a!.economy).toBeCloseTo(6.26, 2);
  });

  it('counts innings as count(*), unlike batting', () => {
    // Two spells in the same match count TWICE here. This asymmetry between
    // the two views is deliberate and easy to "tidy" away by mistake.
    const rows = [
      bowl({ match_row_id: 'm1', overs: 2, runs: 10 }),
      bowl({ match_row_id: 'm1', overs: 2, runs: 12 }),
    ];
    expect(aggregateBowling(rows, ROSTER)[0]!.innings).toBe(2);
  });

  it('returns null average with no wickets, and null economy with no balls', () => {
    expect(aggregateBowling([bowl({ overs: 2, runs: 14 })], ROSTER)[0]!.bowling_average).toBeNull();
    expect(aggregateBowling([bowl({ overs: 0, runs: 0 })], ROSTER)[0]!.economy).toBeNull();
  });

  it('drops rows with no linked player', () => {
    expect(aggregateBowling([bowl({ player_id: null, overs: 4 })], ROSTER)).toEqual([]);
  });
});

/**
 * The invariant that protects user trust: a player's season figures and their
 * career figures must be reconcilable. If season A and season B do not sum to
 * the career total, somebody will notice and stop believing either number.
 */
describe('seasons reconcile with the career total', () => {
  const spring = [
    bat({ match_row_id: 's1', runs: 59, balls: 38, fours: 1, sixes: 6 }),
    bat({ match_row_id: 's2', runs: 12, balls: 14, not_out: true }),
    bat({ match_row_id: 's3', runs: 0, balls: 2 }),
  ];
  const fall = [
    bat({ match_row_id: 'f1', runs: 34, balls: 27, fours: 2, sixes: 3 }),
    // Not out DELIBERATELY: it gives Fall 1 dismissal to Spring's 2, so the
    // mean of the two season averages (38.25) differs from the correct career
    // average (37.33). With symmetric dismissals the two coincide and the
    // "don't average the averages" test below proves nothing.
    bat({ match_row_id: 'f2', runs: 7, balls: 4, not_out: true }),
  ];

  it('sums runs, balls, boundaries, innings and dismissals exactly', () => {
    const [sp] = aggregateBatting(spring, ROSTER);
    const [fa] = aggregateBatting(fall, ROSTER);
    const [career] = aggregateBatting([...spring, ...fall], ROSTER);

    expect(sp!.runs + fa!.runs).toBe(career!.runs);
    expect(sp!.balls + fa!.balls).toBe(career!.balls);
    expect(sp!.fours + fa!.fours).toBe(career!.fours);
    expect(sp!.sixes + fa!.sixes).toBe(career!.sixes);
    expect(sp!.innings + fa!.innings).toBe(career!.innings);
    expect(sp!.dismissals + fa!.dismissals).toBe(career!.dismissals);
    expect(sp!.not_outs + fa!.not_outs).toBe(career!.not_outs);
  });

  it('takes career highest score as the maximum across seasons, never the sum', () => {
    const [sp] = aggregateBatting(spring, ROSTER);
    const [fa] = aggregateBatting(fall, ROSTER);
    const [career] = aggregateBatting([...spring, ...fall], ROSTER);

    expect(career!.highest_score).toBe(Math.max(sp!.highest_score, fa!.highest_score));
    expect(career!.highest_score).toBe(59);
  });

  it('does NOT average the seasons’ averages — rates recompute from totals', () => {
    // The classic mistake. Spring averages 35.50 (71/2), Fall 41.00 (41/1).
    // The mean of those is 38.25. The correct career figure is 112/3 = 37.33.
    const [sp] = aggregateBatting(spring, ROSTER);
    const [fa] = aggregateBatting(fall, ROSTER);
    const [career] = aggregateBatting([...spring, ...fall], ROSTER);

    expect(sp!.batting_average).toBe(35.5);
    expect(fa!.batting_average).toBe(41);
    expect(career!.runs).toBe(112);
    expect(career!.dismissals).toBe(3);
    expect(career!.batting_average).toBe(37.33);
    // The number a naive implementation would produce.
    expect(career!.batting_average).not.toBe(38.25);
  });

  it('reconciles bowling balls and wickets across seasons', () => {
    const s = [bowl({ match_row_id: 's1', overs: 4, runs: 18, wickets: 4 })];
    const f = [bowl({ match_row_id: 'f1', overs: 3.4, runs: 30, wickets: 1 })];
    const [sp] = aggregateBowling(s, ROSTER);
    const [fa] = aggregateBowling(f, ROSTER);
    const [career] = aggregateBowling([...s, ...f], ROSTER);

    expect(sp!.balls + fa!.balls).toBe(career!.balls);
    expect(sp!.wickets + fa!.wickets).toBe(career!.wickets);
    expect(sp!.innings + fa!.innings).toBe(career!.innings);
    expect(career!.best_wickets).toBe(4);
  });
});

describe('matchIdsForLeague', () => {
  const matches = [
    { id: 'm1', cricclubs_league_id: 87 },
    { id: 'm2', cricclubs_league_id: 87 },
    { id: 'm3', cricclubs_league_id: 91 },
    { id: 'm4', cricclubs_league_id: null },
  ];

  it('selects only that league’s matches', () => {
    expect([...matchIdsForLeague(matches, 87)!]).toEqual(['m1', 'm2']);
    expect([...matchIdsForLeague(matches, 91)!]).toEqual(['m3']);
  });

  it('returns an EMPTY SET for a league with no matches yet', () => {
    // Distinct from null: Fall exists, has a league id, and has played nothing.
    // The page must show "no matches this season", not fall back to Spring.
    const s = matchIdsForLeague(matches, 999);
    expect(s).not.toBeNull();
    expect(s!.size).toBe(0);
  });

  it('returns NULL when the season has no league id to scope by', () => {
    // MTCA has not published the league yet — cannot scope, so the caller
    // should fall back rather than render an empty page.
    expect(matchIdsForLeague(matches, null)).toBeNull();
    expect(matchIdsForLeague(matches, undefined)).toBeNull();
  });

  it('never matches a null league id against a null season', () => {
    // The 6 rows that used to have a null league id must not be swept into
    // whichever season also lacks one.
    expect(matchIdsForLeague(matches, null)).toBeNull();
  });
});
