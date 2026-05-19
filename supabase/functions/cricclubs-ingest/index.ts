// Edge Function entry point for the cricclubs sync pipeline.
//
// Two routes share this function:
//
//   POST /?type=fixtures      — Legacy V1 path. Caller POSTs raw fixtures.do
//                               HTML in the body (iOS Shortcut fetched it on
//                               residential IP). Auth via X-Sync-Secret.
//                               Kept for backwards compat with the existing
//                               Shortcut on the admin's iPhone.
//
//   POST /?type=full-sync     — New V2 path. No body needed; function fetches
//                               cricclubs itself via Apify residential proxy.
//                               Acquires singleton lock from
//                               cricclubs_sync_state before starting; refuses
//                               with 409 if another sync is already running.
//                               Auth: X-Sync-Secret (for cron/GH-Action/iOS)
//                               OR Supabase JWT with admin role in
//                               profiles.access (for the web "Sync Now"
//                               button).
//
// JWT verification is disabled in config.toml for this function. Our own
// auth check below replaces it.

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import { parseFixtures } from './parser.ts';
import { refreshFixtures } from './refresh.ts';
import { acquireLock, releaseLock, runFullSync } from './full-sync.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SYNC_SECRET = Deno.env.get('CRICCLUBS_SYNC_SECRET');

// Strip sensitive query params (Apify tokens, JWTs) from error message
// strings before they end up in last_summary (which is RLS-readable by any
// authenticated user). Defense against Apify echoing back the request URL
// in 5xx responses.
function scrubSensitive(s: string): string {
  return s
    .replace(/([?&])(token|apify_token|api_key|secret)=[^&\s"'`]+/gi, '$1$2=REDACTED')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED');
}

// Origins permitted to call this function from a browser. Localhost is
// included for dev; the prod app sits at viberstoolkit.com. Non-browser
// callers (iOS Shortcut, pg_cron, GH Action) don't enforce CORS, so they
// continue to work regardless of this allowlist.
const ALLOWED_ORIGINS = new Set([
  'https://viberstoolkit.com',
  'https://www.viberstoolkit.com',
  'http://localhost:3000',
  'http://localhost:3001',
]);

function corsHeadersFor(req: Request): Record<string, string> {
  const origin = req.headers.get('origin');
  // If the request comes from an allowlisted origin, echo it back; otherwise
  // omit the header entirely (browsers will block the response, which is the
  // desired behavior for non-browser-but-CORS-curious callers).
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    return {
      'access-control-allow-origin': origin,
      'access-control-allow-headers': 'authorization, x-sync-secret, content-type',
      'access-control-allow-methods': 'POST, OPTIONS',
      'vary': 'origin',
    };
  }
  return {};
}

const json = (body: unknown, status = 200, cors: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...cors },
  });

class AuthError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

// Authenticate the caller. Returns a label describing who triggered the sync
// (used as the cricclubs_sync_state.triggered_by audit field).
// Throws AuthError with a status code on failure — dispatcher catches and
// emits the response with the correct CORS headers.
async function authenticate(req: Request, supabaseService: SupabaseClient): Promise<string> {
  // Path A: X-Sync-Secret (legacy V1, cron, GH Action, Scriptable)
  const secret = req.headers.get('x-sync-secret') ?? '';
  if (SYNC_SECRET && secret && secret === SYNC_SECRET) {
    return 'shared-secret';
  }
  // Path B: Supabase JWT with admin role
  const authHeader = req.headers.get('authorization') ?? '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const jwt = authHeader.slice(7);
    const supabaseAnon = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(jwt);
    if (userErr || !userData?.user) {
      throw new AuthError(401, 'invalid JWT');
    }
    const { data: profile, error: profErr } = await supabaseService
      .from('profiles')
      .select('access')
      .eq('id', userData.user.id)
      .maybeSingle();
    if (profErr || !profile) {
      throw new AuthError(403, 'no profile');
    }
    const access = (profile as { access: string[] | null }).access ?? [];
    if (!access.includes('admin')) {
      throw new AuthError(403, 'admin role required');
    }
    return `button:${userData.user.email ?? userData.user.id}`;
  }
  throw new AuthError(401, 'unauthorized');
}

Deno.serve(async (req) => {
  const cors = corsHeadersFor(req);

  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }
  if (req.method !== 'POST') {
    return json({ error: 'method not allowed' }, 405, cors);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  let triggeredBy: string;
  try {
    triggeredBy = await authenticate(req, supabase);
  } catch (e) {
    if (e instanceof AuthError) {
      return json({ error: e.message }, e.status, cors);
    }
    return json({ error: 'auth check failed' }, 500, cors);
  }

  const url = new URL(req.url);
  const type = url.searchParams.get('type');

  // ── V2 full-sync route ────────────────────────────────────────────────────
  if (type === 'full-sync') {
    // Optional body: { force_match_ids: string[] } — schedule-row UUIDs to
    // force-overwrite even if they already have a result set. Used by the
    // per-match "Re-sync from cricclubs" admin action. Body is optional;
    // empty or missing = normal behavior.
    let forceMatchIds: string[] = [];
    try {
      const text = await req.text();
      if (text) {
        const body = JSON.parse(text);
        if (Array.isArray(body?.force_match_ids)) {
          forceMatchIds = body.force_match_ids
            .filter((x: unknown) => typeof x === 'string')
            // UUID v4 sanity check to keep junk out of the IN(...) filter
            .filter((x: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x))
            .slice(0, 50); // upper bound per call
        }
      }
    } catch { /* ignore malformed body — treat as no force */ }

    const token = await acquireLock(supabase, triggeredBy);
    if (!token) {
      return json(
        {
          ok: false,
          error: 'Another sync is already in progress. Try again in a minute.',
          code: 'sync_already_running',
        },
        409,
        cors,
      );
    }
    try {
      const result = await runFullSync(supabase, { forceMatchIds });
      await releaseLock(supabase, token, result.summary);
      return json({ ok: result.ok, ...result }, 200, cors);
    } catch (e) {
      const msg = scrubSensitive((e as Error).message ?? 'unknown');
      await releaseLock(supabase, token, `❌ ${msg.slice(0, 200)}`);
      return json({ ok: false, error: msg }, 500, cors);
    }
  }

  // ── V1 legacy fixtures route ──────────────────────────────────────────────
  // Shares the same singleton lock as V2 full-sync so the two paths never
  // write `cricket_schedule_matches` concurrently (review item #5).
  if (type === 'fixtures') {
    const html = await req.text();
    if (!html || html.length < 100) {
      return json({ error: 'request body is empty or too small to be cricclubs HTML' }, 400, cors);
    }
    if (!/schedule-table1|deleteRow|MTCA/i.test(html)) {
      return json(
        {
          error: 'html does not look like a cricclubs fixtures page',
          hint: 'expected markers (schedule-table1, deleteRow, MTCA) not found',
        },
        400,
        cors,
      );
    }
    let fixtures;
    try {
      fixtures = parseFixtures(html);
    } catch (e) {
      return json({ error: `parse failed: ${scrubSensitive((e as Error).message)}` }, 500, cors);
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
      }, 200, cors);
    }
    const v1Token = await acquireLock(supabase, `${triggeredBy}:v1-fixtures`);
    if (!v1Token) {
      return json(
        {
          ok: false,
          error: 'Another sync is already in progress. Try again in a minute.',
          code: 'sync_already_running',
        },
        409,
        cors,
      );
    }
    try {
      const summary = await refreshFixtures(supabase, fixtures);
      await releaseLock(supabase, v1Token, `V1 fixtures: ${summary.matched}/${summary.fixturesOnCricclubs} matched, ${summary.updated} updated`);
      return json({ ok: true, ...summary }, 200, cors);
    } catch (e) {
      const msg = scrubSensitive((e as Error).message);
      await releaseLock(supabase, v1Token, `❌ V1 fixtures: ${msg.slice(0, 150)}`);
      return json({ error: `refresh failed: ${msg}` }, 500, cors);
    }
  }

  return json({ error: `unsupported type: ${type ?? '(none)'}` }, 400, cors);
});
