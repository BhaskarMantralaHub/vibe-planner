import * as Sentry from '@sentry/react';

const SENTRY_DSN = process.env.NEXT_PUBLIC_SENTRY_DSN;

export function initSentry() {
  if (!SENTRY_DSN) return;

  Sentry.init({
    dsn: SENTRY_DSN,
    environment: process.env.NODE_ENV,
    sendDefaultPii: false,
    tracesSampleRate: 0, // Disable performance monitoring (free tier — save quota for errors)
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    beforeSend: scrubShareTokens,
  });
}

/**
 * Public share links carry a live bearer token in the URL, and Sentry attaches
 * the full page URL to every event. `sendDefaultPii: false` does not help — it
 * covers IP, cookies and headers, not the URL. So without this, one JS error on
 * a shared report would mail a working 30-day credential into the issue tracker.
 */
function scrubShareTokens(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const scrub = (u: string) =>
    u
      // ?t=<token> — the form links are actually minted in
      .replace(/([?&]t=)[0-9a-f-]{36}/gi, '$1<redacted>')
      // /settlement/<token>/ — the path form, still accepted by the page
      .replace(/\/(settlement|dues)\/[0-9a-f-]{36}/gi, '/$1/<redacted>');

  if (event.request?.url) event.request.url = scrub(event.request.url);
  if (event.transaction) event.transaction = scrub(event.transaction);
  for (const b of event.breadcrumbs ?? []) {
    if (typeof b.data?.url === 'string') b.data.url = scrub(b.data.url);
  }
  return event;
}

export { Sentry };
