// Edge Function entry point — accepts cricclubs HTML scraped from a real
// residential browser (iOS Shortcut on the team admin's phone), parses it,
// and writes to Supabase. Caller's IP doesn't matter — Supabase itself does
// the DB writes — so this whole flow sidesteps the Cloudflare bot challenge
// that breaks the headless-browser path on GitHub Actions runners.
//
// V1: type=fixtures only. V2 will add type=list and type=scorecard.
//
// Auth: requires X-Sync-Secret header matching the CRICCLUBS_SYNC_SECRET
// env var. JWT verification disabled in config.toml for this function — the
// shared secret is the access control.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { parseFixtures } from './parser.ts';
import { refreshFixtures } from './refresh.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const SYNC_SECRET = Deno.env.get('CRICCLUBS_SYNC_SECRET');

const json = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });

Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405);
  }

  // Shared-secret check. Done before anything else so unauthenticated
  // callers don't even reveal the function exists via timing.
  const provided = req.headers.get('x-sync-secret') ?? '';
  if (!SYNC_SECRET || provided !== SYNC_SECRET) {
    return json({ error: 'unauthorized' }, 401);
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');
  if (type !== 'fixtures') {
    return json({ error: `unsupported type: ${type ?? '(none)'} (V1 supports 'fixtures' only)` }, 400);
  }

  const html = await req.text();
  if (!html || html.length < 100) {
    return json({ error: 'request body is empty or too small to be cricclubs HTML' }, 400);
  }
  // Sanity check — Cloudflare interstitials are tiny and contain none of
  // these markers. Reject so we don't silently wipe schedule rows from a
  // bad upload.
  if (!/schedule-table1|deleteRow|MTCA/i.test(html)) {
    return json({
      error: 'html does not look like a cricclubs fixtures page',
      hint: 'expected markers (schedule-table1, deleteRow, MTCA) not found',
    }, 400);
  }

  let fixtures;
  try {
    fixtures = parseFixtures(html);
  } catch (e) {
    return json({ error: `parse failed: ${(e as Error).message}` }, 500);
  }

  if (fixtures.length === 0) {
    return json({
      ok: true,
      note: 'parsed successfully but found 0 upcoming fixtures (season may have ended)',
      fixturesOnCricclubs: 0,
      matched: 0,
      updated: 0,
      idsBackfilled: 0,
      changes: [],
    });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const summary = await refreshFixtures(supabase, fixtures);
    return json({ ok: true, ...summary });
  } catch (e) {
    return json({ error: `refresh failed: ${(e as Error).message}` }, 500);
  }
});
