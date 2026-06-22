// Body-decoding helpers for the fixtures/list routes.
//
// iOS Shortcuts silently strips HTML tags when a "Contents of URL" magic
// variable is sent in a JSON/Form text field (and, as of iOS 26, even a File
// body coerces oddly), leaving ~plain text — so cricclubs HTML arrives tag-less
// and cheerio matches 0 rows. The one delivery method that survives is the same
// one the scorecard route uses: Base64 inside a JSON field (`htmlBase64`), which
// has no tags for iOS to mangle.
//
// extractHtmlFromBody accepts, in priority order:
//   1. JSON  { "htmlBase64": "<base64 of the page HTML>" }   (iOS Shortcut path)
//   2. JSON  { "html": "<raw html>" }                         (programmatic)
//   3. a bare Base64 string                                   (no-tags body)
//   4. raw HTML                                               (Scriptable, tests)
// Backward-compatible: callers that still POST raw HTML keep working.

function b64ToUtf8(s: string): string | null {
  try {
    // atob (WHATWG forgiving-base64) tolerates whitespace/line breaks.
    const binary = atob(s.trim());
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return null;
  }
}

// Decode a raw (non-JSON) body: real HTML passes through; a tag-less body is
// tried as Base64.
export function decodeBodyHtml(raw: string): string {
  if (raw.includes('<')) return raw;
  const decoded = b64ToUtf8(raw);
  if (decoded && decoded.includes('<')) return decoded;
  return raw;
}

// Extract page HTML from any supported body shape (see header).
export function extractHtmlFromBody(rawBody: string): string {
  try {
    const j = JSON.parse(rawBody);
    if (j && typeof j === 'object') {
      if (typeof j.htmlBase64 === 'string' && j.htmlBase64.length > 0) {
        const decoded = b64ToUtf8(j.htmlBase64);
        if (decoded) return decoded;
      }
      if (typeof j.html === 'string') return j.html;
    }
  } catch {
    // not JSON — fall through to raw/base64 handling
  }
  return decodeBodyHtml(rawBody);
}
