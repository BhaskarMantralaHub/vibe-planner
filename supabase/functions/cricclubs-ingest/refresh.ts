// Schedule refresh logic — ported from scripts/cricclubs-sync/sync.ts
// refreshFixtures(). Keep the two implementations behaviorally identical:
// matching strategy, diff logic, and write filters must match so the iOS
// path produces the same result as the Node script when both ran against
// the same HTML snapshot.
//
// V1 LIMITATION: this Edge Function does NOT auto-complete past matches
// the way the Node script's autoCompletePastMatches() does. Past matches
// stay status='upcoming' until V2 ships (scorecard ingest via iOS) or the
// next GitHub Action sync succeeds. See refresh.ts:nextMatch query — it
// hides past rows from the notification so they don't appear as "next."

import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';
import type { ParsedFixture } from './parser.ts';

const INTERNAL_TEAM_ID = '8284208d-fb02-44bf-bb8c-3c5411d35386'; // Sunrisers Manteca

export type RefreshSummary = {
  fixturesOnCricclubs: number;
  matched: number;
  updated: number;
  idsBackfilled: number;
  changes: Array<{
    fixtureId: number;
    opponent: string;
    matchDate: string | null;
    changed: string[];
    idBackfilled: boolean;
  }>;
  nextMatch: {
    opponent: string;
    match_date: string;
    match_time: string | null;
    venue: string | null;
    is_home: boolean | null;
  } | null;
  summary: string;       // human-readable, ready for an iOS notification body
};

const formatTime = (t: string | null): string => {
  if (!t) return '';
  const m = t.match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return t;
  const h = Number(m[1]);
  const min = m[2];
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min} ${ampm}`;
};

// "2026-08-23" → "Sat Aug 23". Weekday is load-bearing for club cricket
// (matches are weekend-only) — captain glancing at the notification wants
// to confirm the weekend day instantly.
const formatDateWithDay = (d: string): string => {
  const [, , mm, dd] = d.match(/^(\d{4})-(\d{2})-(\d{2})$/) ?? [];
  if (!mm || !dd) return d;
  const date = new Date(`${d}T12:00:00Z`); // noon UTC = same calendar day everywhere
  const day = date.toLocaleDateString('en-US', { weekday: 'short', timeZone: 'America/Los_Angeles' });
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${day} ${months[Number(mm) - 1]} ${Number(dd)}`;
};

// Strips noisy ground-type suffixes ("- BaseBall", "- Cricket Ground",
// "- Pavilion") so the venue stays under iOS's notification wrap budget.
const shortVenue = (v: string | null): string => {
  if (!v) return '';
  return v.replace(/\s*-\s*(BaseBall|Cricket(\s+Ground)?|Field|Pavilion|Sports\s+Complex).*$/i, '').trim();
};

// If the next match itself was the row that changed in this sync run, the
// notification names the specific change so the captain knows what's new.
// Returns the verb fragment (e.g. " · venue moved") or empty string.
const changeNoteForNext = (
  next: NonNullable<RefreshSummary['nextMatch']>,
  changes: RefreshSummary['changes'],
): string => {
  const hit = changes.find((c) => c.matchDate === next.match_date && c.opponent.toLowerCase().includes(next.opponent.toLowerCase()));
  if (!hit) return '';
  if (hit.changed.includes('venue')) return ' · venue moved';
  if (hit.changed.includes('match_date')) return ' · date moved';
  if (hit.changed.includes('match_time')) return ' · time changed';
  if (hit.changed.includes('opponent')) return ' · opponent updated';
  if (hit.changed.length > 0) return ' · details updated';
  return '';
};

// Two-line format (iOS lock screen renders both): match info on top so the
// captain sees the answer to "what's next?" first; sync metadata as a tail.
const buildSummaryText = (s: Omit<RefreshSummary, 'summary'>): string => {
  const tail = `✓ Synced ${s.matched}/${s.fixturesOnCricclubs}`;
  if (!s.nextMatch) return `No upcoming matches\n${tail}`;
  const n = s.nextMatch;
  const homeAway = n.is_home === true ? '(H)' : n.is_home === false ? '(A)' : '';
  const venuePart = n.venue ? ` · ${shortVenue(n.venue)}` : '';
  const timePart = n.match_time ? `, ${formatTime(n.match_time)}` : '';
  const note = changeNoteForNext(n, s.changes);
  const head = `Next: vs ${n.opponent} ${homeAway} · ${formatDateWithDay(n.match_date)}${timePart}${venuePart}${note}`;
  return `${head}\n${tail}`;
};

type FixtureUpdate = {
  match_date?: string;
  match_time?: string;
  venue?: string;
  match_type?: 'league' | 'practice';
  is_home?: boolean;
  umpire?: string | null;
  opponent?: string;
  cricclubs_fixture_id?: number;
};

type ScheduleRow = {
  id: string;
  opponent: string;
  match_date: string;
  match_time: string | null;
  venue: string | null;
  match_type: 'league' | 'practice';
  is_home: boolean | null;
  umpire: string | null;
  cricclubs_fixture_id: number | null;
  status: string;
};

const stripClubPrefix = (s: string): string => s.replace(/^MTCA\s+/i, '').trim();

const normalizeOpponent = (s: string): string =>
  s.toLowerCase().replace(/^mtca\s+/i, '').trim();

const normalizeMatchType = (raw: string | null): 'league' | 'practice' | null => {
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

const daysBetween = (a: string, b: string): number => {
  const da = new Date(`${a}T00:00:00Z`).getTime();
  const db = new Date(`${b}T00:00:00Z`).getTime();
  return Math.abs(da - db) / (1000 * 60 * 60 * 24);
};

const buildUpdate = (
  current: ScheduleRow,
  fixture: ParsedFixture,
  myCricclubsName: string,
): FixtureUpdate => {
  const upd: FixtureUpdate = {};

  if (fixture.match_date && fixture.match_date !== current.match_date) {
    upd.match_date = fixture.match_date;
  }
  if (fixture.match_time_24h && fixture.match_time_24h !== current.match_time) {
    upd.match_time = fixture.match_time_24h;
  }
  if (fixture.venue && fixture.venue !== current.venue) {
    upd.venue = fixture.venue;
  }

  const mt = normalizeMatchType(fixture.match_type);
  if (mt && mt !== current.match_type) upd.match_type = mt;

  const isHome = fixture.team_home === myCricclubsName;
  if (current.is_home !== isHome) upd.is_home = isHome;

  const umpire = combineUmpires(fixture.umpire1, fixture.umpire2);
  if (umpire !== (current.umpire ?? null)) upd.umpire = umpire;

  const cricclubsOpponent = fixture.team_home === myCricclubsName
    ? fixture.team_away
    : fixture.team_home;
  const opponentStripped = stripClubPrefix(cricclubsOpponent);
  if (opponentStripped && opponentStripped !== current.opponent) {
    upd.opponent = opponentStripped;
  }

  if (current.cricclubs_fixture_id !== fixture.cricclubs_fixture_id) {
    upd.cricclubs_fixture_id = fixture.cricclubs_fixture_id;
  }

  return upd;
};

export const refreshFixtures = async (
  supabase: SupabaseClient,
  fixtures: ParsedFixture[],
): Promise<RefreshSummary> => {
  const summary: RefreshSummary = {
    fixturesOnCricclubs: fixtures.length,
    matched: 0,
    updated: 0,
    idsBackfilled: 0,
    changes: [],
    nextMatch: null,
    summary: '',
  };
  if (fixtures.length === 0) {
    summary.summary = buildSummaryText(summary);
    return summary;
  }

  const { data: teamRow, error: teamErr } = await supabase
    .from('cricket_teams')
    .select('name')
    .eq('id', INTERNAL_TEAM_ID)
    .maybeSingle();
  if (teamErr || !teamRow) {
    throw new Error(`could not resolve team name: ${teamErr?.message ?? 'no row'}`);
  }
  const myCricclubsName = `MTCA ${teamRow.name}`;

  const { data: rows, error: rowsErr } = await supabase
    .from('cricket_schedule_matches')
    .select('id, opponent, match_date, match_time, venue, match_type, is_home, umpire, cricclubs_fixture_id, status')
    .eq('team_id', INTERNAL_TEAM_ID)
    .eq('status', 'upcoming')
    .is('result', null)
    .is('deleted_at', null);
  if (rowsErr) throw new Error(`schedule select failed: ${rowsErr.message}`);
  const scheduleRows = (rows ?? []) as ScheduleRow[];

  const byFixtureId = new Map<number, ScheduleRow>();
  for (const r of scheduleRows) {
    if (r.cricclubs_fixture_id != null) byFixtureId.set(r.cricclubs_fixture_id, r);
  }
  const claimed = new Set<string>();

  for (const fx of fixtures) {
    if (!fx.match_date) continue;
    const opponent = fx.team_home === myCricclubsName ? fx.team_away : fx.team_home;
    if (!opponent) continue;

    let target: ScheduleRow | null = byFixtureId.get(fx.cricclubs_fixture_id) ?? null;

    let isBackfill = false;
    if (!target) {
      const candidates = scheduleRows
        .filter((r) => !claimed.has(r.id))
        .filter((r) => r.cricclubs_fixture_id == null)
        .filter((r) => normalizeOpponent(r.opponent) === normalizeOpponent(opponent))
        .map((r) => ({ row: r, distance: daysBetween(r.match_date, fx.match_date!) }))
        .filter((c) => c.distance <= 14)
        .sort((a, b) => a.distance - b.distance);
      if (candidates.length > 0) {
        target = candidates[0]!.row;
        isBackfill = true;
      }
    }

    // Date+venue fallback heals admin name typos (e.g. "Manteca CC" vs
    // "DevAsuras" — same date, same ground, definitely the same fixture).
    if (!target && fx.venue) {
      const target3 = scheduleRows
        .filter((r) => !claimed.has(r.id))
        .filter((r) => r.cricclubs_fixture_id == null)
        .filter((r) => r.match_type === 'league')
        .find((r) => r.match_date === fx.match_date && r.venue === fx.venue);
      if (target3) {
        target = target3;
        isBackfill = true;
      }
    }

    if (!target) continue;
    claimed.add(target.id);
    summary.matched += 1;

    const upd = buildUpdate(target, fx, myCricclubsName);
    if (Object.keys(upd).length === 0) continue;

    const { error: updErr } = await supabase
      .from('cricket_schedule_matches')
      .update(upd)
      .eq('id', target.id)
      .eq('status', 'upcoming')
      .is('result', null);
    if (updErr) {
      console.warn(`fixture ${fx.cricclubs_fixture_id} update failed: ${updErr.message}`);
      continue;
    }

    summary.updated += 1;
    if (isBackfill && upd.cricclubs_fixture_id != null) summary.idsBackfilled += 1;

    summary.changes.push({
      fixtureId: fx.cricclubs_fixture_id,
      opponent,
      matchDate: fx.match_date,
      changed: Object.keys(upd).filter((k) => k !== 'cricclubs_fixture_id'),
      idBackfilled: isBackfill,
    });
  }

  // "Today" in the team's timezone, not UTC. Supabase edge runs in UTC,
  // and Mountain House plays Saturday/Sunday evenings — by 5 PM PT the UTC
  // date has already rolled to tomorrow, which would hide that same-day
  // match from the notification.
  const todayPT = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date()); // en-CA → YYYY-MM-DD

  const { data: nextRow, error: nextErr } = await supabase
    .from('cricket_schedule_matches')
    .select('opponent, match_date, match_time, venue, is_home')
    .eq('team_id', INTERNAL_TEAM_ID)
    .eq('status', 'upcoming')
    .is('result', null)
    .is('deleted_at', null)
    .gte('match_date', todayPT)
    .order('match_date', { ascending: true })
    .order('match_time', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (nextErr) {
    console.warn(`[cricclubs-ingest] next-match lookup failed: ${nextErr.message}`);
  } else if (nextRow) {
    summary.nextMatch = nextRow;
  }

  summary.summary = buildSummaryText(summary);
  return summary;
};
