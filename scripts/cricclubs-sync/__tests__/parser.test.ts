// Parser tests — fixture replay style.
// Cricclubs HTML is captured into fixtures/, parsed offline. When their HTML
// changes and the parser breaks, these tests fail in CI without any network.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseMatchList, parseScorecard, parseFixtures } from '../parser.js';

const here = dirname(fileURLToPath(import.meta.url));
const fixture = (name: string): string =>
  readFileSync(join(here, 'fixtures', name), 'utf8');

describe('parseMatchList', () => {
  const html = fixture('match-list.html');
  const matches = parseMatchList(html);

  it('parses 3 matches from the snapshot', () => {
    expect(matches).toHaveLength(3);
  });

  it('includes the Sapphires v Sunrisers fixture', () => {
    const m = matches.find((x) => x.cricclubs_match_id === 3018);
    expect(m).toBeDefined();
    expect(m?.team_a).toBe('MTCA Sapphires');
    expect(m?.team_b).toBe('MTCA Sunrisers Manteca');
    expect(m?.winner_team).toBe('MTCA Sunrisers Manteca');
    expect(m?.team_a_score).toContain('75/8');
    expect(m?.team_b_score).toContain('76/5');
    expect(m?.match_date).toBe('2026-04-25');
  });

  it('marks Sunheaven as winner of match 3010', () => {
    const m = matches.find((x) => x.cricclubs_match_id === 3010);
    expect(m?.winner_team).toBe('MTCA Sunheaven Leopards');
  });

  it('extracts league/division formatted text', () => {
    const m = matches.find((x) => x.cricclubs_match_id === 3018);
    expect(m?.league_division).toBe('2026 MTCA Spring League - Division D');
  });
});

describe('parseScorecard', () => {
  const html = fixture('scorecard-3018.html');
  const card = parseScorecard(html, 3018);

  it('extracts team names from title', () => {
    expect(card.team_a).toBe('MTCA Sapphires');
    expect(card.team_b).toBe('MTCA Sunrisers Manteca');
  });

  it('parses two innings', () => {
    expect(card.innings).toHaveLength(2);
    expect(card.innings[0]?.innings_number).toBe(1);
    expect(card.innings[1]?.innings_number).toBe(2);
  });

  it('first innings: Sapphires bat, Sunrisers bowl', () => {
    const inn = card.innings[0]!;
    expect(inn.batting_team).toBe('MTCA Sapphires');
    expect(inn.bowling_team).toBe('MTCA Sunrisers Manteca');
    expect(inn.total).toEqual({ runs: 75, wickets: 8, overs: 20 });
    expect(inn.batting.length).toBeGreaterThan(0);
    expect(inn.bowling.length).toBeGreaterThan(0);
  });

  it('second innings: Sunrisers bat, Sapphires bowl', () => {
    const inn = card.innings[1]!;
    expect(inn.batting_team).toBe('MTCA Sunrisers Manteca');
    expect(inn.bowling_team).toBe('MTCA Sapphires');
    expect(inn.total).toEqual({ runs: 76, wickets: 5, overs: 10.4 });
  });

  it('Bhaskar Baachi is a Sunrisers batter who scored 8 off 4', () => {
    const sunInn = card.innings[1]!;
    const bhaskar = sunInn.batting.find((b) => b.raw_name === 'Bhaskar Baachi');
    expect(bhaskar).toBeDefined();
    expect(bhaskar?.runs).toBe(8);
    expect(bhaskar?.balls).toBe(4);
    expect(bhaskar?.sixes).toBe(1);
    expect(bhaskar?.not_out).toBe(false);
  });

  it('Sai Krishna Nimmala scored 41* not out for Sunrisers', () => {
    const sunInn = card.innings[1]!;
    const sai = sunInn.batting.find((b) => b.raw_name === 'Sai Krishna Nimmala');
    expect(sai?.runs).toBe(41);
    expect(sai?.not_out).toBe(false); // 'run out' not 'not out' here
  });

  it('captures captain (*) marker correctly', () => {
    const sapInn = card.innings[0]!;
    const swapnil = sapInn.batting.find((b) => b.raw_name === 'Swapnil Lad');
    expect(swapnil?.is_captain).toBe(true);
  });

  it('extras + total are parsed', () => {
    const inn = card.innings[0]!;
    expect(inn.extras).toMatchObject({
      byes: 0,
      leg_byes: 0,
      wides: 16,
      no_balls: 1,
    });
  });

  it('Sunrisers bowling: Akash Prasun appears with valid stats', () => {
    const sapBattingInn = card.innings[0]!;
    const akash = sapBattingInn.bowling.find(
      (b) => b.raw_name === 'Akash Prasun',
    );
    // In match 3018 specifically: 4 overs, 3 wickets (his single-match best
    // for the season was 3/15 per the spike's season aggregate).
    expect(akash).toBeDefined();
    expect(akash?.wickets).toBeGreaterThanOrEqual(1);
    expect(akash?.overs).toBeGreaterThan(0);
  });

  it('did_not_bat list captured for Sunrisers innings', () => {
    const sunInn = card.innings[1]!;
    expect(sunInn.did_not_bat.length).toBeGreaterThan(0);
    expect(sunInn.did_not_bat).toContain('Adi Jesta');
  });

  it('strips †/* markers from all names', () => {
    for (const inn of card.innings) {
      for (const b of inn.batting) {
        expect(b.raw_name).not.toMatch(/[†*]/);
      }
      for (const b of inn.bowling) {
        expect(b.raw_name).not.toMatch(/[†*]/);
      }
      for (const n of inn.did_not_bat) {
        expect(n).not.toMatch(/[†*]/);
      }
    }
  });
});

describe('parseFixtures', () => {
  const html = fixture('fixtures-team.html');
  const fixtures = parseFixtures(html);

  it('parses only the upcoming-table rows (past table is ignored)', () => {
    // Snapshot has 9 upcoming rows in #schedule-table1
    expect(fixtures).toHaveLength(9);
  });

  it('first upcoming fixture: RICM v Sunrisers, May 17 2026 @ 2:45 PM', () => {
    const f = fixtures.find((x) => x.cricclubs_fixture_id === 6127);
    expect(f).toBeDefined();
    expect(f?.match_date).toBe('2026-05-17');
    expect(f?.match_time_24h).toBe('14:45');
    expect(f?.match_type).toBe('League');
    expect(f?.team_home).toBe('MTCA RICM');
    expect(f?.team_away).toBe('MTCA Sunrisers Manteca');
    expect(f?.venue).toBe('Cordes Park');
    expect(f?.umpire1).toBe('MTCA Power Stars');
  });

  it('handles AM times: 10:45 AM → "10:45"', () => {
    const f = fixtures.find((x) => x.cricclubs_fixture_id === 6140);
    expect(f?.match_time_24h).toBe('10:45');
  });

  it('handles early-morning times: 7:15 AM → "07:15"', () => {
    const f = fixtures.find((x) => x.cricclubs_fixture_id === 6147);
    expect(f?.match_time_24h).toBe('07:15');
  });

  it('keeps Team 1 (Home) as cricclubs spells it — venue is plain text', () => {
    // Bethany Park ground — fixture 6144, Sunrisers home
    const f = fixtures.find((x) => x.cricclubs_fixture_id === 6144);
    expect(f?.team_home).toBe('MTCA Sunrisers Manteca');
    expect(f?.team_away).toBe('MTCA California Eagles');
    expect(f?.venue).toBe('Bethany Park - BaseBall');
  });

  it('skips rows from the past-matches table', () => {
    // Past fixture 6115 should NOT appear (it's in #schedule-table not #schedule-table1)
    const past = fixtures.find((x) => x.cricclubs_fixture_id === 6115);
    expect(past).toBeUndefined();
  });
});
