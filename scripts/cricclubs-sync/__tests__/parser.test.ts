// Parser tests — fixture replay style.
// Cricclubs HTML is captured into fixtures/, parsed offline. When their HTML
// changes and the parser breaks, these tests fail in CI without any network.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  parseMatchList,
  parseScorecard,
  parseFixtures,
  extractUmpiringDuties,
  isOurFixture,
  type ParsedFixture,
} from '../parser.js';

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

  it('extracts toss winner and decision from cricclubs auto-comment', () => {
    expect(card.toss_winner).toBe('MTCA Sunrisers Manteca');
    expect(card.toss_decision).toBe('bowl');
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

// Numeric cricclubs team ids, shared by the fixture and umpiring-duty tests.
// The umpiring feature's whole identity decision rests on these being compared
// as integers rather than the display names being string-matched — see the
// ParsedFixture comments in parser.ts for why the names are unusable.
const SUNRISERS = 1014;  // MTCA Sunrisers Manteca, league 87
const TOP_GUNS = 1099;   // our own second team; shares the token "Manteca"
const SKY_RISERS = 1055; // confusable display name vs "Sunrisers"
const OTHER = 1031;      // MTCA Power Stars

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

  // ── Numeric team ids ────────────────────────────────────────────────
  // These are the identity keys the umpiring feature matches on. If cricclubs
  // ever stops linking the cells, these fail loudly rather than the feature
  // silently finding zero duties.
  it('parses numeric team ids from the cell links', () => {
    const f = fixtures.find((x) => x.cricclubs_fixture_id === 6127);
    expect(f?.team_home_id).toBe(1020);      // MTCA RICM
    expect(f?.team_away_id).toBe(SUNRISERS); // MTCA Sunrisers Manteca
    expect(f?.umpire1_team_id).toBe(1031);   // MTCA Power Stars
    expect(f?.umpire2_team_id).toBe(1031);
  });

  it('every upcoming row links all four team cells', () => {
    for (const f of fixtures) {
      expect(f.team_home_id, `fixture ${f.cricclubs_fixture_id} home`).not.toBeNull();
      expect(f.team_away_id, `fixture ${f.cricclubs_fixture_id} away`).not.toBeNull();
    }
  });

  it('Sunrisers is one of the two sides in every row of the TEAM-filtered page', () => {
    // Documents what this snapshot is: the team-scoped fixtures URL. The
    // league-wide URL is what the umpiring sync needs, and it will contain
    // rows where neither side is us.
    for (const f of fixtures) {
      expect(isOurFixture(f, SUNRISERS)).toBe(true);
    }
  });

  it('never umpires its own matches in this snapshot', () => {
    // Our match is not our duty. Confirms the two concepts are independent.
    const { duties } = extractUmpiringDuties(fixtures, SUNRISERS);
    expect(duties).toHaveLength(0);
  });
});

const fx = (over: Partial<ParsedFixture> = {}): ParsedFixture => ({
  cricclubs_fixture_id: 7000,
  match_type: 'League',
  match_date: '2026-09-12',
  match_time_24h: '10:45',
  team_home: 'MTCA Falcons',
  team_away: 'MTCA Asuras',
  venue: 'Cordes Park',
  umpire1: 'MTCA Power Stars',
  umpire2: 'MTCA Power Stars',
  team_home_id: 1035,
  team_away_id: 1034,
  umpire1_team_id: OTHER,
  umpire2_team_id: OTHER,
  ...over,
});

describe('extractUmpiringDuties', () => {
  it('emits nothing when neither slot is ours (the majority case)', () => {
    const { duties } = extractUmpiringDuties([fx()], SUNRISERS);
    expect(duties).toHaveLength(0);
  });

  it('emits 2 duties when one team supplies BOTH slots — the observed norm', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: SUNRISERS, umpire2_team_id: SUNRISERS })],
      SUNRISERS,
    );
    expect(duties.map((d) => d.role_slot)).toEqual([1, 2]);
    expect(duties[0]?.cricclubs_fixture_id).toBe(duties[1]?.cricclubs_fixture_id);
  });

  it('emits 1 duty, role_slot 1, when only the first slot is ours', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: SUNRISERS })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(1);
    expect(duties[0]?.role_slot).toBe(1);
  });

  it('emits 1 duty, role_slot 2, when only the second slot is ours', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ umpire2_team_id: SUNRISERS })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(1);
    expect(duties[0]?.role_slot).toBe(2);
  });

  it('carries the match facts and the matched umpire id through', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: SUNRISERS, umpire1: 'MTCA Sunrisers Manteca' })],
      SUNRISERS,
    );
    const d = duties[0];
    expect(d?.match_date).toBe('2026-09-12');
    expect(d?.match_time_24h).toBe('10:45');
    expect(d?.venue).toBe('Cordes Park');
    expect(d?.team_a).toBe('MTCA Falcons');
    expect(d?.team_b).toBe('MTCA Asuras');
    expect(d?.umpire_team_cricclubs_id).toBe(SUNRISERS);
    expect(d?.umpire_team_raw).toBe('MTCA Sunrisers Manteca');
  });

  // ── Confusable rejection ──────────────────────────────────────────
  // Every one of these would be a FALSE POSITIVE under a substring match:
  // someone drives to a ground for a duty that was never theirs.
  it('rejects our own second team, which shares the token "Manteca"', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: TOP_GUNS, umpire1: 'Manteca Top Guns' })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(0);
  });

  it('rejects "Sky Risers", which a fuzzy match would confuse with "Sunrisers"', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: SKY_RISERS, umpire1: 'MTCA Sky Risers' })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(0);
  });

  it('ignores the display name entirely — the id decides', () => {
    // Our name in the cell but another team's id. Proves no name fallback
    // sneaks in: a name-based matcher would wrongly emit a duty here.
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: OTHER, umpire1: 'MTCA Sunrisers Manteca' })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(0);
  });

  it('matches on id even when MTCA has renamed us', () => {
    // The failure this defends against is silent: a name matcher returns zero
    // duties, reports success, and nobody ever learns they were on duty.
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: SUNRISERS, umpire1: 'MTCA Sunrisers Manteca CC' })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(1);
  });

  // ── Unassigned and malformed slots ────────────────────────────────
  it('treats an unlinked or empty umpire cell as no duty', () => {
    // Blank means "not yet assigned", not "assigned to someone else".
    const { duties } = extractUmpiringDuties(
      [fx({ umpire1_team_id: null, umpire1: null, umpire2_team_id: null, umpire2: '' })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(0);
  });

  it('treats placeholder text with no link as no duty', () => {
    for (const raw of ['TBD', 'TBA', '-', 'N/A', 'Both Teams', 'Volunteer']) {
      const { duties } = extractUmpiringDuties(
        [fx({ umpire1_team_id: null, umpire1: raw, umpire2_team_id: null, umpire2: raw })],
        SUNRISERS,
      );
      expect(duties, `placeholder "${raw}"`).toHaveLength(0);
    }
  });

  it('SKIPS a fixture with an unparseable date instead of emitting a null', () => {
    // match_date is NOT NULL in cricket_umpiring_duties. One bad date in a
    // batch insert would abort the batch and lose every good duty with it.
    const { duties, skipped } = extractUmpiringDuties(
      [fx({ match_date: null, umpire1_team_id: SUNRISERS, umpire2_team_id: SUNRISERS })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(0);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]).toContain('unparseable date');
  });

  it('keeps a null match_time — only the date is required', () => {
    const { duties } = extractUmpiringDuties(
      [fx({ match_time_24h: null, umpire1_team_id: SUNRISERS })],
      SUNRISERS,
    );
    expect(duties).toHaveLength(1);
    expect(duties[0]?.match_time_24h).toBeNull();
  });

  it('handles a mixed feed, emitting duties only for our slots', () => {
    const { duties } = extractUmpiringDuties(
      [
        fx({ cricclubs_fixture_id: 7001 }),
        fx({ cricclubs_fixture_id: 7002, umpire1_team_id: SUNRISERS, umpire2_team_id: SUNRISERS }),
        fx({ cricclubs_fixture_id: 7003, umpire1_team_id: TOP_GUNS, umpire2_team_id: TOP_GUNS }),
        fx({ cricclubs_fixture_id: 7004, umpire2_team_id: SUNRISERS }),
      ],
      SUNRISERS,
    );
    expect(duties).toHaveLength(3);
    expect(duties.map((d) => [d.cricclubs_fixture_id, d.role_slot])).toEqual([
      [7002, 1],
      [7002, 2],
      [7004, 2],
    ]);
  });
});

// ── The league-wide fixtures page ─────────────────────────────────────
// fixtures.do?league=87&clubId=14653 — the SAME url as fixtures-team.html but
// with `teamId` removed. This is the feed the umpiring sync reads, and these
// tests pin down the three structural facts the sync depends on. If cricclubs
// redesigns the page, these fail here instead of the sync silently finding
// zero duties on a Saturday morning.
describe('parseFixtures — league-wide page', () => {
  const fixtures = parseFixtures(fixture('fixtures-league.html'));

  it('returns the whole division, not just our matches', () => {
    // The team-filtered page yields 9. Dropping teamId widens it to the
    // full division — which is the entire premise of the umpiring feature.
    expect(fixtures.length).toBeGreaterThan(9);
    expect(fixtures).toHaveLength(29);
  });

  it('renders every row server-side — no pagination', () => {
    // Load-bearing for removal detection: the sync infers "MTCA took this
    // duty back" from a slot no longer naming us. If the page paginated,
    // rows beyond the first page would look absent and real duties would be
    // wrongly cancelled.
    const html = fixture('fixtures-league.html');
    expect(html).toMatch(/iDisplayLength['"\s:]+-1/);
    expect(html).not.toMatch(/dataTables_paginate/);
  });

  it('stays within one league — no other MTCA competitions bleed in', () => {
    // Only league + playoff rows for the Spring League. If winter/summer/
    // women's fixtures appeared here we would file duties against the wrong
    // season.
    const types = new Set(fixtures.map((f) => f.match_type));
    expect([...types].sort()).toEqual(['Final', 'League', 'Semi Final']);
  });

  it('keeps the umpire columns at index 7 and 8', () => {
    // Guards against a column being inserted upstream, which would silently
    // make the parser read Ground or Scorecard as the umpire.
    const html = fixture('fixtures-league.html');
    const headers = html.match(/Umpire1[\s\S]{0,200}?Umpire2/);
    expect(headers).not.toBeNull();
  });

  it('links every non-empty umpire cell with a teamId', () => {
    // The id is the identity key. If cricclubs ever stops linking these, the
    // feature degrades to matching hostile display names.
    const named = fixtures.filter((f) => f.umpire1);
    expect(named.length).toBeGreaterThan(0);
    for (const f of named) {
      expect(f.umpire1_team_id, `fixture ${f.cricclubs_fixture_id}`).not.toBeNull();
    }
  });

  it('leaves TBD playoff teams unlinked rather than inventing an id', () => {
    // Semi Finals and Finals list "TBD" as plain text until sides are decided.
    const tbd = fixtures.filter((f) => f.team_away === 'TBD' || f.team_home === 'TBD');
    expect(tbd.length).toBeGreaterThan(0);
    for (const f of tbd) {
      if (f.team_home === 'TBD') expect(f.team_home_id).toBeNull();
      if (f.team_away === 'TBD') expect(f.team_away_id).toBeNull();
    }
  });

  it('finds our real duties: two slots on 2026-08-29, on other teams matches', () => {
    const { duties, skipped } = extractUmpiringDuties(fixtures, SUNRISERS);
    expect(skipped).toHaveLength(0);
    expect(duties).toHaveLength(2);

    // Both on the same day, at DIFFERENT grounds 45 minutes apart — so they
    // genuinely need two different people, which is exactly why duties are
    // stored per slot rather than per match.
    expect(duties.every((d) => d.match_date === '2026-08-29')).toBe(true);
    expect(new Set(duties.map((d) => d.venue)).size).toBe(2);
    expect(duties.map((d) => d.role_slot).sort()).toEqual([1, 2]);
    expect(duties.every((d) => d.umpire_team_cricclubs_id === SUNRISERS)).toBe(true);
  });

  it('never marks a fixture we merely umpire as one we play', () => {
    // The regression that protects the existing match schedule.
    const { duties } = extractUmpiringDuties(fixtures, SUNRISERS);
    const dutyFixtureIds = new Set(duties.map((d) => d.cricclubs_fixture_id));
    for (const f of fixtures) {
      if (dutyFixtureIds.has(f.cricclubs_fixture_id)) {
        expect(isOurFixture(f, SUNRISERS)).toBe(false);
      }
    }
  });

  it('emits no duty for a fixture where the umpire slots name other teams', () => {
    const otherTeamDuties = extractUmpiringDuties(fixtures, 1031).duties;
    const ourDuties = extractUmpiringDuties(fixtures, SUNRISERS).duties;
    // Different teams get different duty sets from the same feed.
    expect(otherTeamDuties.map((d) => d.cricclubs_fixture_id))
      .not.toEqual(ourDuties.map((d) => d.cricclubs_fixture_id));
  });
});

describe('isOurFixture', () => {
  it('is true when we are home, true when away, false otherwise', () => {
    expect(isOurFixture(fx({ team_home_id: SUNRISERS }), SUNRISERS)).toBe(true);
    expect(isOurFixture(fx({ team_away_id: SUNRISERS }), SUNRISERS)).toBe(true);
    expect(isOurFixture(fx(), SUNRISERS)).toBe(false);
  });

  it('is false for a fixture we merely UMPIRE — the regression that protects the schedule', () => {
    // refreshFixtures() must never see this fixture. It resolves the opponent
    // as "whichever side isn't us", which here yields a stranger's name, and
    // its date+venue fallback would then rebind one of our own schedule rows
    // to this foreign match.
    const foreign = fx({ umpire1_team_id: SUNRISERS, umpire2_team_id: SUNRISERS });
    expect(isOurFixture(foreign, SUNRISERS)).toBe(false);
    expect(extractUmpiringDuties([foreign], SUNRISERS).duties).toHaveLength(2);
  });
});
