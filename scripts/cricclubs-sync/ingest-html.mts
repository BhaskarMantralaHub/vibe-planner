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
import { parseMatchList, parseScorecard, parseFixtures, type ParsedListEntry, type ParsedScorecard, type ParsedFixture } from './parser.js';
import { makeServiceRoleClient, loadRoster, resolvePlayerId } from './supabase.js';

// ── Config (matches sync.ts) ────────────────────────────────────────────
const BASE = 'https://cricclubs.com/MountainHouseTracyCricketAssociationMTCA';
const CLUB_ID = 14653;
const LEAGUE_ID = 87;
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

  const fixturesUpdated = allFixtures.length ? await refreshFixtures(supabase, allFixtures, myName) : 0;
  const completed = await autoComplete(supabase);
  console.log(`\n✅ ${matches} matches · ${batting} batting · ${bowling} bowling · ${fixturesUpdated} fixtures updated · ${completed} schedule rows completed`);
};

main().catch((e) => { console.error('FAILED:', e); process.exit(1); });
