// Inline parser for cricclubs fixtures HTML — ports the upcoming-fixtures
// table parsing from scripts/cricclubs-sync/parser.ts into the Edge Function
// directory. Kept self-contained so the function deploys without reaching
// outside its directory tree (Supabase Functions ship per-folder).
//
// Source of truth for parser correctness: the vitest suite in
// scripts/cricclubs-sync/__tests__/parser.test.ts. If you change a regex
// here, change it there too.

import * as cheerio from 'npm:cheerio@1.0.0';

export type ParsedFixture = {
  cricclubs_fixture_id: number;
  match_type: string | null;
  match_date: string | null;       // ISO YYYY-MM-DD
  match_time_24h: string | null;   // 'HH:MM' 24h
  team_home: string;
  team_away: string;
  venue: string | null;
  umpire1: string | null;
  umpire2: string | null;
};

// ── Scorecard + match-list types (ported from scripts/cricclubs-sync/parser.ts) ──
export type ParsedBattingRow = {
  raw_name: string;
  is_captain: boolean;
  is_wicketkeeper: boolean;
  dismissal: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strike_rate: number | null;
  not_out: boolean;
};
export type ParsedBowlingRow = {
  raw_name: string;
  is_captain: boolean;
  overs: number;
  maidens: number;
  dots: number;
  runs: number;
  wickets: number;
  economy: number | null;
};
export type ParsedExtras = {
  byes: number;
  leg_byes: number;
  wides: number;
  no_balls: number;
  total: number;
};
export type ParsedTotal = {
  runs: number | null;
  wickets: number | null;
  overs: number | null;
};
export type ParsedInnings = {
  innings_number: 1 | 2;
  batting_team: string;
  bowling_team: string;
  total: ParsedTotal | null;
  extras: ParsedExtras | null;
  batting: ParsedBattingRow[];
  did_not_bat: string[];
  bowling: ParsedBowlingRow[];
};
export type ParsedScorecard = {
  cricclubs_match_id: number;
  team_a: string | null;
  team_b: string | null;
  toss_winner: string | null;
  toss_decision: 'bat' | 'bowl' | null;
  innings: ParsedInnings[];
};
export type ParsedListEntry = {
  cricclubs_match_id: number;
  match_date: string | null;
  match_format: string | null;
  league_division: string | null;
  team_a: string | null;
  team_b: string | null;
  team_a_score: string;
  team_b_score: string;
  result_text: string;
  winner_team: string | null;
};

const clean = (s: string | undefined | null): string =>
  (s ?? '').replace(/\s+/g, ' ').trim();

const parseTime12To24 = (raw: string): string | null => {
  const m = raw.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2];
  const ampm = (m[3] ?? '').toUpperCase();
  if (ampm === 'PM' && h !== 12) h += 12;
  if (ampm === 'AM' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${min}`;
};

const parseUSDate = (raw: string): string | null => {
  const m = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  return `${m[3]}-${m[1]}-${m[2]}`;
};

export const parseFixtures = (html: string): ParsedFixture[] => {
  const $ = cheerio.load(html);
  const out: ParsedFixture[] = [];

  // The upcoming-matches table only — past matches are #schedule-table,
  // which we deliberately ignore (those flow through scorecards).
  $('#schedule-table1 tbody tr[id^="deleteRow"]').each((_i, tr) => {
    const $tr = $(tr);
    const id = $tr.attr('id') ?? '';
    const idMatch = id.match(/deleteRow(\d+)/);
    if (!idMatch || !idMatch[1]) return;
    const fixtureId = Number(idMatch[1]);

    const tds = $tr.find('> td');
    // Columns: # | Match Type | Date | Time | Team1 (Home) | Team2 | Ground | Umpire1 | Umpire2 | Scorecard
    if (tds.length < 9) return;

    const matchType = clean($(tds[1]).text()) || null;
    const dateRaw = clean($(tds[2]).text());
    const timeRaw = clean($(tds[3]).text());
    const team1 = clean($(tds[4]).text());
    const team2 = clean($(tds[5]).text());
    const venue = clean($(tds[6]).text()) || null;
    const umpire1 = clean($(tds[7]).text()) || null;
    const umpire2 = clean($(tds[8]).text()) || null;

    if (!team1 || !team2) return;

    out.push({
      cricclubs_fixture_id: fixtureId,
      match_type: matchType,
      match_date: parseUSDate(dateRaw),
      match_time_24h: parseTime12To24(timeRaw),
      team_home: team1,
      team_away: team2,
      venue,
      umpire1,
      umpire2,
    });
  });

  return out;
};

// ============================================================================
// Scorecard + match-list parsers — ported from scripts/cricclubs-sync/parser.ts
// Logic must stay identical to the Node version; tests in the Node side are
// the source of truth (see scripts/cricclubs-sync/__tests__/parser.test.ts).
// ============================================================================

const cleanName = (s: string | undefined | null): string =>
  clean((s ?? '').replace(/[†*]/g, ''));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cells = ($: cheerio.CheerioAPI, tr: any): string[] =>
  $(tr).find('td, th').map((_i, c) => clean($(c).text())).get();

const parseBattingRow = (row: string[]): ParsedBattingRow | null => {
  if (row.length < 7) return null;
  const nameAndDismissal = row[0] ?? '';
  const dismissal = row[1] ?? '';
  let name = nameAndDismissal;
  if (dismissal && nameAndDismissal.endsWith(dismissal)) {
    name = nameAndDismissal.slice(0, -dismissal.length).trim();
  }
  const isWk = /†/.test(name);
  const isCaptain = /\*/.test(name);
  return {
    raw_name: cleanName(name),
    is_captain: isCaptain,
    is_wicketkeeper: isWk,
    dismissal,
    runs: Number(row[2]) || 0,
    balls: Number(row[3]) || 0,
    fours: Number(row[4]) || 0,
    sixes: Number(row[5]) || 0,
    strike_rate: row[6] ? parseFloat(row[6]) : null,
    not_out: /not out|retired not out/i.test(dismissal),
  };
};

const parseBowlingRow = (row: string[]): ParsedBowlingRow | null => {
  if (row.length < 8) return null;
  const name = row[1] ?? '';
  if (!name) return null;
  const isCaptain = /\*/.test(name);
  return {
    raw_name: cleanName(name),
    is_captain: isCaptain,
    overs: parseFloat(row[2] ?? '') || 0,
    maidens: Number(row[3]) || 0,
    dots: Number(row[4]) || 0,
    runs: Number(row[5]) || 0,
    wickets: Number(row[6]) || 0,
    economy: row[7] ? parseFloat(row[7]) : null,
  };
};

const parseExtras = (row: string[]): ParsedExtras => {
  const txt = row[1] ?? '';
  const m = txt.match(/b\s*(\d+).*?lb\s*(\d+).*?w\s*(\d+).*?nb\s*(\d+)/i);
  return {
    byes: m ? Number(m[1]) : 0,
    leg_byes: m ? Number(m[2]) : 0,
    wides: m ? Number(m[3]) : 0,
    no_balls: m ? Number(m[4]) : 0,
    total: Number(row[2]) || 0,
  };
};

const parseTotal = (row: string[]): ParsedTotal => {
  const txt = row[1] ?? '';
  const wkt = txt.match(/(\d+)\s*wickets?/i);
  const ov = txt.match(/([\d.]+)\s*overs/i);
  return {
    runs: Number(row[2]) || null,
    wickets: wkt ? Number(wkt[1]) : null,
    overs: ov ? parseFloat(ov[1] ?? '') : null,
  };
};

const parseToss = (html: string): { winner: string | null; decision: 'bat' | 'bowl' | null } => {
  const m = html.match(/<strong>\s*([^<]+?)\s+won the toss\s+and\s+elected to\s+(bat|bowl)\s*<\/strong>/i);
  if (!m || !m[1] || !m[2]) return { winner: null, decision: null };
  return { winner: clean(m[1]), decision: m[2].toLowerCase() as 'bat' | 'bowl' };
};

export const parseScorecard = (html: string, cricclubsMatchId: number): ParsedScorecard => {
  const $ = cheerio.load(html);
  const title = clean($('title').text());
  const titleMatch = title.match(/^(?:League:\s*)?(.+?)\s+vs\s+(.+?)(?:\s+-\s+|$)/i);
  const teamA = titleMatch?.[1]?.trim() ?? null;
  const teamB = titleMatch?.[2]?.trim() ?? null;
  const toss = parseToss(html);

  const tables = $('table.table').toArray();
  const innings: ParsedInnings[] = [];
  let i = 0;
  let inningsNumber: 1 | 2 = 1;

  while (i < tables.length) {
    const tableRows = $(tables[i]!).find('tr').toArray().map((tr) => cells($, tr));
    const headerText = (tableRows[0] ?? []).join(' ');

    if (/\bR\b.*\bB\b.*\b4s\b.*\b6s\b.*\bSR\b/.test(headerText)) {
      const headerCell0 = tableRows[0]?.[0] ?? '';
      const teamName = headerCell0.match(/^(.+?)\s+innings/i)?.[1]?.trim() ?? '';
      const batting: ParsedBattingRow[] = [];
      let extras: ParsedExtras | null = null;
      let total: ParsedTotal | null = null;

      for (let r = 1; r < tableRows.length; r++) {
        const row = tableRows[r]!;
        const first = row[0] ?? '';
        if (/^Extras\b/i.test(first)) { extras = parseExtras(row); continue; }
        if (/^Total\b/i.test(first)) { total = parseTotal(row); continue; }
        if (row.length >= 7 && row[2] !== '' && row[2] !== undefined) {
          const parsed = parseBattingRow(row);
          if (parsed) batting.push(parsed);
        }
      }

      let didNotBat: string[] = [];
      const dnbTable = tables[i + 1];
      if (dnbTable) {
        const txt = clean($(dnbTable).text());
        if (/^Did not bat:/i.test(txt)) {
          didNotBat = txt.replace(/^Did not bat:\s*/i, '')
            .split(',').map((s) => s.trim()).filter(Boolean).map(cleanName);
          i += 1;
        }
      }

      let bowling: ParsedBowlingRow[] = [];
      const bowlTable = tables[i + 1];
      if (bowlTable) {
        const bowlRows = $(bowlTable).find('tr').toArray().map((tr) => cells($, tr));
        if (/Bowling/i.test((bowlRows[0] ?? []).join(' '))) {
          for (let r = 1; r < bowlRows.length; r++) {
            const parsed = parseBowlingRow(bowlRows[r]!);
            if (parsed) bowling.push(parsed);
          }
          i += 1;
        }
      }

      innings.push({
        innings_number: inningsNumber,
        batting_team: teamName,
        bowling_team: teamName === teamA ? (teamB ?? '') : (teamA ?? ''),
        total, extras, batting, did_not_bat: didNotBat, bowling,
      });
      inningsNumber = 2;
    }
    i += 1;
  }

  return {
    cricclubs_match_id: cricclubsMatchId,
    team_a: teamA, team_b: teamB,
    toss_winner: toss.winner, toss_decision: toss.decision,
    innings,
  };
};

export const parseMatchList = (html: string): ParsedListEntry[] => {
  const $ = cheerio.load(html);
  const out: ParsedListEntry[] = [];

  $('div.row.team-data[id^="deleteRow"]').each((_i, el) => {
    const $row = $(el);
    const idMatch = ($row.attr('id') ?? '').match(/deleteRow(\d+)/);
    if (!idMatch || !idMatch[1]) return;
    const cricclubsMatchId = Number(idMatch[1]);

    const $time = $row.find('.sch-time').first();
    const day = clean($time.find('h2').text());
    const monYr = clean(
      $time.find('h5').filter((_j, h) => $(h).find('strong').length === 0).first().text()
    );
    const matchFormat = clean($time.find('h5 strong').text()) || null;
    let matchDate: string | null = null;
    if (day && monYr) {
      const d = new Date(`${day} ${monYr}`);
      if (!isNaN(d.getTime())) matchDate = d.toISOString().slice(0, 10);
    }

    const scoreLis = $row.find('.schedule-logo li').filter((_j, l) => $(l).find('span').length > 0);
    const teamScores = scoreLis.map((_j, l) => {
      const $l = $(l);
      return { score: clean($l.find('span').first().text()), overs: clean($l.find('p').first().text()) };
    }).get();

    const $text = $row.find('.schedule-text').first();
    const headers = $text.find('h4, h3').map((_j, h) => clean($(h).text())).get();
    const leagueDivision = headers[0] ?? null;
    const matchup = headers[1] ?? '';
    const resultText = headers[2] ?? '';

    const m = matchup.match(/^(.+?)\s+v\s+(.+)$/i);
    const teamA = m?.[1]?.trim() ?? null;
    const teamB = m?.[2]?.trim() ?? null;

    let winner: string | null = null;
    if (teamA && resultText.startsWith(teamA)) winner = teamA;
    else if (teamB && resultText.startsWith(teamB)) winner = teamB;

    const scoreA = teamScores[0];
    const scoreB = teamScores[1];

    out.push({
      cricclubs_match_id: cricclubsMatchId,
      match_date: matchDate,
      match_format: matchFormat,
      league_division: leagueDivision,
      team_a: teamA, team_b: teamB,
      team_a_score: scoreA ? `${scoreA.score} (${scoreA.overs})` : '',
      team_b_score: scoreB ? `${scoreB.score} (${scoreB.overs})` : '',
      result_text: resultText,
      winner_team: winner,
    });
  });

  return out;
};
