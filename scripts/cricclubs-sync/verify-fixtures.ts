// Read-only spot-check for refreshFixtures. Fetches cricclubs fixtures
// live, reads cricket_schedule_matches via service role, prints a
// side-by-side comparison.  Never writes.
//
// Run after `npm run sync` to confirm the backfill landed:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… npx tsx verify-fixtures.ts
//
// Output:
//   PER-FIXTURE table — each cricclubs upcoming fixture with its matched
//   schedule row, flagging any field that differs.
//   UNLINKED table  — schedule rows still missing cricclubs_fixture_id
//   (expected for practice matches; investigate league matches).
import { chromium } from 'playwright';
import { parseFixtures, type ParsedFixture } from './parser.js';
import { makeServiceRoleClient } from './supabase.js';

const BASE = 'https://cricclubs.com/MountainHouseTracyCricketAssociationMTCA';
const CRICCLUBS_TEAM_ID = 1014;
const CLUB_ID = 14653;
const LEAGUE_ID = 87;
const INTERNAL_TEAM_ID =
  process.env.CRICCLUBS_TEAM_ID_INTERNAL ??
  '8284208d-fb02-44bf-bb8c-3c5411d35386';

const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const fixturesUrl = `${BASE}/fixtures.do?league=${LEAGUE_ID}&teamId=${CRICCLUBS_TEAM_ID}&clubId=${CLUB_ID}`;

type ScheduleRow = {
  id: string;
  opponent: string;
  match_date: string;
  match_time: string | null;
  venue: string | null;
  match_type: string;
  is_home: boolean | null;
  umpire: string | null;
  cricclubs_fixture_id: number | null;
  status: string;
};

const pad = (s: string, n: number): string => (s.length >= n ? s.slice(0, n) : s + ' '.repeat(n - s.length));

const fetchLiveFixtures = async (): Promise<ParsedFixture[]> => {
  const browser = await chromium.launch({ headless: true });
  try {
    const ctx = await browser.newContext({ userAgent: USER_AGENT });
    const page = await ctx.newPage();
    await page.goto(fixturesUrl, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(
      () => /Schedule|Fixtures/.test(document.title),
      { timeout: 30_000 },
    );
    return parseFixtures(await page.content());
  } finally {
    await browser.close();
  }
};

const main = async () => {
  const supabase = makeServiceRoleClient();

  console.log(`Fetching cricclubs fixtures…`);
  const fixtures = await fetchLiveFixtures();
  console.log(`  cricclubs returned ${fixtures.length} upcoming fixtures\n`);

  const { data: teamRow } = await supabase
    .from('cricket_teams')
    .select('name')
    .eq('id', INTERNAL_TEAM_ID)
    .maybeSingle();
  const myCricclubsName = `MTCA ${teamRow?.name ?? '???'}`;

  const { data, error } = await supabase
    .from('cricket_schedule_matches')
    .select('id, opponent, match_date, match_time, venue, match_type, is_home, umpire, cricclubs_fixture_id, status')
    .eq('team_id', INTERNAL_TEAM_ID)
    .eq('status', 'upcoming')
    .is('deleted_at', null)
    .order('match_date');
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as ScheduleRow[];
  console.log(`Supabase has ${rows.length} upcoming schedule rows for this team`);
  const linked = rows.filter((r) => r.cricclubs_fixture_id != null).length;
  console.log(`  linked to cricclubs: ${linked} / ${rows.length}\n`);

  const byFixtureId = new Map<number, ScheduleRow>();
  for (const r of rows) {
    if (r.cricclubs_fixture_id != null) byFixtureId.set(r.cricclubs_fixture_id, r);
  }

  // ── Per-fixture comparison ───────────────────────────────────────────
  console.log('── PER-FIXTURE COMPARISON ──────────────────────────────');
  console.log(
    pad('fixture_id', 11) + pad('date', 12) + pad('time', 7) +
    pad('opponent', 28) + pad('venue', 28) + 'drift',
  );
  console.log('─'.repeat(100));

  let driftCount = 0;
  let unmatchedFixtures = 0;
  for (const fx of fixtures) {
    const sched = byFixtureId.get(fx.cricclubs_fixture_id);
    const opponent = fx.team_home === myCricclubsName ? fx.team_away : fx.team_home;
    const drift: string[] = [];

    if (!sched) {
      unmatchedFixtures += 1;
      console.log(
        pad(String(fx.cricclubs_fixture_id), 11) +
        pad(fx.match_date ?? '?', 12) +
        pad(fx.match_time_24h ?? '?', 7) +
        pad(opponent, 28) +
        pad(fx.venue ?? '?', 28) +
        '⚠ no schedule row',
      );
      continue;
    }

    const isHome = fx.team_home === myCricclubsName;
    if (fx.match_date && fx.match_date !== sched.match_date) drift.push(`date(${sched.match_date}→${fx.match_date})`);
    if (fx.match_time_24h && fx.match_time_24h !== sched.match_time) drift.push(`time(${sched.match_time}→${fx.match_time_24h})`);
    if (fx.venue && fx.venue !== sched.venue) drift.push(`venue(${sched.venue}→${fx.venue})`);
    if (sched.is_home !== isHome) drift.push(`home(${sched.is_home}→${isHome})`);

    if (drift.length > 0) driftCount += 1;
    console.log(
      pad(String(fx.cricclubs_fixture_id), 11) +
      pad(sched.match_date, 12) +
      pad(sched.match_time ?? '?', 7) +
      pad(sched.opponent, 28) +
      pad(sched.venue ?? '?', 28) +
      (drift.length === 0 ? '✓ match' : `⚠ ${drift.join(', ')}`),
    );
  }

  // ── Unlinked schedule rows ───────────────────────────────────────────
  const unlinked = rows.filter((r) => r.cricclubs_fixture_id == null);
  if (unlinked.length > 0) {
    console.log('\n── UNLINKED SCHEDULE ROWS ──────────────────────────────');
    console.log('(practice matches expected here; league matches need attention)');
    console.log(pad('date', 12) + pad('time', 7) + pad('type', 10) + pad('opponent', 30) + 'venue');
    console.log('─'.repeat(100));
    for (const r of unlinked) {
      console.log(
        pad(r.match_date, 12) +
        pad(r.match_time ?? '?', 7) +
        pad(r.match_type, 10) +
        pad(r.opponent, 30) +
        (r.venue ?? '?'),
      );
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────
  console.log('\n── SUMMARY ─────────────────────────────────────────────');
  console.log(`  cricclubs upcoming fixtures:    ${fixtures.length}`);
  console.log(`  matched to schedule row:        ${fixtures.length - unmatchedFixtures}`);
  console.log(`  schedule rows linked:           ${linked} / ${rows.length}`);
  console.log(`  fixtures with drift from cricclubs: ${driftCount}`);
  console.log(`  cricclubs fixtures w/ no local row: ${unmatchedFixtures}`);
  console.log(`  local rows w/ no cricclubs link:    ${unlinked.length}\n`);

  if (driftCount === 0 && unmatchedFixtures === 0 && unlinked.filter((r) => r.match_type === 'league').length === 0) {
    console.log('✓ All league fixtures linked and in sync with cricclubs.');
  } else {
    console.log('⚠ Investigate flagged rows above.');
  }
};

main().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
