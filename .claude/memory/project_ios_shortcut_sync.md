---
name: ios-shortcut-cricclubs-sync
description: "cricclubs sync = iOS Shortcut → Edge Function; iOS 26 strips HTML from list/fixtures POST bodies (fix: Base64/JSON); Cloudflare blocks all automated browsers; local .html/.mhtml ingest escape hatch"
metadata:
  node_type: memory
  type: project
  originSessionId: 10de7e58-6fcd-41f0-8f6c-c7dbdff83e39
---

Cricket sync from cricclubs.com runs as an **iOS Shortcut on Bhaskar's iPhone** → POSTs scraped HTML to the Supabase Edge Function `cricclubs-ingest` (routes: `?type=fixtures`, `?type=list` parse-only, `?type=scorecard` writes+auto-completes). The iPhone's residential IP is the only host that reliably clears cricclubs' Cloudflare bot-wall. Auth = shared `CRICCLUBS_SYNC_SECRET` header, `verify_jwt=false` in config.toml.

**CONFIRMED ROOT CAUSE of the whole outage (2026-06-22):** cricclubs now serves a **Cloudflare JavaScript challenge ("Just a moment...", ~6 KB) to plain HTTP GETs**. The iOS Shortcut's `Get Contents of URL` AND the Scriptable script's `new Request(url)` are both plain GETs that DON'T execute JS → both receive the 6 KB interstitial, not the page → `parseMatchList` finds 0 matches → loop never runs → nothing syncs. Proven by instrumenting the Edge Function to write the received body into `sync_state.last_summary`: `LIST h=6186 c=0 title="Just a moment..."`. **No Shortcut header/body change can fix this — the wall is at the fetch.** Only a JS-executing engine clears it: Safari, Chrome, or a `WebView`/WKWebView that *loads* the URL (not Scriptable's `new Request`, which is plain HTTP). The Scriptable WebView is currently used only for *parsing* already-fetched HTML, so it doesn't help the fetch.

**Cloudflare also blocks ALL automated browsers** — verified 2026-06-22: headless Chromium, headed Chromium, AND `channel:'chrome'` via Playwright all stall on the interstitial (`navigator.webdriver` etc.). `scripts/cricclubs-sync/sync.ts` (Playwright) is effectively dead — don't revive the headless path.

**Permanent on-device fix (NOT yet implemented):** change Scriptable `fetchHtml` to `WebView.loadURL(url)` + wait for the challenge to auto-resolve (poll until `document.title !== 'Just a moment...'`) + `evaluateJavaScript('document.documentElement.outerHTML')`, then parse + write to Supabase directly (no Edge Function). WKWebView runs the JS challenge like Safari, so it clears Cloudflare. Until then, use the local Chrome-save ingest below.

**iOS 26 HTML-stripping bug (root cause of the 2026-06-15→22 outage):** when a Shortcut sends a `Contents of URL` magic variable in a **JSON/Form text field OR a File body**, iOS silently strips all HTML tags, leaving ~6 KB of plain text (watch the request `content_length` in Edge logs — full page is 50–100 KB). cheerio then matches 0 rows → `?type=list` returns `count:0` → the Shortcut's Repeat loop never fires → nothing syncs. The **only** body shape that survives is **Base64 inside a JSON field** (why the scorecard step always used `htmlBase64`).
- **Fix (server, done + tested):** `supabase/functions/cricclubs-ingest/decode-body.ts` → `extractHtmlFromBody()` accepts `{htmlBase64}`/`{html}` JSON, bare base64, or raw HTML; wired into `list`+`fixtures` routes in `index.ts`; routes 400 loudly on a tag-less body. Tests `__tests__/decode-body.test.ts`. **Needs `supabase functions deploy cricclubs-ingest` to take effect.**
- **Fix (Shortcut, PENDING as of 2026-06-22):** reconfigure the `?type=list` and `?type=fixtures` steps to mirror the scorecard step — JSON body, field `htmlBase64` = `Base64 Encode` of the page's `Contents of URL`. The scorecard step was already correct and immune.

**Red herrings ruled out this session:** (1) a one-off `401` was a *corrupted Shortcut* (restoring the backup → 200), NOT the Supabase API-key migration — don't touch the keys; the `sb_publishable_` anon key in `.env.local` is fine and the service-role JWT still works for direct PostgREST. (2) the same-day auto-complete logic was never the issue.

**Local escape hatch (works because YOUR browser fetches, the script only parses):** `scripts/cricclubs-sync/ingest-html.mts` + `run-ingest.mts`. Save cricclubs pages from Chrome (`.html` or `.mhtml` — it unwraps MHTML quoted-printable), then:
`cd scripts/cricclubs-sync && node_modules/.bin/tsx run-ingest.mts *.html *.mhtml`
Auto-routes each file (Fixtures/Results/Scorecard by title+content), upserts cricclubs_matches/batting/bowling, refreshes fixtures by `cricclubs_fixture_id`, auto-completes schedule rows (`lte` today + same-day guard, never overwrites a non-null result). Reads `.env.local` via the wrapper so the service-role key never hits the shell. `*.html`/`*.mhtml` git-ignored. Used 2026-06-22 to backfill June 21 vs California Eagles (won by 6; 23 bat / 14 bowl).

Related: [[project_motion_chunk_incident]]
