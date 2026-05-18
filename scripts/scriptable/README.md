# cricclubs-sync (Scriptable / iOS)

Phone-driven cricket sync. Replaces the (Cloudflare-blocked) GitHub Action and the fragile iOS Shortcut path with a single Scriptable script.

> **Why this exists** — see decision log in conversation history. TL;DR:
> 1. GitHub Action runner IPs get Cloudflare-challenged on cricclubs.com (broken since 2026-05-18).
> 2. Supabase Edge Functions run on Deno Deploy / AWS — same datacenter-IP problem.
> 3. iPhone's residential IP is the only host that reliably reaches cricclubs.
> 4. iOS Shortcuts can do HTTP loops but have no retry/timeout primitives, so they break in production.
> 5. **Scriptable** runs JavaScript with real `fetch` + `WKWebView` + `try/catch` + Keychain on the same iPhone. Perfect fit.

## What it does

On each run (single tap from home-screen icon), in this order:

1. **Fixtures refresh** — `fixtures.do?clubId=…` → upcoming-match table
   - For each fixture, find the matching `cricket_schedule_matches` row by `cricclubs_fixture_id`, falling back to (opponent + nearest date within ±14d), then (date + venue). Diff-driven `PATCH` — only writes the fields that actually changed. Never touches rows with a non-null `result` (admin wins are sacred).
2. **Match list** — `listMatches.do?clubId=…&fromDate=…&toDate=…` → array of completed matches
3. **Per scorecard**:
   - Skip if already fully ingested (has batting rows). Override with `CONFIG.force_resync = true`.
   - Fetch `viewScorecard.do?matchId=N` (~800 KB HTML)
   - Parse in a hidden `WKWebView` using `document.querySelectorAll` (vanilla DOM, no cheerio)
   - Upsert `cricclubs_matches` (with toss + scoreboard summary)
   - Upsert sibling `cricclubs_match_html` (raw HTML for offline re-parsing)
   - Upsert N × `cricclubs_batting` (one per batter, plus DNB rows)
   - Upsert M × `cricclubs_bowling`
   - Auto-complete the matching `cricket_schedule_matches` row (status=completed, result, scores)
4. **Summary notification** — fixtures-refresh count, per-match success/failure, elapsed time

All writes go through Supabase **PostgREST** with the service-role key in iOS Keychain. No Edge Function involvement.

## One-time setup

### 1. Install Scriptable
App Store → free → install.

### 2. Copy the script
- Open `cricclubs-sync.js` from this repo (e.g. on Mac with iCloud-synced Files).
- Open Scriptable on iPhone → tap **+** → paste the script → name it `Cricclubs Sync`.

### 3. Configure
Edit the `CONFIG` block at the top of the script:

```js
const CONFIG = {
  supabase_url:     'https://YOUR-PROJECT.supabase.co',   // Project Settings → API
  team_id:          'YOUR-TEAM-UUID',                       // cricket_teams.id for your row
  league_id:        14653,                                  // your cricclubs clubId
  team_name:        'MTCA Sunrisers Manteca',
  cricclubs_base:   'https://www.cricclubs.com/MountainHouseTracyCricketAssociationMTCA',
  season_from:      '04/01/2026',                           // MM/DD/YYYY (cricclubs format)
  season_to:        '08/31/2026',
  force_resync:     false,                                  // true → re-fetch all, don't skip
  scorecard_timeout_sec: 30,
};
```

### 4. Store the service-role key in Keychain
At the top of the script, uncomment these two lines, paste your service-role key (Supabase → Project Settings → API → `service_role` — the secret one), and run once:

```js
const SETUP_KEY = 'eyJhbG...your-service-role-key...';
if (SETUP_KEY) Keychain.set('cricclubs_sync_sr_key', SETUP_KEY);
```

After the first run completes, **re-comment those two lines and save the script** — the key now lives in iOS Keychain (sandboxed per-app, Face/Touch ID gated, revocable from Supabase dashboard).

> ⚠️ The service-role key bypasses RLS. Treat the device as you'd treat a laptop with `.env.local`. Revoke + rotate immediately if the iPhone is lost.

### 5. Pin it
Long-press `Cricclubs Sync` in Scriptable's grid → **Add to Home Screen**. You now have a one-tap icon.

(Optional) Add the Scriptable widget — small size, configured to run this script — to your home screen for at-a-glance "last sync" status.

## Verify

Run it once. The notification at the end should show something like:

```
🔄 Fetching match list…
📋 5 matches found
👥 Roster: 23 players
✓ MTCA Sapphires vs MTCA Sunrisers Manteca (bat:22 bowl:10)
✓ MTCA Hawks vs MTCA Sunrisers Manteca (bat:22 bowl:11)
…
✅ 5 ingested · 0 skipped · 0 failed
⏱ 47s
```

Then reload `/cricket/schedule#completed` — every completed card should now show the toss line and full per-player stats should flow into `/cricket/league-stats`.

If the notification shows `0 ingested` + `5 skipped`, that's correct on a second run — the skip optimization checked existing `cricclubs_batting` rows and short-circuited. Set `force_resync: true` to re-fetch.

## Operating notes

- **Cadence**: run once after each weekend's matches finish. The script is idempotent — re-running mid-week with `force_resync: false` is a no-op.
- **Live matches**: if cricclubs has a live match cached as partial when you run, the script will ingest the partial. Re-run after the match ends.
- **Cricclubs HTML drift**: if cricclubs changes their HTML and parsing breaks, you'll see `0 ingested · N failed` with an error message per match. The Node parser in `scripts/cricclubs-sync/parser.ts` is the source of truth; the Scriptable parsers (`MATCH_LIST_PARSER`, `SCORECARD_PARSER`) are vanilla-DOM ports of the same logic. Keep both in sync.
- **Roster mismatch**: if a player name on cricclubs doesn't exactly match `cricket_players.name`, the batting/bowling row lands with `player_id = NULL` — same behavior as the Node sync. The `cricclubs_name` text is preserved so they still appear in dismissal context.

## Architecture notes

```
   iPhone (Scriptable, residential IP)
   ┌──────────────────────────────┐
   │  cricclubs-sync.js           │
   │                              │
   │  Request → cricclubs.com  ◄─── (residential IP, no Cloudflare block)
   │                              │
   │  WKWebView.evaluateJavaScript(parser)
   │    └─ vanilla DOM parsing    │
   │                              │
   │  Request → Supabase REST  ───►  /rest/v1/cricclubs_matches
   │    (service-role from           /rest/v1/cricclubs_match_html
   │     Keychain)                   /rest/v1/cricclubs_batting
   │                                 /rest/v1/cricclubs_bowling
   │                                 /rest/v1/cricket_schedule_matches
   └──────────────────────────────┘
```

**Why WKWebView for parsing instead of regex?** Cricclubs scorecards have nested tables with player markers (`*`, `†`), dismissal sub-cells, and HTML entities. Regex parsers for that are brittle; vanilla DOM parsing in a hidden WebView is essentially "cheerio on iOS" and matches the Node parser's logic line-by-line.

**Why service-role and not anon?** RLS policies on `cricclubs_*` and `cricket_schedule_matches` require `is_team_admin(team_id)` for writes. The phone needs to bypass RLS to upsert; service-role is the standard pattern.

## What this consolidates

This single script replaces three older sync paths:

| Older path | Status |
|---|---|
| GitHub Action `cricclubs-sync.yml` | Disabled (Cloudflare-blocked since 2026-05-18). File kept dormant in case Cloudflare softens or you need a one-shot laptop backfill via `npm run sync`. |
| iOS Shortcut + Edge Function `cricclubs-ingest` (V1, fixtures-only) | Functionally superseded by this script's step 1. The Edge Function file stays deployed as a backup endpoint, but the Shortcut on your home screen can be deleted once you've confirmed this script handles a full season cleanly. |
| Manual `npm run sync` for scorecards | Superseded entirely by this script's steps 2–3. |

After a full season of reliable Scriptable runs, you can safely:
1. Remove the `cricclubs-sync.yml` workflow file
2. Delete the iOS Shortcut from your home screen
3. (Optional) Drop the Edge Function — the Scriptable script doesn't call it

## Limitations

- **Single-team**: the script is hard-coded to one team via `CONFIG.team_id`. For multi-team, copy the script per team or extend `CONFIG` to a `teams: [...]` array.
- **No live match polling**: this is a "after-the-match" sync. No mid-day refresh.
- **Two parsers to maintain**: any cricclubs HTML change needs both `scripts/cricclubs-sync/parser.ts` (Node) and the two parser strings in `cricclubs-sync.js` (Scriptable) updated. Keep the fixture tests in Node green and port any fixes manually.
