// ============================================================================
// cricclubs-sync.js — Scriptable script for iOS
// ----------------------------------------------------------------------------
// Phone-driven cricket sync. Replaces the (Cloudflare-blocked) GH Action and
// the fragile Shortcut path. Fetches cricclubs.com pages from iPhone's
// residential IP (no datacenter challenge), parses scorecards in a hidden
// WKWebView (vanilla DOM, no cheerio dependency on iOS), and upserts to
// Supabase via PostgREST.
//
// Setup: see README.md adjacent to this file.
// ============================================================================

// ── 1. CONFIG ────────────────────────────────────────────────────────────────
// Edit these for your project / team. (Mirror the constants at the top of
// scripts/cricclubs-sync/sync.ts — cricclubs URLs need all three of league,
// teamId, clubId, not just one.)
const CONFIG = {
  supabase_url:      'https://mcklzjmaivtwdhjauwtv.supabase.co',                  // your Supabase project URL
  team_id:           '8284208d-fb02-44bf-bb8c-3c5411d35386',                      // cricket_teams.id for Sunrisers Manteca
  team_name:         'Sunrisers Manteca',                                         // exact name (no "MTCA " prefix — that's auto-added when matching)
  cricclubs_base:    'https://cricclubs.com/MountainHouseTracyCricketAssociationMTCA',
  cricclubs_team_id: 1014,                                                        // cricclubs teamId query param
  club_id:           14653,                                                       // cricclubs clubId query param
  league_id:         87,                                                          // cricclubs league query param
  season_from:       '04/01/2026',                                                // MM/DD/YYYY (cricclubs format)
  season_to:         '08/31/2026',
  force_resync:      false,                                                       // true: re-ingest matches already in DB
  scorecard_timeout_sec: 30,
  user_agent:        'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
};

// ── 2. SERVICE-ROLE KEY (iOS Keychain) ──────────────────────────────────────
// One-time setup: uncomment the next two lines, paste your key, run once,
// then re-comment. The key persists in iOS Keychain (sandboxed per-app).
//   const SETUP_KEY = 'eyJ...your-service-role-key...';
//   if (SETUP_KEY) Keychain.set('cricclubs_sync_sr_key', SETUP_KEY);

if (!Keychain.contains('cricclubs_sync_sr_key')) {
  await new Alert({
    title: 'Service-role key missing',
    message: 'See script header. Uncomment SETUP_KEY block, paste your Supabase service-role key, run once, then re-comment.',
  }).present();
  Script.complete();
  // Unreachable but keeps linters happy.
  throw new Error('Service-role key not configured');
}
const SR_KEY = Keychain.get('cricclubs_sync_sr_key');

// ── 3. HTTP HELPERS ──────────────────────────────────────────────────────────
async function fetchHtml(url, timeoutSec = CONFIG.scorecard_timeout_sec) {
  const req = new Request(url);
  req.timeoutInterval = timeoutSec;
  // Use desktop Chrome UA — cricclubs occasionally tightens around non-browser
  // user agents (and Cloudflare scoring may factor it in). Matches the UA used
  // by scripts/cricclubs-sync/sync.ts.
  req.headers = {
    'User-Agent': CONFIG.user_agent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  };
  return await req.loadString();
}

// Build cricclubs URLs with all three required query params.
function fixturesUrl() {
  return `${CONFIG.cricclubs_base}/fixtures.do`
    + `?league=${CONFIG.league_id}`
    + `&teamId=${CONFIG.cricclubs_team_id}`
    + `&clubId=${CONFIG.club_id}`;
}
function matchListUrl() {
  return `${CONFIG.cricclubs_base}/listMatches.do`
    + `?league=${CONFIG.league_id}`
    + `&teamId=${CONFIG.cricclubs_team_id}`
    + `&clubId=${CONFIG.club_id}`
    + `&fromDate=${encodeURIComponent(CONFIG.season_from)}`
    + `&toDate=${encodeURIComponent(CONFIG.season_to)}`;
}
function scorecardUrl(matchId) {
  return `${CONFIG.cricclubs_base}/viewScorecard.do`
    + `?matchId=${matchId}`
    + `&clubId=${CONFIG.club_id}`;
}

// Bounded retry with linear backoff. Used per-scorecard so one cellular hiccup
// doesn't abort the season's sync.
async function withRetry(fn, retries = 2, delayMs = 2000) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (attempt < retries) {
        await new Promise((r) => Timer.schedule(delayMs * (attempt + 1), false, r));
      }
    }
  }
  throw lastErr;
}

async function supabase(table, opts = {}) {
  const url = `${CONFIG.supabase_url}/rest/v1/${table}${opts.query ?? ''}`;
  const req = new Request(url);
  req.method = opts.method ?? 'GET';
  req.headers = {
    apikey: SR_KEY,
    Authorization: `Bearer ${SR_KEY}`,
    'Content-Type': 'application/json',
    ...(opts.prefer && { Prefer: opts.prefer }),
  };
  if (opts.body) req.body = JSON.stringify(opts.body);
  req.timeoutInterval = 20;
  const text = await req.loadString();
  if (req.response.statusCode >= 400) {
    throw new Error(`${table} ${req.response.statusCode}: ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

// ── 4. PARSERS (WKWebView + vanilla DOM) ────────────────────────────────────
// We load each cricclubs page into a hidden WebView and run a self-contained
// parser function in the page context. The parser returns a JSON string which
// we parse back on the Scriptable side. This mirrors the Node parser exactly
// but uses document.querySelectorAll instead of cheerio.

async function parseInWebView(html, parserBody) {
  const wv = new WebView();
  await wv.loadHTML(html);
  const result = await wv.evaluateJavaScript(`(function(){${parserBody}})()`);
  return result;
}

// Fixtures parser — upcoming matches from fixtures.do
// Mirrors supabase/functions/cricclubs-ingest/parser.ts parseFixtures()
// Selects rows in #schedule-table1 with id="deleteRow{N}" → that {N} is the
// stable cricclubs_fixture_id used to link a fixture to a schedule row.
const FIXTURES_PARSER = String.raw`
  function clean(s) { return (s ?? '').replace(/\s+/g, ' ').trim(); }
  function parseUSDate(raw) {
    const m = (raw || '').match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    return m ? (m[3] + '-' + m[1] + '-' + m[2]) : null;
  }
  function parseTime12To24(raw) {
    const m = (raw || '').match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
    if (!m) return null;
    let h = Number(m[1]);
    const ampm = m[3].toUpperCase();
    if (ampm === 'PM' && h !== 12) h += 12;
    if (ampm === 'AM' && h === 12) h = 0;
    return String(h).padStart(2, '0') + ':' + m[2];
  }
  const rows = Array.from(document.querySelectorAll('#schedule-table1 tbody tr[id^="deleteRow"]'));
  const out = [];
  for (const tr of rows) {
    const idMatch = (tr.getAttribute('id') || '').match(/deleteRow(\d+)/);
    if (!idMatch) continue;
    const fixtureId = Number(idMatch[1]);
    const tds = Array.from(tr.querySelectorAll(':scope > td'));
    if (tds.length < 9) continue;
    const team1 = clean(tds[4].textContent);
    const team2 = clean(tds[5].textContent);
    if (!team1 || !team2) continue;
    out.push({
      cricclubs_fixture_id: fixtureId,
      match_type:           clean(tds[1].textContent) || null,
      match_date:           parseUSDate(clean(tds[2].textContent)),
      match_time_24h:       parseTime12To24(clean(tds[3].textContent)),
      team_home:            team1,
      team_away:            team2,
      venue:                clean(tds[6].textContent) || null,
      umpire1:              clean(tds[7].textContent) || null,
      umpire2:              clean(tds[8].textContent) || null,
    });
  }
  return JSON.stringify(out);
`;

// Match list parser — completed matches from listMatches.do
// Returns array of { cricclubs_match_id, match_date, team_a, team_b, scorecard_url, ... }
const MATCH_LIST_PARSER = String.raw`
  function clean(s) { return (s ?? '').replace(/\s+/g, ' ').trim(); }
  const rows = Array.from(document.querySelectorAll('table tr')).slice(1); // skip header
  const matches = [];
  for (const tr of rows) {
    const cells = Array.from(tr.querySelectorAll('td')).map((c) => clean(c.textContent));
    if (cells.length < 6) continue;
    const link = tr.querySelector('a[href*="viewScorecard.do"]');
    if (!link) continue;
    const href = link.getAttribute('href') || '';
    const idMatch = href.match(/matchId=(\d+)/);
    if (!idMatch) continue;
    // Cell layout (cricclubs listMatches.do): [Date, Format, League-Division, Team A, Score A, Team B, Score B, Result, ...]
    matches.push({
      cricclubs_match_id: Number(idMatch[1]),
      match_date_raw:     cells[0] || null,
      match_format:       cells[1] || null,
      league_division:    cells[2] || null,
      team_a:             cells[3] || null,
      team_a_score:       cells[4] || '',
      team_b:             cells[5] || null,
      team_b_score:       cells[6] || '',
      result_text:        cells[7] || '',
      scorecard_url:      href.startsWith('http') ? href : null,
    });
  }
  return JSON.stringify(matches);
`;

// Scorecard parser — returns full innings + toss + team names
// Mirrors scripts/cricclubs-sync/parser.ts parseScorecard()
const SCORECARD_PARSER = String.raw`
  function clean(s) { return (s ?? '').replace(/\s+/g, ' ').trim(); }
  function cleanName(s) { return clean((s ?? '').replace(/[†*]/g, '')); }
  function cells(tr) {
    return Array.from(tr.querySelectorAll('td, th')).map((c) => clean(c.textContent));
  }

  // Teams from <title>
  const title = clean(document.querySelector('title')?.textContent);
  const titleMatch = title.match(/^(?:League:\s*)?(.+?)\s+vs\s+(.+?)(?:\s+-\s+|$)/i);
  const team_a = titleMatch ? titleMatch[1].trim() : null;
  const team_b = titleMatch ? titleMatch[2].trim() : null;

  // Toss — regex on raw HTML (it's inside a JSON-encoded JS var, not in DOM)
  const rawHtml = document.documentElement.outerHTML;
  const tossMatch = rawHtml.match(/<strong>\s*([^<]+?)\s+won the toss\s+and\s+elected to\s+(bat|bowl)/i);
  const toss_winner = tossMatch ? clean(tossMatch[1]) : null;
  const toss_decision = tossMatch ? tossMatch[2].toLowerCase() : null;

  // Innings tables — iterate, look for batting headers ("R B 4s 6s SR")
  const tables = Array.from(document.querySelectorAll('table.table'));
  const innings = [];
  let inningsNumber = 1;
  let i = 0;
  while (i < tables.length) {
    const tableRows = Array.from(tables[i].querySelectorAll('tr')).map(cells);
    const headerText = (tableRows[0] || []).join(' ');

    if (/\bR\b.*\bB\b.*\b4s\b.*\b6s\b.*\bSR\b/.test(headerText)) {
      const headerCell0 = tableRows[0][0] || '';
      const teamName = (headerCell0.match(/^(.+?)\s+innings/i) || [])[1]?.trim() || '';
      const batting = [];
      let extras = null;
      let total = null;

      for (let r = 1; r < tableRows.length; r++) {
        const row = tableRows[r];
        const first = row[0] || '';
        if (/^Extras\b/i.test(first)) {
          const txt = row[1] || '';
          const m = txt.match(/b\s*(\d+).*?lb\s*(\d+).*?w\s*(\d+).*?nb\s*(\d+)/i);
          extras = {
            byes: m ? Number(m[1]) : 0,
            leg_byes: m ? Number(m[2]) : 0,
            wides: m ? Number(m[3]) : 0,
            no_balls: m ? Number(m[4]) : 0,
            total: Number(row[2]) || 0,
          };
          continue;
        }
        if (/^Total\b/i.test(first)) {
          const txt = row[1] || '';
          const wkt = txt.match(/(\d+)\s*wickets?/i);
          const ov = txt.match(/([\d.]+)\s*overs/i);
          total = {
            runs: Number(row[2]) || null,
            wickets: wkt ? Number(wkt[1]) : null,
            overs: ov ? parseFloat(ov[1]) : null,
          };
          continue;
        }
        if (row.length >= 7 && row[2] !== '' && row[2] !== undefined) {
          const nameAndDismissal = row[0] || '';
          const dismissal = row[1] || '';
          let name = nameAndDismissal;
          if (dismissal && nameAndDismissal.endsWith(dismissal)) {
            name = nameAndDismissal.slice(0, -dismissal.length).trim();
          }
          const isWk = /†/.test(name);
          const isCaptain = /\*/.test(name);
          batting.push({
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
          });
        }
      }

      // Optional Did-Not-Bat table next
      let didNotBat = [];
      const dnbTable = tables[i + 1];
      if (dnbTable) {
        const txt = clean(dnbTable.textContent);
        if (/^Did not bat:/i.test(txt)) {
          didNotBat = txt.replace(/^Did not bat:\s*/i, '')
            .split(',').map((s) => s.trim()).filter(Boolean).map(cleanName);
          i += 1;
        }
      }

      // Bowling table next
      let bowling = [];
      const bowlTable = tables[i + 1];
      if (bowlTable) {
        const bowlRows = Array.from(bowlTable.querySelectorAll('tr')).map(cells);
        const bowlHeader = (bowlRows[0] || []).join(' ');
        if (/Bowling/i.test(bowlHeader)) {
          for (let r = 1; r < bowlRows.length; r++) {
            const br = bowlRows[r];
            if (br.length < 8) continue;
            const name = br[1] || '';
            if (!name) continue;
            const isCaptain = /\*/.test(name);
            bowling.push({
              raw_name: cleanName(name),
              is_captain: isCaptain,
              overs: parseFloat(br[2]) || 0,
              maidens: Number(br[3]) || 0,
              dots: Number(br[4]) || 0,
              runs: Number(br[5]) || 0,
              wickets: Number(br[6]) || 0,
              economy: br[7] ? parseFloat(br[7]) : null,
            });
          }
          i += 1;
        }
      }

      innings.push({
        innings_number: inningsNumber,
        batting_team: teamName,
        bowling_team: teamName === team_a ? (team_b || '') : (team_a || ''),
        total, extras, batting, did_not_bat: didNotBat, bowling,
      });
      inningsNumber = 2;
    }
    i += 1;
  }

  return JSON.stringify({ team_a, team_b, toss_winner, toss_decision, innings });
`;

// ── 5. UPSERT HELPERS ────────────────────────────────────────────────────────
// Roster lookup so we can resolve player names to cricket_players.id for
// batting/bowling rows (lets league-stats join correctly).
async function loadRoster() {
  const rows = await supabase('cricket_players', {
    query: `?team_id=eq.${CONFIG.team_id}&deleted_at=is.null&select=id,name`,
  });
  const map = new Map();
  for (const r of rows) map.set(r.name.toLowerCase().trim(), r.id);
  return map;
}
function resolvePlayerId(rawName, roster) {
  return roster.get(rawName.toLowerCase().trim()) ?? null;
}

// Status guard helper: skip writes that would regress a completed match
// to live (e.g. if cricclubs serves a stale partial scorecard).
async function shouldSkipScorecard(matchId, force) {
  if (force) return false;
  const rows = await supabase('cricclubs_matches', {
    query: `?cricclubs_match_id=eq.${matchId}&team_id=eq.${CONFIG.team_id}&select=id`,
  });
  if (!rows?.length) return false;
  // Already has a row — check if batting rows exist (means innings ingested).
  const inn = await supabase('cricclubs_batting', {
    query: `?match_row_id=eq.${rows[0].id}&select=id&limit=1`,
  });
  return Boolean(inn?.length);
}

async function upsertScorecard(listEntry, parsed, rawHtml, roster) {
  // 1. Match row
  const matchPayload = {
    team_id: CONFIG.team_id,
    cricclubs_match_id: listEntry.cricclubs_match_id,
    match_date: listEntry.match_date,
    match_format: listEntry.match_format,
    league_name: extractLeagueName(listEntry.league_division),
    division: extractDivision(listEntry.league_division),
    team_a: parsed.team_a || listEntry.team_a || '',
    team_b: parsed.team_b || listEntry.team_b || '',
    team_a_score: listEntry.team_a_score || null,
    team_b_score: listEntry.team_b_score || null,
    result_text: listEntry.result_text || null,
    winner_team: listEntry.winner_team || null,
    toss_winner: parsed.toss_winner,
    toss_decision: parsed.toss_decision,
    scorecard_url: listEntry.scorecard_url,
    parsed_at: new Date().toISOString(),
  };
  const matchRow = await supabase('cricclubs_matches', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates,return=representation',
    body: matchPayload,
  });
  const matchRowId = matchRow[0].id;

  // 2. Raw HTML sibling
  await supabase('cricclubs_match_html', {
    method: 'POST',
    prefer: 'resolution=merge-duplicates',
    body: { match_row_id: matchRowId, raw_html: rawHtml },
  });

  // 3. Batting + bowling per innings
  let battingCount = 0;
  let bowlingCount = 0;
  for (const inn of parsed.innings) {
    const batRows = inn.batting.map((b, idx) => ({
      match_row_id: matchRowId,
      team_id: CONFIG.team_id,
      innings_number: inn.innings_number,
      batting_team: inn.batting_team,
      cricclubs_name: b.raw_name,
      player_id: resolvePlayerId(b.raw_name, roster),
      batting_position: idx + 1,
      runs: b.runs, balls: b.balls, fours: b.fours, sixes: b.sixes,
      strike_rate: b.strike_rate,
      dismissal: b.dismissal || null,
      not_out: b.not_out,
      is_captain: b.is_captain,
      is_wicketkeeper: b.is_wicketkeeper,
      did_not_bat: false,
    }));
    for (const dnb of inn.did_not_bat) {
      batRows.push({
        match_row_id: matchRowId,
        team_id: CONFIG.team_id,
        innings_number: inn.innings_number,
        batting_team: inn.batting_team,
        cricclubs_name: dnb,
        player_id: resolvePlayerId(dnb, roster),
        batting_position: null,
        runs: 0, balls: 0, fours: 0, sixes: 0,
        strike_rate: null,
        dismissal: null,
        not_out: false,
        is_captain: false,
        is_wicketkeeper: false,
        did_not_bat: true,
      });
    }
    if (batRows.length) {
      await supabase('cricclubs_batting', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: batRows,
      });
      battingCount += batRows.length;
    }

    const bowlRows = inn.bowling.map((b) => ({
      match_row_id: matchRowId,
      team_id: CONFIG.team_id,
      innings_number: inn.innings_number,
      bowling_team: inn.bowling_team,
      cricclubs_name: b.raw_name,
      player_id: resolvePlayerId(b.raw_name, roster),
      overs: b.overs, maidens: b.maidens, dots: b.dots,
      runs: b.runs, wickets: b.wickets, economy: b.economy,
      is_captain: b.is_captain,
    }));
    if (bowlRows.length) {
      await supabase('cricclubs_bowling', {
        method: 'POST',
        prefer: 'resolution=merge-duplicates',
        body: bowlRows,
      });
      bowlingCount += bowlRows.length;
    }
  }

  return { battingCount, bowlingCount };
}

function extractLeagueName(leagueDivision) {
  if (!leagueDivision) return null;
  return leagueDivision.split(/\s*-\s*Division/i)[0]?.trim() ?? null;
}
function extractDivision(leagueDivision) {
  if (!leagueDivision) return null;
  const m = leagueDivision.match(/Division\s+(\w+)/i);
  return m ? `Division ${m[1]}` : null;
}

// Auto-complete schedule rows for past matches that have a matching cricclubs
// row. Mirrors the Node sync's behavior — never touches rows with a
// pre-existing result (admin-entered wins).
async function autoCompleteSchedule(matchRowId) {
  // Fetch the cricclubs row to learn date + opponent + winner
  const [cc] = await supabase('cricclubs_matches', {
    query: `?id=eq.${matchRowId}&select=match_date,team_a,team_b,winner_team,team_a_score,team_b_score,result_text`,
  });
  if (!cc?.match_date) return;
  const myTeam = CONFIG.team_name;
  const oppName = cc.team_a === myTeam ? cc.team_b : cc.team_a;
  const myScore = cc.team_a === myTeam ? cc.team_a_score : cc.team_b_score;
  const oppScore = cc.team_a === myTeam ? cc.team_b_score : cc.team_a_score;
  // Find unresolved schedule row by date + opponent (case-insensitive match)
  const opponent = oppName?.replace(/^MTCA\s+/i, '') || '';
  const candidates = await supabase('cricket_schedule_matches', {
    query: `?team_id=eq.${CONFIG.team_id}&match_date=eq.${cc.match_date}&result=is.null&deleted_at=is.null&select=id,opponent`,
  });
  const target = (candidates || []).find((c) =>
    c.opponent.toLowerCase().replace(/^mtca\s+/i, '').trim() ===
    opponent.toLowerCase().trim()
  );
  if (!target) return;
  const result = cc.winner_team === myTeam ? 'won'
    : cc.winner_team ? 'lost'
    : null;
  if (!result) return;
  await supabase('cricket_schedule_matches', {
    method: 'PATCH',
    query: `?id=eq.${target.id}`,
    body: {
      status: 'completed',
      result,
      team_score: stripOvers(myScore),
      team_overs: extractOvers(myScore),
      opponent_score: stripOvers(oppScore),
      opponent_overs: extractOvers(oppScore),
      result_summary: cc.result_text,
    },
  });
}
function stripOvers(s) { return s?.split(/\s*\(/)[0]?.trim() ?? null; }
function extractOvers(s) {
  const m = s?.match(/\(([\d.]+)/);
  return m ? m[1] : null;
}

// ── 5b. FIXTURE REFRESH ─────────────────────────────────────────────────────
// Ports supabase/functions/cricclubs-ingest/refresh.ts → refreshFixtures().
// For each cricclubs fixture, find the matching cricket_schedule_matches row
// (1) by cricclubs_fixture_id, (2) by opponent+nearest-date within ±14 days,
// (3) by date+venue. PATCH only the fields that differ; never touch rows
// with a non-null result (admin-entered wins are sacred).

const stripClubPrefix = (s) => (s ?? '').replace(/^MTCA\s+/i, '').trim();
const normalizeOpponent = (s) => (s ?? '').toLowerCase().replace(/^mtca\s+/i, '').trim();
function normalizeMatchType(raw) {
  if (!raw) return null;
  const lc = raw.toLowerCase();
  if (lc.includes('league')) return 'league';
  if (lc.includes('practice')) return 'practice';
  return null;
}
function combineUmpires(u1, u2) {
  const a = u1?.trim() || null;
  const b = u2?.trim() || null;
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  return a === b ? a : `${a}, ${b}`;
}
function daysBetween(a, b) {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(da - db) / 86400000;
}

function buildFixtureUpdate(current, fixture, myCricclubsName) {
  const upd = {};
  if (fixture.match_date && fixture.match_date !== current.match_date) upd.match_date = fixture.match_date;
  if (fixture.match_time_24h && fixture.match_time_24h !== current.match_time) upd.match_time = fixture.match_time_24h;
  if (fixture.venue && fixture.venue !== current.venue) upd.venue = fixture.venue;
  const mt = normalizeMatchType(fixture.match_type);
  if (mt && mt !== current.match_type) upd.match_type = mt;
  const isHome = fixture.team_home === myCricclubsName;
  if (current.is_home !== isHome) upd.is_home = isHome;
  const umpire = combineUmpires(fixture.umpire1, fixture.umpire2);
  if (umpire !== (current.umpire ?? null)) upd.umpire = umpire;
  const cricclubsOpponent = fixture.team_home === myCricclubsName ? fixture.team_away : fixture.team_home;
  const opponentStripped = stripClubPrefix(cricclubsOpponent);
  if (opponentStripped && opponentStripped !== current.opponent) upd.opponent = opponentStripped;
  if (current.cricclubs_fixture_id !== fixture.cricclubs_fixture_id) upd.cricclubs_fixture_id = fixture.cricclubs_fixture_id;
  return upd;
}

async function refreshFixtures(fixtures) {
  const myCricclubsName = `MTCA ${CONFIG.team_name.replace(/^MTCA\s+/i, '')}`;
  const scheduleRows = await supabase('cricket_schedule_matches', {
    query: `?team_id=eq.${CONFIG.team_id}&status=eq.upcoming&result=is.null&deleted_at=is.null&select=id,opponent,match_date,match_time,venue,match_type,is_home,umpire,cricclubs_fixture_id,status`,
  }) || [];

  const byFixtureId = new Map();
  for (const r of scheduleRows) {
    if (r.cricclubs_fixture_id != null) byFixtureId.set(r.cricclubs_fixture_id, r);
  }
  const claimed = new Set();
  let matched = 0;
  let updated = 0;
  const changes = [];

  for (const fx of fixtures) {
    if (!fx.match_date) continue;
    const opponent = fx.team_home === myCricclubsName ? fx.team_away : fx.team_home;
    if (!opponent) continue;

    let target = byFixtureId.get(fx.cricclubs_fixture_id) ?? null;

    if (!target) {
      // Opponent + nearest date within 14 days (legacy rows without fixture_id)
      const candidates = scheduleRows
        .filter((r) => !claimed.has(r.id))
        .filter((r) => r.cricclubs_fixture_id == null)
        .filter((r) => normalizeOpponent(r.opponent) === normalizeOpponent(opponent))
        .map((r) => ({ row: r, distance: daysBetween(r.match_date, fx.match_date) }))
        .filter((c) => c.distance <= 14)
        .sort((a, b) => a.distance - b.distance);
      if (candidates.length) target = candidates[0].row;
    }
    if (!target && fx.venue) {
      // Date+venue fallback (heals admin name typos)
      target = scheduleRows
        .filter((r) => !claimed.has(r.id))
        .filter((r) => r.cricclubs_fixture_id == null)
        .filter((r) => r.match_type === 'league')
        .find((r) => r.match_date === fx.match_date && r.venue === fx.venue) ?? null;
    }
    if (!target) continue;
    claimed.add(target.id);
    matched += 1;

    const upd = buildFixtureUpdate(target, fx, myCricclubsName);
    if (Object.keys(upd).length === 0) continue;

    try {
      await supabase('cricket_schedule_matches', {
        method: 'PATCH',
        query: `?id=eq.${target.id}&status=eq.upcoming&result=is.null`,
        body: upd,
      });
      updated += 1;
      changes.push({ opponent, date: fx.match_date, fields: Object.keys(upd).filter((k) => k !== 'cricclubs_fixture_id') });
    } catch (e) {
      // Log but don't abort the whole sync
      console.warn(`fixture update failed: ${e.message}`);
    }
  }

  return { fixturesOnCricclubs: fixtures.length, matched, updated, changes };
}

// ── 6. MAIN ──────────────────────────────────────────────────────────────────
const log = [];
const startMs = Date.now();

try {
  // 6.1a — refresh fixtures (upcoming matches: date/time/venue/umpire/opponent)
  log.push('📅 Fetching fixtures…');
  const fixturesHtml = await withRetry(() => fetchHtml(fixturesUrl(), 20));
  const fixtures = JSON.parse(await parseInWebView(fixturesHtml, FIXTURES_PARSER));
  const fixSummary = await refreshFixtures(fixtures);
  log.push(`📆 ${fixSummary.matched}/${fixSummary.fixturesOnCricclubs} matched · ${fixSummary.updated} updated`);
  for (const c of fixSummary.changes.slice(0, 5)) {
    log.push(`   ↳ ${c.opponent} (${c.date}): ${c.fields.join(', ')}`);
  }

  // 6.1b — fetch match list, parse completed scorecards
  log.push('🔄 Fetching match list…');
  const listHtml = await withRetry(() => fetchHtml(matchListUrl()));
  const matches = JSON.parse(await parseInWebView(listHtml, MATCH_LIST_PARSER));
  log.push(`📋 ${matches.length} matches found`);

  // 6.2 — load roster once (used across all scorecards)
  const roster = await loadRoster();
  log.push(`👥 Roster: ${roster.size} players`);

  // 6.3 — per-scorecard ingest with skip + retry
  const isoDate = (s) => {
    // cricclubs list date is "MM/DD/YYYY" — convert to ISO
    const m = (s || '').match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null;
  };

  let ingested = 0;
  let skipped = 0;
  let failed = 0;
  for (const m of matches) {
    m.match_date = isoDate(m.match_date_raw);
    m.winner_team = inferWinner(m);
    const tag = `${m.team_a} vs ${m.team_b}`;
    try {
      if (await shouldSkipScorecard(m.cricclubs_match_id, CONFIG.force_resync)) {
        skipped += 1;
        continue;
      }
      const html = await withRetry(() => fetchHtml(scorecardUrl(m.cricclubs_match_id)), 2, 2500);
      const parsed = JSON.parse(await parseInWebView(html, SCORECARD_PARSER));
      const counts = await upsertScorecard(m, parsed, html, roster);
      const matchRow = await supabase('cricclubs_matches', {
        query: `?cricclubs_match_id=eq.${m.cricclubs_match_id}&team_id=eq.${CONFIG.team_id}&select=id`,
      });
      if (matchRow?.[0]) await autoCompleteSchedule(matchRow[0].id);
      log.push(`✓ ${tag} (bat:${counts.battingCount} bowl:${counts.bowlingCount})`);
      ingested += 1;
    } catch (e) {
      failed += 1;
      log.push(`✗ ${tag}: ${String(e.message ?? e).slice(0, 60)}`);
    }
  }

  log.push(`✅ ${ingested} ingested · ${skipped} skipped · ${failed} failed`);
} catch (e) {
  log.push(`❌ FATAL: ${String(e.message ?? e).slice(0, 100)}`);
}

const elapsedSec = Math.round((Date.now() - startMs) / 1000);
log.push(`⏱  ${elapsedSec}s`);

// ── 7. NOTIFY ────────────────────────────────────────────────────────────────
const notif = new Notification();
notif.title = 'CricClubs Sync';
notif.body = log.join('\n');
notif.sound = 'default';
await notif.schedule();

Script.setShortcutOutput(log.join('\n'));  // shows in Shortcut "Get Result"
Script.complete();

// ── Helpers ──
function inferWinner(m) {
  // listMatches.do format: "MTCA X won by ..." in result_text.
  if (!m.result_text) return null;
  const w = m.result_text.match(/^(.+?)\s+won by\b/i);
  return w ? w[1].trim() : null;
}
