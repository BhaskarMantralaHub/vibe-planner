// Regression tests for decodeBodyHtml.
//
// Bug (2026-06-22): iOS 26 Shortcuts strips HTML tags from the fixtures/list
// POST body (a "Contents of URL" magic variable in a text body), so cricclubs
// HTML arrived as ~6 KB of tag-less plain text. parseMatchList/parseFixtures
// then matched 0 rows → the Shortcut's Repeat loop never fired → nothing synced
// for two weekends. Fix: the Shortcut Base64-encodes the page; the Edge
// Function decodes a tag-less body here.
//
// Run:
//   cd supabase/functions/cricclubs-ingest
//   deno test __tests__/decode-body.test.ts

import { decodeBodyHtml, extractHtmlFromBody } from '../decode-body.ts';
import { assert, assertEquals } from 'jsr:@std/assert@1';

const HTML = '<div class="row team-data" id="deleteRow6144">MTCA Sunrisers Manteca</div>';
const b64 = btoa(HTML);

Deno.test('raw HTML passes through untouched (programmatic callers)', () => {
  assertEquals(decodeBodyHtml(HTML), HTML);
});

Deno.test('base64-encoded HTML is decoded (iOS Shortcut path)', () => {
  assertEquals(decodeBodyHtml(b64), HTML);
});

Deno.test('base64 with surrounding whitespace still decodes', () => {
  assertEquals(decodeBodyHtml(`\n  ${b64}  \n`), HTML);
});

Deno.test('iOS-stripped plain text is returned as-is (route then rejects it)', () => {
  // No tags, not base64 of anything HTML-like → returned unchanged so the
  // route's "no HTML tags" guard can emit a clear 400.
  const stripped = 'MTCA Sunrisers Manteca v MTCA California Eagles Bethany Park';
  const out = decodeBodyHtml(stripped);
  assert(!out.includes('<'));
});

Deno.test('non-base64 garbage does not throw', () => {
  const out = decodeBodyHtml('%%%not base64%%%');
  assert(typeof out === 'string');
});

// extractHtmlFromBody — the body shapes the routes actually receive.
Deno.test('extract: JSON {htmlBase64} (iOS Shortcut JSON-field path)', () => {
  assertEquals(extractHtmlFromBody(JSON.stringify({ htmlBase64: b64 })), HTML);
});

Deno.test('extract: JSON {html} (programmatic)', () => {
  assertEquals(extractHtmlFromBody(JSON.stringify({ html: HTML })), HTML);
});

Deno.test('extract: bare base64 body', () => {
  assertEquals(extractHtmlFromBody(b64), HTML);
});

Deno.test('extract: raw HTML body passes through', () => {
  assertEquals(extractHtmlFromBody(HTML), HTML);
});

Deno.test('extract: iOS-stripped plain text stays tag-less (route 400s it)', () => {
  const out = extractHtmlFromBody('MTCA Sunrisers Manteca v MTCA California Eagles');
  assert(!out.includes('<'));
});
