// Main entry point for the cricclubs scraper.
//
//   $ SUPABASE_SERVICE_ROLE_KEY=xxx \
//     SUPABASE_URL=https://your-project.supabase.co \
//     CRICCLUBS_TEAM_ID_INTERNAL=8284208d-... \
//     npm run sync
//
// Or: tsx sync.ts
//
// Idempotent: re-running upserts on natural keys, never duplicates rows.
import { chromium, type Browser, type Page } from 'playwright';
import {
  parseMatchList,
  parseScorecard,
  type ParsedListEntry,
  type ParsedScorecard,
} from './parser.js';
import {
  makeServiceRoleClient,
  loadRoster,
  resolvePlayerId,
} from './supabase.js';

// ── Config ──────────────────────────────────────────────────────────────

const BASE = 'https://cricclubs.com/MountainHouseTracyCricketAssociationMTCA';
const CRICCLUBS_TEAM_ID = 1014; // MTCA Sunrisers Manteca
const CLUB_ID = 14653;
const LEAGUE_ID = 87;
const SEASON_FROM = process.env.CRICCLUBS_FROM_DATE ?? '04/01/2026';
const SEASON_TO = process.env.CRICCLUBS_TO_DATE ?? '08/31/2026';
const INTERNAL_TEAM_ID =
  process.env.CRICCLUBS_TEAM_ID_INTERNAL ??
  '8284208d-fb02-44bf-bb8c-3c5411d35386'; // Sunrisers Manteca

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const matchesUrl = (from: string, to: string): string =>
  `${BASE}/listMatches.do?league=${LEAGUE_ID}&teamId=${CRICCLUBS_TEAM_ID}` +
  `&clubId=${CLUB_ID}&fromDate=${encodeURIComponent(from)}` +
  `&toDate=${encodeURIComponent(to)}`;

const scorecardUrl = (matchId: number): string =>
  `${BASE}/viewScorecard.do?matchId=${matchId}&clubId=${CLUB_ID}`;

// ── Fetch ───────────────────────────────────────────────────────────────

const fetchHtml = async (page: Page, url: string): Promise<string> => {
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  // Wait for the title to settle so we know we got the real page (not the
  // Cloudflare interstitial). For matches list it contains "Match Results".
  // For scorecards it contains " vs ". Either tells us we're past the wall.
  await page.waitForFunction(
    () => /Match Results| vs /.test(document.title),
    { timeout: 30_000 },
  );
  return page.content();
};

// ── Main ────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const main = async (): Promise<void> => {
  const t0 = Date.now();
  const supabase = makeServiceRoleClient();
  console.log(`[cricclubs-sync] Starting at ${new Date().toISOString()}`);

  // Load our team's roster once for cricclubs_name → player_id resolution
  const { byName } = await loadRoster(supabase, INTERNAL_TEAM_ID);
  console.log(`[cricclubs-sync] Loaded ${byName.size} active roster entries`);

  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
    const ctx = await browser.newContext({ userAgent: USER_AGENT });
    const page = await ctx.newPage();

    // 1. Fetch + parse match list
    const listHtml = await fetchHtml(page, matchesUrl(SEASON_FROM, SEASON_TO));
    const listEntries = parseMatchList(listHtml);
    console.log(`[cricclubs-sync] Match list: ${listEntries.length} matches`);

    let matchesUpserted = 0;
    let battingUpserted = 0;
    let bowlingUpserted = 0;

    for (const entry of listEntries) {
      const url = scorecardUrl(entry.cricclubs_match_id);
      const scorecardHtml = await fetchHtml(page, url);
      const parsed = parseScorecard(scorecardHtml, entry.cricclubs_match_id);
      const matchRowId = await upsertMatch(supabase, entry, parsed, scorecardHtml, url);
      const counts = await upsertInnings(supabase, parsed, matchRowId, byName);
      matchesUpserted += 1;
      battingUpserted += counts.batting;
      bowlingUpserted += counts.bowling;
      console.log(
        `[cricclubs-sync]   match ${entry.cricclubs_match_id}: ` +
          `${counts.batting} batting, ${counts.bowling} bowling rows`,
      );
      await sleep(1500); // polite jitter between scorecards
    }

    console.log(
      `[cricclubs-sync] Done in ${Date.now() - t0} ms — ` +
        `${matchesUpserted} matches, ${battingUpserted} batting, ${bowlingUpserted} bowling`,
    );
  } finally {
    await browser?.close();
  }
};

// ── Upserts ─────────────────────────────────────────────────────────────

const upsertMatch = async (
  supabase: ReturnType<typeof makeServiceRoleClient>,
  listEntry: ParsedListEntry,
  scorecard: ParsedScorecard,
  rawHtml: string,
  scorecardUrlValue: string,
): Promise<string> => {
  // Prefer scorecard's team names if present; fall back to list entry.
  const teamA = scorecard.team_a ?? listEntry.team_a ?? '';
  const teamB = scorecard.team_b ?? listEntry.team_b ?? '';

  const { data, error } = await supabase
    .from('cricclubs_matches')
    .upsert(
      {
        team_id: INTERNAL_TEAM_ID,
        cricclubs_match_id: listEntry.cricclubs_match_id,
        match_date: listEntry.match_date,
        match_format: listEntry.match_format,
        league_name: extractLeagueName(listEntry.league_division),
        division: extractDivision(listEntry.league_division),
        team_a: teamA,
        team_b: teamB,
        team_a_score: listEntry.team_a_score || null,
        team_b_score: listEntry.team_b_score || null,
        result_text: listEntry.result_text || null,
        winner_team: listEntry.winner_team,
        scorecard_url: scorecardUrlValue,
        parsed_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,cricclubs_match_id' },
    )
    .select('id')
    .single();

  if (error || !data) {
    throw new Error(
      `upsertMatch failed for matchId=${listEntry.cricclubs_match_id}: ${error?.message ?? 'no data returned'}`,
    );
  }
  const matchRowId = data.id;

  // Sibling raw_html upsert
  const { error: htmlErr } = await supabase
    .from('cricclubs_match_html')
    .upsert(
      { match_row_id: matchRowId, raw_html: rawHtml },
      { onConflict: 'match_row_id' },
    );
  if (htmlErr) {
    throw new Error(
      `upsert match_html failed for matchId=${listEntry.cricclubs_match_id}: ${htmlErr.message}`,
    );
  }

  return matchRowId;
};

const upsertInnings = async (
  supabase: ReturnType<typeof makeServiceRoleClient>,
  scorecard: ParsedScorecard,
  matchRowId: string,
  rosterByName: Map<string, string>,
): Promise<{ batting: number; bowling: number }> => {
  let battingCount = 0;
  let bowlingCount = 0;

  for (const inn of scorecard.innings) {
    // Batting rows
    type BattingUpsertRow = {
      match_row_id: string;
      team_id: string;
      innings_number: 1 | 2;
      batting_team: string;
      cricclubs_name: string;
      player_id: string | null;
      batting_position: number | null;
      runs: number;
      balls: number;
      fours: number;
      sixes: number;
      strike_rate: number | null;
      dismissal: string | null;
      not_out: boolean;
      is_captain: boolean;
      is_wicketkeeper: boolean;
      did_not_bat: boolean;
    };

    const battingRows: BattingUpsertRow[] = inn.batting.map((b, idx) => ({
      match_row_id: matchRowId,
      team_id: INTERNAL_TEAM_ID,
      innings_number: inn.innings_number,
      batting_team: inn.batting_team,
      cricclubs_name: b.raw_name,
      player_id: resolvePlayerId(b.raw_name, rosterByName),
      batting_position: idx + 1,
      runs: b.runs,
      balls: b.balls,
      fours: b.fours,
      sixes: b.sixes,
      strike_rate: b.strike_rate,
      dismissal: b.dismissal || null,
      not_out: b.not_out,
      is_captain: b.is_captain,
      is_wicketkeeper: b.is_wicketkeeper,
      did_not_bat: false,
    }));

    // Did-not-bat as separate batting rows (zeros, did_not_bat=true)
    for (const dnbName of inn.did_not_bat) {
      battingRows.push({
        match_row_id: matchRowId,
        team_id: INTERNAL_TEAM_ID,
        innings_number: inn.innings_number,
        batting_team: inn.batting_team,
        cricclubs_name: dnbName,
        player_id: resolvePlayerId(dnbName, rosterByName),
        batting_position: null,
        runs: 0,
        balls: 0,
        fours: 0,
        sixes: 0,
        strike_rate: null,
        dismissal: null,
        not_out: false,
        is_captain: false,
        is_wicketkeeper: false,
        did_not_bat: true,
      });
    }

    if (battingRows.length > 0) {
      const { error } = await supabase
        .from('cricclubs_batting')
        .upsert(battingRows, {
          onConflict: 'match_row_id,innings_number,batting_team,cricclubs_name',
        });
      if (error) {
        throw new Error(`upsert batting failed: ${error.message}`);
      }
      battingCount += battingRows.length;
    }

    // Bowling rows
    const bowlingRows = inn.bowling.map((b) => ({
      match_row_id: matchRowId,
      team_id: INTERNAL_TEAM_ID,
      innings_number: inn.innings_number,
      bowling_team: inn.bowling_team,
      cricclubs_name: b.raw_name,
      player_id: resolvePlayerId(b.raw_name, rosterByName),
      overs: b.overs,
      maidens: b.maidens,
      dots: b.dots,
      runs: b.runs,
      wickets: b.wickets,
      economy: b.economy,
      is_captain: b.is_captain,
    }));

    if (bowlingRows.length > 0) {
      const { error } = await supabase
        .from('cricclubs_bowling')
        .upsert(bowlingRows, {
          onConflict: 'match_row_id,innings_number,bowling_team,cricclubs_name',
        });
      if (error) {
        throw new Error(`upsert bowling failed: ${error.message}`);
      }
      bowlingCount += bowlingRows.length;
    }
  }

  return { batting: battingCount, bowling: bowlingCount };
};

// ── Helpers ─────────────────────────────────────────────────────────────

// Splits "2026 MTCA Spring League - Division D" into league + division
const extractLeagueName = (combined: string | null): string | null => {
  if (!combined) return null;
  const dashIdx = combined.lastIndexOf(' - ');
  return dashIdx >= 0 ? combined.slice(0, dashIdx).trim() : combined;
};

const extractDivision = (combined: string | null): string | null => {
  if (!combined) return null;
  const dashIdx = combined.lastIndexOf(' - ');
  return dashIdx >= 0 ? combined.slice(dashIdx + 3).trim() : null;
};

main().catch((err) => {
  console.error('[cricclubs-sync] FAILED:', err);
  process.exit(1);
});
