import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import PlayerDetailSheet from '@/app/(tools)/cricket/league-stats/components/PlayerDetailSheet';

/**
 * Regression test for a wrong-but-plausible number.
 *
 * The sheet used to carry ONE `innings` field, filled as
 * `bat?.innings ?? bowl?.innings`. Batting innings therefore won for anyone
 * who had also batted, and the BOWLING tab showed it — a player with seven
 * spells and one knock read "1 Inns" beside his wicket tally.
 *
 * That is the dangerous class of bug: not obviously broken, just quietly
 * wrong, which is why it survived until the totals were checked against
 * MTCA's own site. Batting innings excludes `did_not_bat`; bowling innings is
 * every spell bowled. They are different counts and must never be coalesced.
 */

type Bat = Parameters<typeof PlayerDetailSheet>[0]['battingInnings'][number];
type Bowl = Parameters<typeof PlayerDetailSheet>[0]['bowlingInnings'][number];

const bat = (id: string, runs: number, didNotBat = false): Bat => ({
  match_row_id: id, player_id: 'p1', batting_team: 'MTCA Sunrisers Manteca',
  innings_number: 1, batting_position: 8, runs, balls: 4, fours: 0, sixes: 0,
  strike_rate: 25, dismissal: 'b Someone', not_out: false, did_not_bat: didNotBat,
});

const bowl = (id: string, overs: number, runs: number, wickets: number): Bowl => ({
  match_row_id: id, player_id: 'p1', bowling_team: 'MTCA Sunrisers Manteca',
  overs, maidens: 0, runs, wickets, economy: runs / overs,
});

/** One knock, seven spells — the exact shape that exposed the bug. */
const SPELLS = [
  bowl('m1', 4, 11, 1), bowl('m2', 2, 12, 0), bowl('m3', 1, 4, 0),
  bowl('m4', 2, 12, 1), bowl('m5', 2, 8, 1), bowl('m6', 2, 15, 0),
  bowl('m7', 1, 7, 0),
];

const matchLookup = new Map(
  SPELLS.map((s, i) => [s.match_row_id, { opponent: `Team ${i}`, date: `2026-0${i + 1}-01` }]),
);

function renderSheet(context: 'batting' | 'bowling' | 'allround') {
  return render(
    <PlayerDetailSheet
      open
      onClose={vi.fn()}
      context={context}
      player={{
        player_id: 'p1',
        name: 'Ashok Reddy Donti Reddy',
        summary: {
          runs: 1,
          batting_innings: 1,   // one knock
          bowling_innings: 7,   // seven spells
          average: 1,
          strike_rate: 25,
          wickets: 3,
          economy: 4.93,
          best_wickets: 1,
          catches: 2,
          runouts: 0,
          matches: 7,
        },
      }}
      battingInnings={[bat('m1', 1)]}
      bowlingInnings={SPELLS}
      matchLookup={matchLookup}
      scopeLabel="Spring 2026"
    />,
  );
}

/**
 * A stat tile renders <div>VALUE</div><div class="uppercase">LABEL</div>, so
 * the value is the label's PREVIOUS sibling. (`closest('div')` returns the
 * label's own element — the label is itself a div.)
 */
function tileValue(label: string): string {
  for (const node of screen.getAllByText(label, { selector: 'div' })) {
    if (!node.className.includes('uppercase')) continue;
    const value = node.previousElementSibling;
    if (value) return value.textContent?.trim() ?? '';
  }
  throw new Error(`no stat tile labelled "${label}"`);
}

describe('PlayerDetailSheet — innings counts per tab', () => {
  it('Bowling tab shows SPELLS BOWLED, not batting innings', () => {
    renderSheet('bowling');
    // The bug produced "1" here, borrowed from the single batting innings.
    expect(tileValue('Inns')).toBe('7');
    expect(tileValue('Wkts')).toBe('3');
  });

  it('Batting tab still shows batting innings', () => {
    renderSheet('batting');
    expect(tileValue('Inns')).toBe('1');
    expect(tileValue('Runs')).toBe('1');
  });

  it('All-Round tab shows appearances, since no one innings count fits', () => {
    renderSheet('allround');
    // Runs, wickets and catches accrue over different denominators, so the
    // tile beside all three is APPEARANCES.
    expect(tileValue('Mat')).toBe('7');
    expect(screen.queryByText('Inns')).toBeNull();
  });

  it('the two counts stay independent — a bowler who never batted still shows spells', () => {
    render(
      <PlayerDetailSheet
        open
        onClose={vi.fn()}
        context="bowling"
        player={{
          player_id: 'p1', name: 'Pure Bowler',
          summary: { bowling_innings: 4, wickets: 6, economy: 5, best_wickets: 3 },
        }}
        battingInnings={[]}
        bowlingInnings={SPELLS.slice(0, 4)}
        matchLookup={matchLookup}
        scopeLabel="Spring 2026"
      />,
    );
    expect(tileValue('Inns')).toBe('4');
  });
});
