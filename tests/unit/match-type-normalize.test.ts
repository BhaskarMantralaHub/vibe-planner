import { describe, it, expect } from 'vitest';

/**
 * Guards the ORDER of checks in normalizeMatchType.
 *
 * The function lives in two sync scripts (scripts/cricclubs-sync/ingest-html.mts
 * and scripts/scriptable/cricclubs-sync.js, the latter being plain JS for iOS
 * Scriptable), neither of which is importable from the Next.js test suite. This
 * replicates the logic so the ORDERING RULE is pinned by a test — if someone
 * reorders the real ones, this is the failure that explains why.
 *
 * The trap: "Semi Final" contains the substring "final". Test `final` before
 * `semi` and every semi-final is recorded as a final.
 */
function normalizeMatchType(raw: string | null): string | null {
  if (!raw) return null;
  const lc = raw.toLowerCase();
  if (lc.includes('semi')) return 'semi_final';
  if (lc.includes('final')) return 'final';
  if (lc.includes('league')) return 'league';
  if (lc.includes('practice')) return 'practice';
  return null;
}

describe('normalizeMatchType', () => {
  it('maps the exact values MTCA publishes', () => {
    // Verified against the real league-wide fixtures page: 17 League,
    // 8 Semi Final, 4 Final.
    expect(normalizeMatchType('League')).toBe('league');
    expect(normalizeMatchType('Semi Final')).toBe('semi_final');
    expect(normalizeMatchType('Final')).toBe('final');
  });

  it('does NOT mistake a semi-final for a final', () => {
    // The whole reason the order is what it is.
    expect(normalizeMatchType('Semi Final')).not.toBe('final');
    expect(normalizeMatchType('Semi-Final')).toBe('semi_final');
    expect(normalizeMatchType('SEMI FINAL')).toBe('semi_final');
  });

  it('prefers the playoff round over the word "league"', () => {
    // "League Semi Final" must not flatten to a plain league game — that would
    // silently lose the knockout round.
    expect(normalizeMatchType('League Semi Final')).toBe('semi_final');
    expect(normalizeMatchType('League Final')).toBe('final');
  });

  it('still handles practice and unknown values', () => {
    expect(normalizeMatchType('Practice')).toBe('practice');
    expect(normalizeMatchType('Friendly')).toBeNull();
    expect(normalizeMatchType('')).toBeNull();
    expect(normalizeMatchType(null)).toBeNull();
  });

  it('only ever returns values the CHECK constraints allow', () => {
    // cricket_schedule_matches and cricket_umpiring_duties both constrain
    // match_type; anything else would be rejected by the database.
    const allowed = new Set(['league', 'practice', 'semi_final', 'final', null]);
    for (const raw of [
      'League', 'Semi Final', 'Final', 'Practice', 'League Semi Final',
      'quarter final', 'Friendly', '', null,
    ]) {
      expect(allowed.has(normalizeMatchType(raw))).toBe(true);
    }
  });

  it('classifies "quarter final" as a final — a known limitation', () => {
    // MTCA does not currently publish quarter-finals. If they ever do, this
    // test is the reminder that a 'quarter_final' value would be needed in
    // both CHECK constraints before the parser can emit one.
    expect(normalizeMatchType('Quarter Final')).toBe('final');
  });
});
