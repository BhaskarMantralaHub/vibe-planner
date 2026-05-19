// Apify residential-proxy fetch wrapper for the Edge Function.
//
// Why: cricclubs.com is behind Cloudflare Bot Management which challenges
// datacenter IPs AND issues a JS challenge to plain HTTP clients. Supabase
// Edge runs on Deno Deploy / AWS, so it can't fetch cricclubs directly.
//
// First attempt used apify/cheerio-scraper (HTTP-only, residential proxy)
// but cricclubs returned 403 on every retry — Cloudflare's JS challenge
// requires a real browser to solve. Switched to apify/web-scraper which
// runs headless Chromium and can pass the challenge.
//
// Pricing: ~$0.02 per scorecard fetch (compute + proxy bandwidth). At
// ~17 fetches per full-sync, ~4 syncs/month = ~$1.40/month. Inside the
// $5/month free Apify credit. Skip-already-synced (TODO follow-up) would
// drop steady-state cost ~10x once initial backfill is done.

const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN') ?? '';
const APIFY_ACTOR = Deno.env.get('APIFY_ACTOR') ?? 'apify~web-scraper';

export const fetchHtmlViaApify = async (url: string): Promise<string> => {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN env var is not set on the Edge Function');
  }
  // run-sync-get-dataset-items: runs the actor and waits for completion,
  // returning the dataset items as JSON. Timeout 180s accommodates web-
  // scraper's cold-start (~30s) + JS-challenge wait + page render.
  const endpoint =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=180`;
  const input = {
    runMode: 'PRODUCTION',
    startUrls: [{ url }],
    // page.content() returns fully-rendered HTML (after the Cloudflare JS
    // challenge resolves). We also briefly waitForFunction to detect when
    // the challenge interstitial ("Just a moment…" / "Checking your
    // browser") has cleared; if there's no challenge the wait resolves
    // immediately. Empty-body / challenge-still-present falls through and
    // returns whatever's on the page.
    pageFunction:
      "async function pageFunction(context) { " +
      "  const { page, request } = context; " +
      "  try { " +
      "    await page.waitForFunction(" +
      "      () => !document.title.includes('Just a moment') && !document.title.includes('Checking your browser'), " +
      "      { timeout: 20000 }" +
      "    ); " +
      "  } catch (_) {} " +
      "  const html = await page.content(); " +
      "  return { url: request.url, html, title: await page.title() }; " +
      "}",
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
    },
    maxRequestsPerCrawl: 1,
    useChrome: true,            // real Chrome (better fingerprint than headless Chromium)
    headless: true,
    injectJQuery: false,         // don't need it; we'll parse server-side
    customData: {},
  };
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) {
    // Apify error bodies sometimes echo back the request URL (which contains
    // ?token=APIFY_TOKEN). Scrub before raising so the token doesn't end up
    // in cricclubs_sync_state.last_summary (RLS-readable).
    const body = (await res.text()).slice(0, 200);
    const scrubbed = body
      .replace(/([?&])(token|apify_token|api_key|secret)=[^&\s"'`]+/gi, '$1$2=REDACTED')
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, 'Bearer REDACTED');
    throw new Error(`Apify ${res.status}: ${scrubbed}`);
  }
  const items = (await res.json()) as Array<{ html?: string }>;
  if (!items.length || !items[0]?.html) {
    throw new Error(`Apify returned empty dataset for ${url.replace(/([?&])(token|apify_token)=[^&\s]+/gi, '$1$2=REDACTED')}`);
  }
  return items[0].html;
};
