// Full sync orchestrator for the cricclubs-ingest Edge Function.
//
// Replaces the old `scripts/cricclubs-sync/sync.ts` Node script. Triggered by
// the "Sync Now" button (with Supabase JWT auth), by pg_cron, by the iOS
// Shortcut, and by a thin GitHub Action — all four call into runFullSync().
//
// Steps:
//   1. Acquire singleton lock (cricclubs_sync_state); refuse if running
//   2. Fetch listMatches.do via Apify residential proxy
//   3. For each match: fetch scorecard, parse, upsert matches/html/batting/bowling
//   4. Fetch fixtures.do, refresh upcoming schedule rows
//   5. Auto-complete past schedule rows that now have a matching cricclubs row
//   6. Release lock + record summary
//
// All cricclubs.com fetches are proxied through Apify because the Edge
// Function runs on a datacenter IP that Cloudflare challenges. Apify exits
// from residential IPs which bypass the challenge.

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  parseMatchList,
  parseScorecard,
  parseFixtures,
  type ParsedListEntry,
  type ParsedScorecard,
} from './parser.ts';
import { fetchHtmlViaApify } from './apify.ts';
import { refreshFixtures } from './refresh.ts';

// ── Config ──────────────────────────────────────────────────────────────────
const TEAM_ID_INTERNAL = '8284208d-fb02-44bf-bb8c-3c5411d35386'; // Sunrisers Manteca
const BASE = 'https://cricclubs.com/MountainHouseTracyCricketAssociationMTCA';
const CRICCLUBS_TEAM_ID = 1014;
const CLUB_ID = 14653;
const LEAGUE_ID = 87;
const SEASON_FROM = Deno.env.get('CRICCLUBS_FROM_DATE') ?? '04/01/2026';
const SEASON_TO = Deno.env.get('CRICCLUBS_TO_DATE') ?? '08/31/2026';
const STALE_LOCK_MS = 5 * 60_000; // 5 minutes

const matchesUrl = (from: string, to: string): string =>
  `${BASE}/listMatches.do?league=${LEAGUE_ID}&teamId=${CRICCLUBS_TEAM_ID}` +
  `&clubId=${CLUB_ID}&fromDate=${encodeURIComponent(from)}` +
  `&toDate=${encodeURIComponent(to)}`;
export const scorecardUrl = (matchId: number): string =>
  `${BASE}/viewScorecard.do?matchId=${matchId}&clubId=${CLUB_ID}`;
const fixturesUrl = (): string =>
  `${BASE}/fixtures.do?league=${LEAGUE_ID}&teamId=${CRICCLUBS_TEAM_ID}&clubId=${CLUB_ID}`;

// ── Public API ──────────────────────────────────────────────────────────────
export type FullSyncResult = {
  ok: boolean;
  matchesIngested: number;
  battingRows: number;
  bowlingRows: number;
  fixturesMatched: number;
  fixturesUpdated: number;
  scheduleAutoCompleted: number;
  errors: string[];
  elapsedMs: number;
  summary: string;
};

// Acquire the singleton lock via the acquire_cricclubs_sync_lock RPC.
// Returns the lock token (UUID) on success, or null if another sync is
// currently holding the lock (and isn't yet stale). The token must be
// passed back into releaseLock so we verify the caller actually owns the
// lock — prevents a stale-overridden zombie sync from clobbering a fresh
// lock acquired via stale-recovery by some other caller.
//
// The RPC is SECURITY DEFINER and atomic; no client-side string-
// interpolation of timestamps into PostgREST filters (which was the
// previous brittleness).
export async function acquireLock(
  supabase: SupabaseClient,
  triggeredBy: string,
): Promise<string | null> {
  const { data, error } = await supabase.rpc('acquire_cricclubs_sync_lock', {
    p_triggered_by: triggeredBy,
  });
  if (error) throw new Error(`acquireLock: ${error.message}`);
  return (data as string | null) ?? null;
}

// Release the lock — but only if the supplied token matches the current
// lock_token. Returns true if release happened, false if another sync
// already took over via stale-recovery (we should NOT log loudly in that
// case; it just means our sync ran long enough to be reclaimed).
export async function releaseLock(
  supabase: SupabaseClient,
  token: string,
  summary: string,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('release_cricclubs_sync_lock', {
    p_token: token,
    p_summary: summary,
  });
  if (error) {
    console.warn(`releaseLock failed: ${error.message}`);
    return false;
  }
  return Boolean(data);
}

// Options for runFullSync.
// `forceMatchIds`: schedule-row UUIDs whose result/scores should be
// OVERWRITTEN with cricclubs data, even if they already have a result set.
// Used by the per-match "Re-sync from cricclubs" admin action. Empty array
// (or undefined) = normal behavior (skip rows with result already set).
export type FullSyncOptions = {
  forceMatchIds?: string[];
};

// Run the full sync. Caller is responsible for acquireLock/releaseLock.
export async function runFullSync(
  supabase: SupabaseClient,
  opts: FullSyncOptions = {},
): Promise<FullSyncResult> {
  const t0 = Date.now();
  const errors: string[] = [];
  let matchesIngested = 0;
  let battingRows = 0;
  let bowlingRows = 0;
  let fixturesMatched = 0;
  let fixturesUpdated = 0;
  let scheduleAutoCompleted = 0;

  try {
    const roster = await loadRoster(supabase);

    // 1. Match list
    const listHtml = await fetchHtmlViaApify(matchesUrl(SEASON_FROM, SEASON_TO));
    const matches = parseMatchList(listHtml);

    // 2. Per-scorecard ingest with per-match try/catch (one bad match doesn't
    //    abort the whole sync — surfaces in errors[])
    for (const entry of matches) {
      try {
        const url = scorecardUrl(entry.cricclubs_match_id);
        const html = await fetchHtmlViaApify(url);
        const parsed = parseScorecard(html, entry.cricclubs_match_id);
        const matchRowId = await upsertMatch(supabase, entry, parsed, html, url);
        const counts = await upsertInnings(supabase, parsed, matchRowId, roster);
        matchesIngested += 1;
        battingRows += counts.batting;
        bowlingRows += counts.bowling;
      } catch (e) {
        errors.push(
          `match ${entry.cricclubs_match_id}: ${scrubError((e as Error).message).slice(0, 100)}`,
        );
      }
    }

    // 3. Fixtures refresh
    try {
      const fixturesHtml = await fetchHtmlViaApify(fixturesUrl());
      const fixtures = parseFixtures(fixturesHtml);
      const fStats = await refreshFixtures(supabase, fixtures);
      fixturesMatched = fStats.matched;
      fixturesUpdated = fStats.updated;
    } catch (e) {
      errors.push(`fixtures: ${scrubError((e as Error).message).slice(0, 100)}`);
    }

    // 4. Auto-complete schedule (with optional force-overwrite list)
    try {
      scheduleAutoCompleted = await autoCompleteScheduleMatches(
        supabase,
        opts.forceMatchIds ?? [],
      );
    } catch (e) {
      errors.push(`auto-complete: ${scrubError((e as Error).message).slice(0, 100)}`);
    }

    const summary =
      errors.length === 0
        ? `✓ ${matchesIngested} matches · ${fixturesUpdated} fixtures · ${scheduleAutoCompleted} completed`
        : `⚠ ${matchesIngested} ingested · ${errors.length} errors`;

    return {
      ok: errors.length === 0,
      matchesIngested, battingRows, bowlingRows,
      fixturesMatched, fixturesUpdated, scheduleAutoCompleted,
      errors,
      elapsedMs: Date.now() - t0,
      summary,
    };
  } catch (e) {
    const msg = scrubError((e as Error).message ?? 'unknown');
    errors.push(msg);
    return {
      ok: false,
      matchesIngested, battingRows, bowlingRows,
      fixturesMatched, fixturesUpdated, scheduleAutoCompleted,
      errors,
      elapsedMs: Date.now() - t0,
      summary: `❌ ${msg.slice(0, 100)}`,
    };
  }
}

// Strip sensitive query params/headers from error strings before they end
// up in cricclubs_sync_state.last_summary or the response body. Apify
// occasionally echoes back the request URL on 5xx, which contains
// ?token=apify_api_... — that token is readable by anyone with SELECT on
// the sync_state row.
function scrubError(s: string | undefined): string {
  if (!s) return 'unknown';
  return s
    .replace(/([?&])(token|apify_token|api_key|secret)=[^&\s"'`]+/gi, '$1$2=REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED');
}

// ── Roster ──────────────────────────────────────────────────────────────────
export async function loadRoster(supabase: SupabaseClient): Promise<Map<string, string>> {
  // cricket_players uses `is_active` (boolean) for soft-delete, not the
  // `deleted_at` pattern other cricket_* tables use. Match the Node sync's
  // filter exactly (scripts/cricclubs-sync/supabase.ts loadRoster).
  const { data, error } = await supabase
    .from('cricket_players')
    .select('id, name')
    .eq('team_id', TEAM_ID_INTERNAL)
    .eq('is_active', true);
  if (error) throw new Error(`loadRoster: ${error.message}`);
  const map = new Map<string, string>();
  for (const r of (data ?? []) as Array<{ id: string; name: string }>) {
    map.set(r.name.toLowerCase().trim(), r.id);
  }
  return map;
}
function resolvePlayerId(rawName: string, roster: Map<string, string>): string | null {
  return roster.get(rawName.toLowerCase().trim()) ?? null;
}

// ── Upserts (ported from scripts/cricclubs-sync/sync.ts) ────────────────────
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

export async function upsertMatch(
  supabase: SupabaseClient,
  listEntry: ParsedListEntry,
  scorecard: ParsedScorecard,
  rawHtml: string,
  scorecardUrlValue: string,
): Promise<string> {
  const teamA = scorecard.team_a ?? listEntry.team_a ?? '';
  const teamB = scorecard.team_b ?? listEntry.team_b ?? '';
  const { data, error } = await supabase
    .from('cricclubs_matches')
    .upsert(
      {
        team_id: TEAM_ID_INTERNAL,
        cricclubs_match_id: listEntry.cricclubs_match_id,
        cricclubs_league_id: LEAGUE_ID,
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
        toss_winner: scorecard.toss_winner,
        toss_decision: scorecard.toss_decision,
        scorecard_url: scorecardUrlValue,
        parsed_at: new Date().toISOString(),
      },
      { onConflict: 'team_id,cricclubs_match_id' },
    )
    .select('id')
    .single();
  if (error || !data) throw new Error(`upsertMatch: ${error?.message ?? 'no data'}`);

  const { error: htmlErr } = await supabase
    .from('cricclubs_match_html')
    .upsert({ match_row_id: data.id, raw_html: rawHtml }, { onConflict: 'match_row_id' });
  if (htmlErr) throw new Error(`upsert match_html: ${htmlErr.message}`);
  return data.id as string;
}

export async function upsertInnings(
  supabase: SupabaseClient,
  scorecard: ParsedScorecard,
  matchRowId: string,
  roster: Map<string, string>,
): Promise<{ batting: number; bowling: number }> {
  let battingCount = 0;
  let bowlingCount = 0;
  // Explicit row shape so DNB rows (with null position / strike_rate /
  // dismissal) can be pushed into the same array without TS widening
  // complaints.
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
  for (const inn of scorecard.innings) {
    const battingRows: BattingUpsertRow[] = inn.batting.map((b, idx) => ({
      match_row_id: matchRowId,
      team_id: TEAM_ID_INTERNAL,
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
      battingRows.push({
        match_row_id: matchRowId,
        team_id: TEAM_ID_INTERNAL,
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
    if (battingRows.length) {
      const { error } = await supabase
        .from('cricclubs_batting')
        .upsert(battingRows, { onConflict: 'match_row_id,innings_number,batting_team,cricclubs_name' });
      if (error) throw new Error(`upsert batting: ${error.message}`);
      battingCount += battingRows.length;
    }
    const bowlingRows = inn.bowling.map((b) => ({
      match_row_id: matchRowId,
      team_id: TEAM_ID_INTERNAL,
      innings_number: inn.innings_number,
      bowling_team: inn.bowling_team,
      cricclubs_name: b.raw_name,
      player_id: resolvePlayerId(b.raw_name, roster),
      overs: b.overs, maidens: b.maidens, dots: b.dots,
      runs: b.runs, wickets: b.wickets, economy: b.economy,
      is_captain: b.is_captain,
    }));
    if (bowlingRows.length) {
      const { error } = await supabase
        .from('cricclubs_bowling')
        .upsert(bowlingRows, { onConflict: 'match_row_id,innings_number,bowling_team,cricclubs_name' });
      if (error) throw new Error(`upsert bowling: ${error.message}`);
      bowlingCount += bowlingRows.length;
    }
  }
  return { batting: battingCount, bowling: bowlingCount };
}

// ── Auto-complete schedule rows ─────────────────────────────────────────────
const normalizeOpponent = (s: string): string =>
  s.toLowerCase().replace(/^mtca\s+/i, '').trim();

function parseTeamScore(raw: string | null | undefined): { score: string; overs: string } {
  if (!raw) return { score: '', overs: '' };
  // Format: "76/5 (10.4/20.0)" → score=76/5, overs=10.4
  const m = raw.match(/^([\d/]+)\s*\(([\d.]+)/);
  return m ? { score: m[1], overs: m[2] } : { score: raw, overs: '' };
}

export async function autoCompleteScheduleMatches(
  supabase: SupabaseClient,
  forceMatchIds: string[] = [],
): Promise<number> {
  const { data: teamRow } = await supabase
    .from('cricket_teams')
    .select('name')
    .eq('id', TEAM_ID_INTERNAL)
    .maybeSingle();
  if (!teamRow) return 0;
  const myCricclubsName = `MTCA ${(teamRow as { name: string }).name}`;

  // "today" in team timezone — Mountain House plays Sat/Sun evenings; using
  // UTC would hide a same-day match from auto-complete after 5pm PT.
  const todayPT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  // Rows that match the normal auto-complete criteria (status=upcoming AND
  // result IS NULL AND today-or-past date). `lte` (not `lt`) so a match played
  // and synced the SAME day completes immediately instead of waiting for the
  // next-day run. Same-day live games are still protected: a candidate only
  // completes if cricclubs has a posted scorecard for it (cmIndex hit), and a
  // same-day scorecard with no definitive result is skipped below.
  const { data: normalRows } = await supabase
    .from('cricket_schedule_matches')
    .select('id, opponent, match_date')
    .eq('team_id', TEAM_ID_INTERNAL)
    .eq('status', 'upcoming')
    .lte('match_date', todayPT)
    .is('result', null);

  // Force-overwrite rows: ignore the result-IS-NULL guard. Admin explicitly
  // requested cricclubs to overwrite their manual entry.
  let forceRows: Array<{ id: string; opponent: string; match_date: string }> = [];
  if (forceMatchIds.length > 0) {
    const { data: rows } = await supabase
      .from('cricket_schedule_matches')
      .select('id, opponent, match_date')
      .eq('team_id', TEAM_ID_INTERNAL)
      .in('id', forceMatchIds);
    forceRows = (rows ?? []) as Array<{ id: string; opponent: string; match_date: string }>;
  }

  const candidates = [
    ...((normalRows ?? []) as Array<{ id: string; opponent: string; match_date: string }>),
    ...forceRows,
  ];
  if (!candidates.length) return 0;

  const { data: cms } = await supabase
    .from('cricclubs_matches')
    .select('match_date, team_a, team_b, team_a_score, team_b_score, winner_team, result_text')
    .eq('team_id', TEAM_ID_INTERNAL);
  if (!cms) return 0;

  type CMRow = {
    match_date: string | null; team_a: string; team_b: string;
    team_a_score: string | null; team_b_score: string | null;
    winner_team: string | null; result_text: string | null;
  };
  const cmIndex = new Map<string, CMRow>();
  for (const cm of cms as CMRow[]) {
    if (!cm.match_date) continue;
    const opponent = cm.team_a === myCricclubsName ? cm.team_b : cm.team_a;
    cmIndex.set(`${cm.match_date}|${normalizeOpponent(opponent)}`, cm);
  }

  const forceSet = new Set(forceMatchIds);
  let updated = 0;
  // Dedup: a row could appear in both normalRows and forceRows. Use a Set to
  // process each id only once.
  const seen = new Set<string>();
  for (const sched of candidates) {
    if (seen.has(sched.id)) continue;
    seen.add(sched.id);
    const cm = cmIndex.get(`${sched.match_date}|${normalizeOpponent(sched.opponent)}`);
    if (!cm) continue;
    const isForce = forceSet.has(sched.id);
    // Same-day guard: a match dated today is only finished if cricclubs has a
    // definitive result. A live (in-progress) scorecard has no winner_team and
    // no result_text yet — leave the row for a later run rather than recording
    // a premature draw. Force-overwrite rows bypass this (admin asked for it).
    if (!isForce && sched.match_date === todayPT && !cm.winner_team && !cm.result_text) {
      continue;
    }
    const usAreA = cm.team_a === myCricclubsName;
    const ours = parseTeamScore(usAreA ? cm.team_a_score : cm.team_b_score);
    const opp = parseTeamScore(usAreA ? cm.team_b_score : cm.team_a_score);
    let result: 'won' | 'lost' | 'draw' = 'draw';
    if (cm.winner_team) {
      result = cm.winner_team.toLowerCase().startsWith(myCricclubsName.toLowerCase())
        ? 'won' : 'lost';
    }
    // Build the UPDATE. For force-overwrite rows we drop the result-IS-NULL
    // guard so cricclubs data replaces the manual entry. For normal rows we
    // keep the guard as belt-and-suspenders. (`isForce` computed above.)
    let q = supabase
      .from('cricket_schedule_matches')
      .update({
        status: 'completed',
        result,
        team_score: ours.score || null,
        team_overs: ours.overs || null,
        opponent_score: opp.score || null,
        opponent_overs: opp.overs || null,
        result_summary: cm.result_text ?? null,
      })
      .eq('id', sched.id);
    if (!isForce) q = q.is('result', null);
    const { error } = await q;
    if (!error) updated += 1;
  }
  return updated;
}
