// Offline cricclubs ingest — parses cricclubs HTML you saved from a REAL
// browser (which clears Cloudflare) and writes to Supabase. No network to
// cricclubs, so Cloudflare's bot-wall is irrelevant. Mirrors the upsert +
// auto-complete logic of sync.ts, minus the (Cloudflare-blocked) Playwright
// fetch.
//
// USAGE (from scripts/cricclubs-sync/):
//   node_modules/.bin/tsx ingest-html.mts <file1.html> [file2.html ...]
//
// Save these pages from Chrome (Cmd+S → "Webpage, HTML Only", or "Save As"):
//   • Matches → Results            (listMatches.do) — gives scores + result
//   • Each match's Scorecard page   (viewScorecard.do?matchId=N) — player stats
// Order doesn't matter; the script routes each file by content.
import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import {
  parseMatchList, parseScorecard, parseFixtures,
  extractUmpiringDuties, isOurFixture,
  type ParsedListEntry, type ParsedScorecard, type ParsedFixture,
} from './parser.js';
import { makeServiceRoleClient, loadRoster, resolvePlayerId } from './supabase.js';

// ── Config (matches sync.ts) ────────────────────────────────────────────
const BASE = 'https://cricclubs.com/MountainHouseTracyCricketAssociationMTCA';
const CLUB_ID = 14653;
const LEAGUE_ID = 87;
// Our numeric cricclubs team id — the value in viewTeam.do?teamId=NNNN links.
// Used to partition the league-wide fixture feed. Overridable so a second team
// can run this without a code change.
const MY_CRICCLUBS_TEAM_ID = Number(process.env.CRICCLUBS_TEAM_ID ?? 1014);
const INTERNAL_TEAM_ID =
  process.env.CRICCLUBS_TEAM_ID_INTERNAL ?? '8284208d-fb02-44bf-bb8c-3c5411d35386';

const scorecardUrl = (matchId: number): string =>
  `${BASE}/viewScorecard.do?matchId=${matchId}&clubId=${CLUB_ID}`;

const extractLeagueName = (combined: string | null): string | null => {
  if (!combined) return null;
  const i = combined.lastIndexOf(' - ');
  return i >= 0 ? combined.slice(0, i).trim() : combined;
};
const extractDivision = (combined: string | null): string | null => {
  if (!combined) return null;
  const i = combined.lastIndexOf(' - ');
  return i >= 0 ? combined.slice(i + 3).trim() : null;
};
const normalizeOpponent = (s: string): string =>
  s.toLowerCase().replace(/^mtca\s+/i, '').trim();
const parseTeamScore = (raw: string | null): { score: string; overs: string } => {
  if (!raw) return { score: '', overs: '' };
  const m = raw.match(/^([\d/]+)\s*\(([\d.]+)/);
  return m ? { score: m[1]!, overs: m[2]! } : { score: raw, overs: '' };
};
const stripClubPrefix = (s: string | null | undefined): string => (s ?? '').replace(/^MTCA\s+/i, '').trim();
const normalizeMatchType = (raw: string | null): string | null => {
  if (!raw) return null;
  const lc = raw.toLowerCase();
  // ORDER IS LOAD-BEARING. "Semi Final" contains "final", so semi must be
  // tested first or every semi-final would be recorded as a final. Playoffs
  // are tested before league so "League Semi Final" is not flattened to
  // 'league' and the knockout round silently lost.
  if (lc.includes('semi')) return 'semi_final';
  if (lc.includes('final')) return 'final';
  if (lc.includes('league')) return 'league';
  if (lc.includes('practice')) return 'practice';
  return null;
};
const combineUmpires = (u1: string | null, u2: string | null): string | null => {
  const a = u1?.trim() || null;
  const b = u2?.trim() || null;
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return a === b ? a : `${a}, ${b}`;
};

type Client = ReturnType<typeof makeServiceRoleClient>;

// Chrome's "Webpage, Single File" saves .mhtml — a MIME archive whose HTML part
// is quoted-printable (or base64) encoded. Unwrap it to real HTML. Plain .html
// files pass through unchanged. Returns the page HTML plus its source URL (from
// the MHTML headers) so a scorecard's matchId can be read reliably.
function decodeQuotedPrintable(input: string): string {
  const noSoftBreaks = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < noSoftBreaks.length; i++) {
    const c = noSoftBreaks[i]!;
    if (c === '=' && /^[0-9A-Fa-f]{2}$/.test(noSoftBreaks.substr(i + 1, 2))) {
      bytes.push(parseInt(noSoftBreaks.substr(i + 1, 2), 16));
      i += 2;
    } else {
      bytes.push(c.charCodeAt(0) & 0xff);
    }
  }
  return new TextDecoder('utf-8').decode(Uint8Array.from(bytes));
}

function readPage(path: string): { html: string; url: string | null } {
  const raw = readFileSync(path, 'utf8');
  const isMhtml = /^\s*(?:From:|MIME-Version:)/i.test(raw.slice(0, 200)) ||
    /Content-Type:\s*multipart\/related/i.test(raw.slice(0, 2000));
  if (!isMhtml) return { html: raw, url: null };

  const url = raw.match(/Snapshot-Content-Location:\s*(\S+)/i)?.[1] ??
    raw.match(/Content-Location:\s*(\S+)/i)?.[1] ?? null;
  const boundary = raw.match(/boundary="?([^"\r\n;]+)"?/i)?.[1];
  if (!boundary) return { html: raw, url };

  for (const part of raw.split('--' + boundary)) {
    if (!/Content-Type:\s*text\/html/i.test(part)) continue;
    const body = part.match(/\r?\n\r?\n([\s\S]*)$/)?.[1];
    if (!body) continue;
    if (/Content-Transfer-Encoding:\s*quoted-printable/i.test(part)) {
      return { html: decodeQuotedPrintable(body), url };
    }
    if (/Content-Transfer-Encoding:\s*base64/i.test(part)) {
      const bin = atob(body.replace(/\s+/g, ''));
      return { html: new TextDecoder('utf-8').decode(Uint8Array.from(bin, (c) => c.charCodeAt(0))), url };
    }
    return { html: body, url };
  }
  return { html: raw, url };
}

// ── Upserts (faithful to sync.ts) ─────────────────────────────────────────
const upsertMatch = async (
  supabase: Client,
  entry: ParsedListEntry,
  scorecard: ParsedScorecard | null,
  rawHtml: string | null,
): Promise<string> => {
  const teamA = scorecard?.team_a ?? entry.team_a ?? '';
  const teamB = scorecard?.team_b ?? entry.team_b ?? '';
  const { data, error } = await supabase
    .from('cricclubs_matches')
    .upsert(
      {
        team_id: INTERNAL_TEAM_ID,
        cricclubs_match_id: entry.cricclubs_match_id,
        cricclubs_league_id: LEAGUE_ID,
        match_date: entry.match_date,
        match_format: entry.match_format,
        league_name: extractLeagueName(entry.league_division),
        division: extractDivision(entry.league_division),
        team_a: teamA,
        team_b: teamB,
        team_a_score: entry.team_a_score || null,
        team_b_score: entry.team_b_score || null,
        result_text: entry.result_text || null,
        winner_team: entry.winner_team,
        toss_winner: scorecard?.toss_winner ?? null,
        toss_decision: scorecard?.toss_decision ?? null,
        scorecard_url: scorecardUrl(entry.cricclubs_match_id),
        parsed_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,cricclubs_match_id' },
    )
    .select('id')
    .single();
  if (error || !data) throw new Error(`upsertMatch ${entry.cricclubs_match_id}: ${error?.message ?? 'no data'}`);
  if (rawHtml) {
    const { error: htmlErr } = await supabase
      .from('cricclubs_match_html')
      .upsert({ match_row_id: data.id, raw_html: rawHtml }, { onConflict: 'match_row_id' });
    if (htmlErr) throw new Error(`upsert match_html ${entry.cricclubs_match_id}: ${htmlErr.message}`);
  }
  return data.id as string;
};

const upsertInnings = async (
  supabase: Client,
  scorecard: ParsedScorecard,
  matchRowId: string,
  byName: Map<string, string>,
): Promise<{ batting: number; bowling: number }> => {
  let batting = 0;
  let bowling = 0;
  for (const inn of scorecard.innings) {
    const batRows = inn.batting.map((b, idx) => ({
      match_row_id: matchRowId, team_id: INTERNAL_TEAM_ID,
      innings_number: inn.innings_number, batting_team: inn.batting_team,
      cricclubs_name: b.raw_name, player_id: resolvePlayerId(b.raw_name, byName),
      batting_position: idx + 1, runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes,
      strike_rate: b.strike_rate, dismissal: b.dismissal || null, not_out: b.not_out,
      is_captain: b.is_captain, is_wicketkeeper: b.is_wicketkeeper, did_not_bat: false,
    }));
    for (const dnb of inn.did_not_bat) {
      batRows.push({
        match_row_id: matchRowId, team_id: INTERNAL_TEAM_ID,
        innings_number: inn.innings_number, batting_team: inn.batting_team,
        cricclubs_name: dnb, player_id: resolvePlayerId(dnb, byName),
        batting_position: null as unknown as number, runs: 0, balls: 0, fours: 0, sixes: 0,
        strike_rate: null as unknown as number, dismissal: null, not_out: false,
        is_captain: false, is_wicketkeeper: false, did_not_bat: true,
      });
    }
    if (batRows.length) {
      const { error } = await supabase.from('cricclubs_batting')
        .upsert(batRows, { onConflict: 'match_row_id,innings_number,batting_team,cricclubs_name' });
      if (error) throw new Error(`upsert batting: ${error.message}`);
      batting += batRows.length;
    }
    const bowlRows = inn.bowling.map((b) => ({
      match_row_id: matchRowId, team_id: INTERNAL_TEAM_ID,
      innings_number: inn.innings_number, bowling_team: inn.bowling_team,
      cricclubs_name: b.raw_name, player_id: resolvePlayerId(b.raw_name, byName),
      overs: b.overs, maidens: b.maidens, dots: b.dots, runs: b.runs, wickets: b.wickets,
      economy: b.economy, is_captain: b.is_captain,
    }));
    if (bowlRows.length) {
      const { error } = await supabase.from('cricclubs_bowling')
        .upsert(bowlRows, { onConflict: 'match_row_id,innings_number,bowling_team,cricclubs_name' });
      if (error) throw new Error(`upsert bowling: ${error.message}`);
      bowling += bowlRows.length;
    }
  }
  return { batting, bowling };
};

// Auto-complete past/today schedule rows. Uses `lte` + a same-day guard so a
// match played today completes as soon as cricclubs has a result, but a still-
// live game (no winner, no result_text) is left for the next run.
const autoComplete = async (supabase: Client): Promise<number> => {
  const { data: teamRow } = await supabase
    .from('cricket_teams').select('name').eq('id', INTERNAL_TEAM_ID).maybeSingle();
  if (!teamRow) return 0;
  const myName = `MTCA ${(teamRow as { name: string }).name}`;
  const todayPT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const { data: rows } = await supabase
    .from('cricket_schedule_matches')
    .select('id, opponent, match_date')
    .eq('team_id', INTERNAL_TEAM_ID).eq('status', 'upcoming')
    .lte('match_date', todayPT).is('result', null);
  if (!rows?.length) return 0;

  const { data: cms } = await supabase
    .from('cricclubs_matches')
    .select('match_date, team_a, team_b, team_a_score, team_b_score, winner_team, result_text')
    .eq('team_id', INTERNAL_TEAM_ID);
  type CM = { match_date: string | null; team_a: string; team_b: string; team_a_score: string | null; team_b_score: string | null; winner_team: string | null; result_text: string | null };
  const idx = new Map<string, CM>();
  for (const cm of (cms ?? []) as CM[]) {
    if (!cm.match_date) continue;
    const opp = cm.team_a === myName ? cm.team_b : cm.team_a;
    idx.set(`${cm.match_date}|${normalizeOpponent(opp)}`, cm);
  }

  let updated = 0;
  for (const s of rows as { id: string; opponent: string; match_date: string }[]) {
    const cm = idx.get(`${s.match_date}|${normalizeOpponent(s.opponent)}`);
    if (!cm) continue;
    if (s.match_date === todayPT && !cm.winner_team && !cm.result_text) continue; // still live
    const usAreA = cm.team_a === myName;
    const ours = parseTeamScore(usAreA ? cm.team_a_score : cm.team_b_score);
    const opp = parseTeamScore(usAreA ? cm.team_b_score : cm.team_a_score);
    let result: 'won' | 'lost' | 'draw' = 'draw';
    if (cm.winner_team) {
      result = cm.winner_team.toLowerCase().startsWith(myName.toLowerCase()) ? 'won' : 'lost';
    }
    const { error } = await supabase.from('cricket_schedule_matches')
      .update({
        status: 'completed', result,
        team_score: ours.score || null, team_overs: ours.overs || null,
        opponent_score: opp.score || null, opponent_overs: opp.overs || null,
        result_summary: cm.result_text ?? null,
      })
      .eq('id', s.id).is('result', null);
    if (!error) {
      updated += 1;
      console.log(`  ✓ completed vs ${s.opponent} (${s.match_date}) → ${result} ${ours.score || '?'}-${opp.score || '?'}`);
    }
  }
  return updated;
};

// Refresh upcoming schedule rows from the fixtures page. Matches by
// cricclubs_fixture_id (current rows all carry it), diff-PATCHes only changed
// fields, and never touches a row that already has a result.
const refreshFixtures = async (supabase: Client, fixtures: ParsedFixture[], myName: string): Promise<number> => {
  const { data: rows } = await supabase
    .from('cricket_schedule_matches')
    .select('id, opponent, match_date, match_time, venue, match_type, is_home, umpire, cricclubs_fixture_id')
    .eq('team_id', INTERNAL_TEAM_ID).eq('status', 'upcoming').is('result', null).is('deleted_at', null);
  type Row = { id: string; opponent: string; match_date: string; match_time: string | null; venue: string | null; match_type: string | null; is_home: boolean | null; umpire: string | null; cricclubs_fixture_id: number | null };
  const byId = new Map<number, Row>();
  for (const r of (rows ?? []) as Row[]) if (r.cricclubs_fixture_id != null) byId.set(r.cricclubs_fixture_id, r);

  let updated = 0;
  for (const fx of fixtures) {
    const cur = byId.get(fx.cricclubs_fixture_id);
    if (!cur) continue;
    const upd: Record<string, unknown> = {};
    if (fx.match_date && fx.match_date !== cur.match_date) upd.match_date = fx.match_date;
    if (fx.match_time_24h && fx.match_time_24h !== cur.match_time) upd.match_time = fx.match_time_24h;
    if (fx.venue && fx.venue !== cur.venue) upd.venue = fx.venue;
    const mt = normalizeMatchType(fx.match_type);
    if (mt && mt !== cur.match_type) upd.match_type = mt;
    const isHome = fx.team_home === myName;
    if (cur.is_home !== isHome) upd.is_home = isHome;
    const ump = combineUmpires(fx.umpire1, fx.umpire2);
    if (ump !== (cur.umpire ?? null)) upd.umpire = ump;
    const cricOpp = fx.team_home === myName ? fx.team_away : fx.team_home;
    const opp = stripClubPrefix(cricOpp);
    if (opp && opp !== cur.opponent) upd.opponent = opp;
    if (Object.keys(upd).length === 0) continue;
    const { error } = await supabase.from('cricket_schedule_matches').update(upd).eq('id', cur.id).is('result', null);
    if (!error) { updated += 1; console.log(`  ✓ fixture vs ${cur.opponent} (${cur.match_date}): ${Object.keys(upd).join(', ')}`); }
  }
  return updated;
};

// ── Umpiring duties ───────────────────────────────────────────────────────
// Turns the league-wide fixture feed into cricket_umpiring_duties rows.
//
// THE ONE RULE: this writes MTCA's facts and nothing else. It may INSERT a
// missing slot and PATCH match_date / match_time / venue / team_a / team_b /
// match_type. It must never touch status, assignment, notes or deleted_at —
// those are player- and admin-authored. A BEFORE UPDATE trigger on the table
// enforces this against the service role, so a bug here is contained rather
// than destroying every claim in the season.

type DutyRow = {
  id: string;
  cricclubs_fixture_id: number | null;
  role_slot: number;
  match_date: string;
  match_time: string | null;
  venue: string | null;
  team_a: string;
  team_b: string;
  match_type: string | null;
  status: string;
  source: string;
  mtca_removed_at: string | null;
  deleted_at: string | null;
};

/** Resolves the single active season and its cricclubs team id. */
const resolveUmpiringContext = async (
  supabase: Client,
): Promise<{ seasonId: string; cricclubsTeamId: number } | null> => {
  const { data: seasons, error } = await supabase
    .from('cricket_seasons')
    .select('id, name')
    .eq('team_id', INTERNAL_TEAM_ID)
    .eq('is_active', true);
  if (error) { console.warn(`⚠ umpiring: season lookup failed — ${error.message}`); return null; }

  const rows = (seasons ?? []) as { id: string; name: string }[];
  // Never fall back to "the first row". Filing a season's duties under the
  // wrong season hides them from the people who need them and shows phantom
  // duties to everyone else, with nothing erroring.
  if (rows.length !== 1) {
    console.warn(`⚠ umpiring: expected exactly 1 active season, found ${rows.length} — skipping duty sync`);
    return null;
  }
  const seasonId = rows[0]!.id;

  const { data: settings } = await supabase
    .from('cricket_umpiring_settings')
    .select('cricclubs_team_id')
    .eq('season_id', seasonId)
    .maybeSingle();
  const cricclubsTeamId = (settings as { cricclubs_team_id: number | null } | null)?.cricclubs_team_id ?? null;

  if (cricclubsTeamId == null) {
    console.warn(
      '⚠ umpiring: cricket_umpiring_settings.cricclubs_team_id is not set for this season — skipping duty sync.\n' +
      '  Set it to the team\'s numeric cricclubs id (visible in any viewTeam.do?teamId=NNNN link).',
    );
    return null;
  }
  return { seasonId, cricclubsTeamId };
};

const syncUmpiringDuties = async (
  supabase: Client,
  fixtures: ParsedFixture[],
): Promise<{ inserted: number; patched: number; remapped: number; flagged: number }> => {
  const result = { inserted: 0, patched: 0, remapped: 0, flagged: 0 };

  // Mass-destruction guard: an empty feed is indistinguishable from cricclubs
  // changing their HTML, so it must never drive reconciliation.
  if (fixtures.length === 0) {
    console.warn('⚠ umpiring: fixture feed is empty — skipping duty sync entirely');
    return result;
  }

  const ctx = await resolveUmpiringContext(supabase);
  if (!ctx) return result;
  const { seasonId, cricclubsTeamId } = ctx;

  const { duties, skipped } = extractUmpiringDuties(fixtures, cricclubsTeamId);
  for (const s of skipped) console.warn(`⚠ umpiring: skipped — ${s}`);

  // ALL rows including soft-deleted: a handed-away duty must stay a tombstone
  // rather than being re-inserted as a fresh open slot.
  const { data: existingRows, error: exErr } = await supabase
    .from('cricket_umpiring_duties')
    .select('id, cricclubs_fixture_id, role_slot, match_date, match_time, venue, team_a, team_b, match_type, status, source, mtca_removed_at, deleted_at')
    .eq('team_id', INTERNAL_TEAM_ID)
    .eq('season_id', seasonId);
  if (exErr) { console.warn(`⚠ umpiring: existing duty lookup failed — ${exErr.message}`); return result; }
  const existing = (existingRows ?? []) as DutyRow[];

  const keyOf = (fixtureId: number, slot: number) => `${fixtureId}|${slot}`;
  const byKey = new Map<string, DutyRow>();
  for (const d of existing) {
    if (d.cricclubs_fixture_id != null) byKey.set(keyOf(d.cricclubs_fixture_id, d.role_slot), d);
  }

  // Group both sides by fixture so reconciliation happens at FIXTURE level.
  // Slot-level logic would destroy a live claim whenever MTCA merely shuffles
  // us between the Umpire1 and Umpire2 columns.
  const feedByFixture = new Map<number, typeof duties>();
  for (const d of duties) {
    const list = feedByFixture.get(d.cricclubs_fixture_id) ?? [];
    list.push(d);
    feedByFixture.set(d.cricclubs_fixture_id, list);
  }
  const liveByFixture = new Map<number, DutyRow[]>();
  for (const d of existing) {
    if (d.cricclubs_fixture_id == null) continue;      // manual duty — invisible to sync
    if (d.deleted_at !== null) continue;               // handed away
    if (d.source !== 'mtca') continue;                 // swapped in by an admin
    const list = liveByFixture.get(d.cricclubs_fixture_id) ?? [];
    list.push(d);
    liveByFixture.set(d.cricclubs_fixture_id, list);
  }

  for (const [fixtureId, feedDuties] of feedByFixture) {
    const liveRows = liveByFixture.get(fixtureId) ?? [];
    const feedSlots = new Set(feedDuties.map((d) => d.role_slot));
    const liveSlots = new Set(liveRows.map((d) => d.role_slot));

    const missingInDb = feedDuties.filter((d) => !liveSlots.has(d.role_slot));
    const surplusInDb = liveRows.filter((d) => !feedSlots.has(d.role_slot));

    // ── Role-slot swap: same number of duties, different columns. Remap the
    // existing row rather than inserting + orphaning, so the claim survives.
    while (missingInDb.length > 0 && surplusInDb.length > 0) {
      const target = surplusInDb.shift()!;
      const wanted = missingInDb.shift()!;
      const { error } = await supabase
        .from('cricket_umpiring_duties')
        .update({ role_slot: wanted.role_slot })
        .eq('id', target.id);
      if (!error) {
        result.remapped += 1;
        console.log(`  ↔ duty fixture ${fixtureId}: slot ${target.role_slot} → ${wanted.role_slot} (claim preserved)`);
      }
    }

    // ── Genuinely new slots.
    for (const d of missingInDb) {
      if (byKey.has(keyOf(fixtureId, d.role_slot))) continue;  // tombstoned — leave it
      const { error } = await supabase.from('cricket_umpiring_duties').insert({
        team_id: INTERNAL_TEAM_ID,
        season_id: seasonId,
        cricclubs_fixture_id: d.cricclubs_fixture_id,
        role_slot: d.role_slot,
        match_date: d.match_date,
        match_time: d.match_time_24h,
        venue: d.venue,
        team_a: d.team_a,
        team_b: d.team_b,
        match_type: normalizeMatchType(d.match_type),
        umpire_team_cricclubs_id: d.umpire_team_cricclubs_id,
        umpire_team_raw: d.umpire_team_raw,
        source: 'mtca',
        status: 'open',
      });
      if (error) console.warn(`⚠ umpiring insert failed (fixture ${fixtureId} slot ${d.role_slot}): ${error.message}`);
      else { result.inserted += 1; console.log(`  + duty ${d.match_date} ${d.team_a} v ${d.team_b} (slot ${d.role_slot})`); }
    }

    // ── MTCA facts on rows we already hold. Explicit allow-list, never a
    // blanket upsert of the parsed object.
    for (const d of feedDuties) {
      const cur = byKey.get(keyOf(fixtureId, d.role_slot))
        ?? liveRows.find((r) => r.role_slot === d.role_slot);
      if (!cur || cur.deleted_at !== null) continue;
      const upd: Record<string, unknown> = {};
      if (d.match_date !== cur.match_date) upd.match_date = d.match_date;
      if (d.match_time_24h !== cur.match_time) upd.match_time = d.match_time_24h;
      if (d.venue !== cur.venue) upd.venue = d.venue;
      if (d.team_a !== cur.team_a) upd.team_a = d.team_a;
      if (d.team_b !== cur.team_b) upd.team_b = d.team_b;
      const mt = normalizeMatchType(d.match_type);
      if (mt !== cur.match_type) upd.match_type = mt;
      // MTCA names us again — clear any earlier "removed" flag.
      if (cur.mtca_removed_at !== null) upd.mtca_removed_at = null;
      if (Object.keys(upd).length === 0) continue;
      const { error } = await supabase.from('cricket_umpiring_duties').update(upd).eq('id', cur.id);
      if (!error) { result.patched += 1; console.log(`  ✓ duty fixture ${fixtureId} slot ${d.role_slot}: ${Object.keys(upd).join(', ')}`); }
    }

    // ── Surplus after remapping: MTCA reassigned this slot away from us.
    // FLAG ONLY. Never cancel or delete — the duty may already be claimed, and
    // the reassignment may be a swap we agreed. An admin decides.
    for (const d of surplusInDb) {
      if (d.mtca_removed_at !== null) continue;
      const { error } = await supabase
        .from('cricket_umpiring_duties')
        .update({ mtca_removed_at: new Date().toISOString() })
        .eq('id', d.id);
      if (!error) { result.flagged += 1; console.log(`  ⚠ duty fixture ${fixtureId} slot ${d.role_slot}: MTCA no longer names us — flagged for review`); }
    }
  }

  // Fixtures we hold duties for that are NO LONGER IN THE FEED are deliberately
  // left alone. Absence is indistinguishable from the match moving to the past
  // table, the page being truncated, or a parse failure.
  return result;
};

// ── Route each saved HTML file by content ─────────────────────────────────
const classify = (html: string): 'list' | 'scorecard' | 'fixtures' | 'unknown' => {
  const title = (html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? '').trim();
  if (/fixture/i.test(title)) return 'fixtures';          // fixtures.do title = "Fixtures"
  if (/result/i.test(title)) return 'list';                // listMatches.do title = "… Match Results"
  // A scorecard page's title is "TeamA vs TeamB"; it also has innings tables.
  if (/\svs\s/i.test(title) && /innings/i.test(html)) return 'scorecard';
  // Fall back to structural markers if the title is unhelpful.
  if (/id="schedule-table1"/.test(html)) return 'fixtures';
  if (/class="[^"]*schedule-logo[^"]*"/.test(html) && /class="[^"]*team-data[^"]*"/.test(html)) return 'list';
  return 'unknown';
};

const main = async (): Promise<void> => {
  const files = process.argv.slice(2);
  if (!files.length) {
    console.error('Usage: tsx ingest-html.mts <file1.html> [file2.html ...]');
    process.exit(1);
  }
  const supabase = makeServiceRoleClient();
  const { byName } = await loadRoster(supabase, INTERNAL_TEAM_ID);
  console.log(`Loaded ${byName.size} roster entries`);

  const { data: teamRow } = await supabase
    .from('cricket_teams').select('name').eq('id', INTERNAL_TEAM_ID).maybeSingle();
  const myName = `MTCA ${(teamRow as { name: string } | null)?.name ?? ''}`;

  const entriesById = new Map<number, ParsedListEntry>();
  const scorecards: { matchId: number; parsed: ParsedScorecard; html: string }[] = [];
  const allFixtures: ParsedFixture[] = [];

  for (const f of files) {
    const { html, url } = readPage(f);
    const kind = classify(html);
    if (kind === 'list') {
      const entries = parseMatchList(html);
      for (const e of entries) entriesById.set(e.cricclubs_match_id, e);
      console.log(`📋 ${basename(f)}: list → ${entries.length} matches`);
    } else if (kind === 'scorecard') {
      // Prefer the matchId from the page's own URL (MHTML header); fall back to
      // the first matchId link in the body.
      const matchId = Number((url ?? '').match(/matchId=(\d+)/)?.[1] ?? html.match(/matchId=(\d+)/)?.[1] ?? 0);
      if (!matchId) { console.warn(`⚠ ${basename(f)}: scorecard but no matchId found — skipped`); continue; }
      scorecards.push({ matchId, parsed: parseScorecard(html, matchId), html });
      console.log(`🏏 ${basename(f)}: scorecard matchId=${matchId}`);
    } else if (kind === 'fixtures') {
      const fx = parseFixtures(html);
      allFixtures.push(...fx);
      console.log(`📅 ${basename(f)}: fixtures → ${fx.length} upcoming`);
    } else {
      console.warn(`⚠ ${basename(f)}: unrecognized page (not Fixtures/Results/Scorecard) — skipped`);
    }
  }

  // Upsert every match we have a list entry for; attach scorecard if provided.
  let matches = 0, batting = 0, bowling = 0;
  const scByMatch = new Map(scorecards.map((s) => [s.matchId, s]));
  for (const [matchId, entry] of entriesById) {
    const sc = scByMatch.get(matchId);
    const rowId = await upsertMatch(supabase, entry, sc?.parsed ?? null, sc?.html ?? null);
    matches += 1;
    if (sc) {
      const c = await upsertInnings(supabase, sc.parsed, rowId, byName);
      batting += c.batting; bowling += c.bowling;
    }
  }
  // Scorecards without a matching list entry (e.g. only the scorecard was saved):
  // still record player stats, deriving a minimal entry from the scorecard.
  for (const s of scorecards) {
    if (entriesById.has(s.matchId)) continue;
    console.warn(`⚠ scorecard ${s.matchId} has no Results entry — ingesting stats only (no result/scores). Save the Results page to complete the schedule row.`);
    const entry: ParsedListEntry = {
      cricclubs_match_id: s.matchId, match_date: null, match_format: null,
      league_division: null, team_a: s.parsed.team_a, team_b: s.parsed.team_b,
      team_a_score: '', team_b_score: '', result_text: '', winner_team: null,
    };
    const rowId = await upsertMatch(supabase, entry, s.parsed, s.html);
    const c = await upsertInnings(supabase, s.parsed, rowId, byName);
    matches += 1; batting += c.batting; bowling += c.bowling;
  }

  // The schedule refresh must only ever see fixtures WE PLAY IN. On the
  // league-wide feed most rows are other teams' matches; refreshFixtures
  // resolves the opponent as "whichever side isn't us", which for a foreign
  // fixture yields a stranger's name. This path keys strictly on fixture id so
  // it is already safe, but partitioning keeps that true if a fuzzy fallback
  // is ever added (as exists in the Scriptable script).
  const ourFixtures = allFixtures.filter((fx) => isOurFixture(fx, MY_CRICCLUBS_TEAM_ID));
  if (allFixtures.length !== ourFixtures.length) {
    console.log(`📅 ${allFixtures.length} fixtures in feed · ${ourFixtures.length} are ours (rest are other teams')`);
  }

  const fixturesUpdated = ourFixtures.length ? await refreshFixtures(supabase, ourFixtures, myName) : 0;
  const duty = await syncUmpiringDuties(supabase, allFixtures);
  const completed = await autoComplete(supabase);
  console.log(
    `\n✅ ${matches} matches · ${batting} batting · ${bowling} bowling · ` +
    `${fixturesUpdated} fixtures updated · ${completed} schedule rows completed\n` +
    `🧑‍⚖️ duties: ${duty.inserted} new · ${duty.patched} updated · ` +
    `${duty.remapped} slot-remapped · ${duty.flagged} flagged for review`,
  );
};

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
