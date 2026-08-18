import { describe, it, expect } from 'vitest';
import {
  computeMatchesPlayed,
  type BattingMatchRow,
  type BowlingMatchRow,
} from '@/app/(tools)/cricket/league-stats/lib/computeStats';

const bat = (over: Partial<BattingMatchRow>): BattingMatchRow => ({
  match_row_id: 'm1',
  team_id: 't1',
  player_id: 'p1',
  cricclubs_name: 'Player One',
  batting_team: 'MTCA Sunrisers Manteca',
  innings_number: 1,
  batting_position: 3,
  runs: 0,
  balls: 0,
  fours: 0,
  sixes: 0,
  strike_rate: null,
  dismissal: null,
  not_out: false,
  did_not_bat: false,
  ...over,
});

const bowl = (over: Partial<BowlingMatchRow>): BowlingMatchRow => ({
  match_row_id: 'm1',
  team_id: 't1',
  player_id: 'p1',
  cricclubs_name: 'Player One',
  bowling_team: 'MTCA Sunrisers Manteca',
  overs: 4,
  maidens: 0,
  runs: 20,
  wickets: 1,
  economy: 5,
  ...over,
});

describe('computeMatchesPlayed', () => {
  it('counts distinct matches from batting rows', () => {
    const result = computeMatchesPlayed(
      [bat({ match_row_id: 'm1' }), bat({ match_row_id: 'm2' })],
      [],
    );
    expect(result.get('p1')).toBe(2);
  });

  it('counts a did-not-bat appearance as a match played', () => {
    // Regression: `cricclubs_batting_season.innings` filters out DNB rows, so
    // innings alone undercounts a player who was in the XI but never batted.
    const result = computeMatchesPlayed(
      [bat({ match_row_id: 'm1', did_not_bat: true, runs: 0 })],
      [],
    );
    expect(result.get('p1')).toBe(1);
  });

  it('does not double-count a match where the player both batted and bowled', () => {
    const result = computeMatchesPlayed(
      [bat({ match_row_id: 'm1' })],
      [bowl({ match_row_id: 'm1' })],
    );
    expect(result.get('p1')).toBe(1);
  });

  it('counts a pure bowler with no batting row at all', () => {
    const result = computeMatchesPlayed(
      [],
      [bowl({ match_row_id: 'm1' }), bowl({ match_row_id: 'm2' })],
    );
    expect(result.get('p1')).toBe(2);
  });

  it('keeps players separate and ignores unlinked rows', () => {
    const result = computeMatchesPlayed(
      [
        bat({ match_row_id: 'm1', player_id: 'p1' }),
        bat({ match_row_id: 'm1', player_id: 'p2' }),
        bat({ match_row_id: 'm2', player_id: 'p2' }),
        bat({ match_row_id: 'm2', player_id: null }),
      ],
      [],
    );
    expect(result.get('p1')).toBe(1);
    expect(result.get('p2')).toBe(2);
    expect(result.has('')).toBe(false);
    expect(result.size).toBe(2);
  });

  it('returns an empty map before the per-innings tables load', () => {
    expect(computeMatchesPlayed([], []).size).toBe(0);
  });
});
