// Apify residential-proxy fetch wrapper for the Edge Function.
//
// Why: cricclubs.com is behind Cloudflare Bot Management which challenges
// datacenter IPs (Supabase Edge runs on Deno Deploy / AWS — same problem GH
// Actions had). We outsource the actual cricclubs fetch to Apify's
// apify/cheerio-scraper actor with RESIDENTIAL proxy group, which bypasses
// Cloudflare by exiting from real residential ISPs.
//
// Pricing: ~$0.01 per scorecard fetch (compute + proxy bandwidth). Apify
// free tier gives $5/month auto-refilling — comfortably covers ~50 fetches
// per month at full-sync cadence.

const APIFY_TOKEN = Deno.env.get('APIFY_TOKEN') ?? '';
const APIFY_ACTOR = Deno.env.get('APIFY_ACTOR') ?? 'apify~cheerio-scraper';

export const fetchHtmlViaApify = async (url: string): Promise<string> => {
  if (!APIFY_TOKEN) {
    throw new Error('APIFY_TOKEN env var is not set on the Edge Function');
  }
  // run-sync-get-dataset-items: runs the actor and waits for completion,
  // returning the dataset items as JSON. Timeout caps the wait at 120s —
  // far above the ~3s warm-actor latency.
  const endpoint =
    `https://api.apify.com/v2/acts/${APIFY_ACTOR}/run-sync-get-dataset-items` +
    `?token=${APIFY_TOKEN}&timeout=120`;
  const input = {
    startUrls: [{ url }],
    pageFunction:
      "async function pageFunction(context) { " +
      "return { url: context.request.url, html: context.body }; " +
      "}",
    proxyConfiguration: {
      useApifyProxy: true,
      apifyProxyGroups: ['RESIDENTIAL'],
    },
    maxRequestsPerCrawl: 1,
    additionalMimeTypes: ['text/html'],
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
