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
