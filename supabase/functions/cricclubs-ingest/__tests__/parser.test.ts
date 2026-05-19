// Parser parity tests — Deno equivalent of
// scripts/cricclubs-sync/__tests__/parser.test.ts. Both parsers consume the
// same captured cricclubs HTML and must produce equivalent output, otherwise
// the iOS/web sync path and the local-Node sync path silently produce
// different data shapes (review item #6).
//
// Run:
//   cd supabase/functions/cricclubs-ingest
//   deno test --allow-read __tests__/parser.test.ts

import {
  parseFixtures,
  parseMatchList,
  parseScorecard,
} from '../parser.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const FIXTURES_DIR = new URL('./fixtures/', import.meta.url);
const readFixture = (name: string): string =>
  Deno.readTextFileSync(new URL(name, FIXTURES_DIR));

// ── parseMatchList ──────────────────────────────────────────────────────────
Deno.test('parseMatchList: extracts 3 matches from snapshot', () => {
  const html = readFixture('match-list.html');
  const matches = parseMatchList(html);
  assertEquals(matches.length, 3);
});

Deno.test('parseMatchList: includes the Sapphires v Sunrisers fixture (id 3018)', () => {
  const html = readFixture('match-list.html');
  const m = parseMatchList(html).find((x) => x.cricclubs_match_id === 3018);
  assert(m, 'match 3018 not found');
  assertEquals(m.team_a, 'MTCA Sapphires');
  assertEquals(m.team_b, 'MTCA Sunrisers Manteca');
  assertEquals(m.winner_team, 'MTCA Sunrisers Manteca');
  assert(m.team_a_score.includes('75/8'));
  assert(m.team_b_score.includes('76/5'));
  assertEquals(m.match_date, '2026-04-25');
});

Deno.test('parseMatchList: extracts league/division text', () => {
  const html = readFixture('match-list.html');
  const m = parseMatchList(html).find((x) => x.cricclubs_match_id === 3018);
  assertEquals(m?.league_division, '2026 MTCA Spring League - Division D');
});

// ── parseScorecard ──────────────────────────────────────────────────────────
Deno.test('parseScorecard: extracts team names from title', () => {
  const html = readFixture('scorecard-3018.html');
  const card = parseScorecard(html, 3018);
  assertEquals(card.team_a, 'MTCA Sapphires');
  assertEquals(card.team_b, 'MTCA Sunrisers Manteca');
});

Deno.test('parseScorecard: parses two innings in correct order', () => {
  const html = readFixture('scorecard-3018.html');
  const card = parseScorecard(html, 3018);
  assertEquals(card.innings.length, 2);
  assertEquals(card.innings[0].innings_number, 1);
  assertEquals(card.innings[1].innings_number, 2);
});

Deno.test('parseScorecard: 1st innings — Sapphires bat, Sunrisers bowl, 75/8/20 overs', () => {
  const html = readFixture('scorecard-3018.html');
  const inn = parseScorecard(html, 3018).innings[0];
  assertEquals(inn.batting_team, 'MTCA Sapphires');
  assertEquals(inn.bowling_team, 'MTCA Sunrisers Manteca');
  assertEquals(inn.total, { runs: 75, wickets: 8, overs: 20 });
  assert(inn.batting.length > 0, 'batting should have rows');
  assert(inn.bowling.length > 0, 'bowling should have rows');
});

Deno.test('parseScorecard: 2nd innings — Sunrisers bat, Sapphires bowl, 76/5/10.4 overs', () => {
  const html = readFixture('scorecard-3018.html');
  const inn = parseScorecard(html, 3018).innings[1];
  assertEquals(inn.batting_team, 'MTCA Sunrisers Manteca');
  assertEquals(inn.bowling_team, 'MTCA Sapphires');
  assertEquals(inn.total, { runs: 76, wickets: 5, overs: 10.4 });
});

Deno.test('parseScorecard: Bhaskar Baachi scored 8(4) for Sunrisers', () => {
  const html = readFixture('scorecard-3018.html');
  const inn = parseScorecard(html, 3018).innings[1];
  const bhaskar = inn.batting.find((b) => b.raw_name === 'Bhaskar Baachi');
  assert(bhaskar, 'Bhaskar Baachi not found');
  assertEquals(bhaskar.runs, 8);
  assertEquals(bhaskar.balls, 4);
});

// ── parseToss (via parseScorecard) ─────────────────────────────────────────
Deno.test('parseToss: extracts toss winner + decision from cricclubs auto-comment', () => {
  const html = readFixture('scorecard-3018.html');
  const card = parseScorecard(html, 3018);
  assertEquals(card.toss_winner, 'MTCA Sunrisers Manteca');
  assertEquals(card.toss_decision, 'bowl');
});

// ── parseFixtures ───────────────────────────────────────────────────────────
Deno.test('parseFixtures: extracts upcoming-match table rows', () => {
  const html = readFixture('fixtures-team.html');
  const fixtures = parseFixtures(html);
  assert(fixtures.length > 0, 'expected at least one fixture');
  for (const f of fixtures) {
    assert(typeof f.cricclubs_fixture_id === 'number', 'fixture_id should be numeric');
    assert(f.team_home.length > 0, 'team_home should be non-empty');
    assert(f.team_away.length > 0, 'team_away should be non-empty');
  }
});
