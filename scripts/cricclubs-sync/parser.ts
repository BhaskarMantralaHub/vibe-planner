// Pure parser functions: HTML in → typed objects out.
// No I/O, no Playwright, no Supabase. Unit-tested via fixture files.
import * as cheerio from 'cheerio';

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
  innings: ParsedInnings[];
};

export type ParsedListEntry = {
  cricclubs_match_id: number;
  match_date: string | null;       // ISO YYYY-MM-DD
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

const cleanName = (s: string | undefined | null): string =>
  clean((s ?? '').replace(/[†*]/g, ''));

// Loose type on `tr` — cheerio's public `Element` export changed across versions.
// This stays internal so `any` is acceptable here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cells = ($: cheerio.CheerioAPI, tr: any): string[] =>
  $(tr)
    .find('td, th')
    .map((_i, c) => clean($(c).text()))
    .get();

// ── Row parsers ──────────────────────────────────────────────────────────

// Batting row layout (7 cells):
//   [0] name + dismissal      (e.g. "Kulbir Singh c Adi J b Naresh M")
//   [1] dismissal only        (e.g. "c Adi J b Naresh M")
//   [2] runs   [3] balls   [4] 4s   [5] 6s   [6] SR
const parseBattingRow = (row: string[]): ParsedBattingRow | null => {
  if (row.length < 7) return null;
  const nameAndDismissal = row[0] ?? '';
  const dismissal = row[1] ?? '';
  const R = row[2] ?? '';
  const B = row[3] ?? '';
  const fours = row[4] ?? '';
  const sixes = row[5] ?? '';
  const SR = row[6] ?? '';

  let name = nameAndDismissal;
  if (dismissal && nameAndDismissal.endsWith(dismissal)) {
    name = nameAndDismissal.slice(0, -dismissal.length).trim();
  }
  const isWk = /†/.test(name);
  const isCaptain = /\*/.test(name);
  name = cleanName(name);

  return {
    raw_name: name,
    is_captain: isCaptain,
    is_wicketkeeper: isWk,
    dismissal,
    runs: Number(R) || 0,
    balls: Number(B) || 0,
    fours: Number(fours) || 0,
    sixes: Number(sixes) || 0,
    strike_rate: SR ? parseFloat(SR) : null,
    not_out: /not out|retired not out/i.test(dismissal),
  };
};

// Bowling row layout (9 cells):
//   [0] empty   [1] name   [2] O   [3] M   [4] Dot   [5] R   [6] W   [7] Econ   [8] extras notation
const parseBowlingRow = (row: string[]): ParsedBowlingRow | null => {
  if (row.length < 8) return null;
  const name = row[1] ?? '';
  if (!name) return null;
  const O = row[2] ?? '';
  const M = row[3] ?? '';
  const Dot = row[4] ?? '';
  const R = row[5] ?? '';
  const W = row[6] ?? '';
  const Econ = row[7] ?? '';
  const isCaptain = /\*/.test(name);
  return {
    raw_name: cleanName(name),
    is_captain: isCaptain,
    overs: parseFloat(O) || 0,
    maidens: Number(M) || 0,
    dots: Number(Dot) || 0,
    runs: Number(R) || 0,
    wickets: Number(W) || 0,
    economy: Econ ? parseFloat(Econ) : null,
  };
};

const parseExtras = (row: string[]): ParsedExtras => {
  const txt = row[1] ?? '';
  const m = txt.match(/b\s*(\d+).*?lb\s*(\d+).*?w\s*(\d+).*?nb\s*(\d+)/i);
  const total = Number(row[2]) || 0;
  return {
    byes: m ? Number(m[1]) : 0,
    leg_byes: m ? Number(m[2]) : 0,
    wides: m ? Number(m[3]) : 0,
    no_balls: m ? Number(m[4]) : 0,
    total,
  };
};

const parseTotal = (row: string[]): ParsedTotal => {
  const txt = row[1] ?? '';
  const wkt = txt.match(/(\d+)\s*wickets?/i);
  const ov = txt.match(/([\d.]+)\s*overs/i);
  const last = row[2] ?? '';
  return {
    runs: Number(last) || null,
    wickets: wkt ? Number(wkt[1]) : null,
    overs: ov ? parseFloat(ov[1] ?? '') : null,
  };
};

// ── Scorecard parser ─────────────────────────────────────────────────────

export const parseScorecard = (
  html: string,
  cricclubsMatchId: number,
): ParsedScorecard => {
  const $ = cheerio.load(html);
  const title = clean($('title').text());
  const titleMatch = title.match(/^(?:League:\s*)?(.+?)\s+vs\s+(.+?)(?:\s+-\s+|$)/i);
  const teamA = titleMatch?.[1]?.trim() ?? null;
  const teamB = titleMatch?.[2]?.trim() ?? null;

  const tables = $('table.table').toArray();
  const innings: ParsedInnings[] = [];
  let i = 0;
  let inningsNumber: 1 | 2 = 1;

  while (i < tables.length) {
    const $t = $(tables[i]!);
    const tableRows = $t
      .find('tr')
      .toArray()
      .map((tr) => cells($, tr));
    const headerText = (tableRows[0] ?? []).join(' ');

    // Batting card header has "R B 4s 6s SR"
    if (/\bR\b.*\bB\b.*\b4s\b.*\b6s\b.*\bSR\b/.test(headerText)) {
      const headerCell0 = tableRows[0]?.[0] ?? '';
      const teamName =
        headerCell0.match(/^(.+?)\s+innings/i)?.[1]?.trim() ?? '';
      const batting: ParsedBattingRow[] = [];
      let extras: ParsedExtras | null = null;
      let total: ParsedTotal | null = null;

      for (let r = 1; r < tableRows.length; r++) {
        const row = tableRows[r]!;
        const first = row[0] ?? '';
        if (/^Extras\b/i.test(first)) {
          extras = parseExtras(row);
          continue;
        }
        if (/^Total\b/i.test(first)) {
          total = parseTotal(row);
          continue;
        }
        if (row.length >= 7 && row[2] !== '' && row[2] !== undefined) {
          const parsed = parseBattingRow(row);
          if (parsed) batting.push(parsed);
        }
      }

      // Optional Did-Not-Bat table next
      let didNotBat: string[] = [];
      const dnbTable = tables[i + 1];
      if (dnbTable) {
        const txt = clean($(dnbTable).text());
        if (/^Did not bat:/i.test(txt)) {
          didNotBat = txt
            .replace(/^Did not bat:\s*/i, '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
            .map(cleanName);
          i += 1;
        }
      }

      // Bowling table next
      let bowling: ParsedBowlingRow[] = [];
      const bowlTable = tables[i + 1];
      if (bowlTable) {
        const $b = $(bowlTable);
        const bowlRows = $b
          .find('tr')
          .toArray()
          .map((tr) => cells($, tr));
        const bowlHeader = (bowlRows[0] ?? []).join(' ');
        if (/Bowling/i.test(bowlHeader)) {
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
        total,
        extras,
        batting,
        did_not_bat: didNotBat,
        bowling,
      });
      inningsNumber = 2;
    }
    i += 1;
  }

  return {
    cricclubs_match_id: cricclubsMatchId,
    team_a: teamA,
    team_b: teamB,
    innings,
  };
};

// ── Match list parser ────────────────────────────────────────────────────

export const parseMatchList = (html: string): ParsedListEntry[] => {
  const $ = cheerio.load(html);
  const out: ParsedListEntry[] = [];

  $('div.row.team-data[id^="deleteRow"]').each((_i, el) => {
    const $row = $(el);
    const id = $row.attr('id') ?? '';
    const matchIdMatch = id.match(/deleteRow(\d+)/);
    if (!matchIdMatch || !matchIdMatch[1]) return;
    const cricclubsMatchId = Number(matchIdMatch[1]);

    const $time = $row.find('.sch-time').first();
    const day = clean($time.find('h2').text());
    const monYr = clean(
      $time
        .find('h5')
        .filter((_j, h) => $(h).find('strong').length === 0)
        .first()
        .text(),
    );
    const matchFormat = clean($time.find('h5 strong').text()) || null;
    let matchDate: string | null = null;
    if (day && monYr) {
      const d = new Date(`${day} ${monYr}`);
      if (!isNaN(d.getTime())) {
        matchDate = d.toISOString().slice(0, 10);
      }
    }

    const scoreLis = $row
      .find('.schedule-logo li')
      .filter((_j, l) => $(l).find('span').length > 0);
    const teamScores = scoreLis
      .map((_j, l) => {
        const $l = $(l);
        const score = clean($l.find('span').first().text());
        const overs = clean($l.find('p').first().text());
        return { score, overs };
      })
      .get();

    const $text = $row.find('.schedule-text').first();
    const headers = $text
      .find('h4, h3')
      .map((_j, h) => clean($(h).text()))
      .get();
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
      team_a: teamA,
      team_b: teamB,
      team_a_score: scoreA ? `${scoreA.score} (${scoreA.overs})` : '',
      team_b_score: scoreB ? `${scoreB.score} (${scoreB.overs})` : '',
      result_text: resultText,
      winner_team: winner,
    });
  });

  return out;
};
