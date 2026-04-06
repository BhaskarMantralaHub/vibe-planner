import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest';

// ── Mock Supabase client ─────────────────────────────────────────────────────

const mockInsert = vi.fn().mockResolvedValue({ error: null });
const mockFrom = vi.fn().mockReturnValue({ insert: mockInsert });

let mockIsCloudMode = true;
let mockReturnSupabase: any = { from: mockFrom };

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => mockReturnSupabase,
  isCloudMode: () => mockIsCloudMode,
}));

// ── Import after mocks ──────────────────────────────────────────────────────

const { trackActivity } = await import('@/lib/activity');

// ── Helpers ─────────────────────────────────────────────────────────────────

const USER_A = 'user-a-001';
const USER_B = 'user-b-002';

describe('trackActivity', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    sessionStorage.clear();
    mockInsert.mockClear();
    mockFrom.mockClear();
    mockIsCloudMode = true;
    mockReturnSupabase = { from: mockFrom };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Basic insert behavior ──────────────────────────────────────────────

  it('inserts login activity into user_activity table', () => {
    trackActivity(USER_A, 'login');
    expect(mockFrom).toHaveBeenCalledWith('user_activity');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: USER_A,
      activity_type: 'login',
      page_path: null,
    });
  });

  it('inserts page_view activity with path', () => {
    trackActivity(USER_A, 'page_view', '/cricket');
    expect(mockInsert).toHaveBeenCalledWith({
      user_id: USER_A,
      activity_type: 'page_view',
      page_path: '/cricket',
    });
  });

  // ── Non-cloud / null client guards ────────────────────────────────────

  it('skips insert when not in cloud mode', () => {
    mockIsCloudMode = false;
    trackActivity(USER_A, 'login');
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('skips insert when supabase client is null', () => {
    mockReturnSupabase = null;
    trackActivity(USER_A, 'login');
    expect(mockInsert).not.toHaveBeenCalled();
  });

  // ── Login dedup (30-min window) ───────────────────────────────────────

  it('deduplicates login within 30-minute window', () => {
    trackActivity(USER_A, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(1);

    trackActivity(USER_A, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(1); // still 1 — deduped
  });

  it('allows login after 30-minute window expires', () => {
    trackActivity(USER_A, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(30 * 60 * 1000 + 1);

    trackActivity(USER_A, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  // ── Page view dedup (5-min window) ────────────────────────────────────

  it('deduplicates page_view within 5-minute window', () => {
    trackActivity(USER_A, 'page_view', '/cricket');
    trackActivity(USER_A, 'page_view', '/cricket');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });

  it('allows page_view after 5-minute window expires', () => {
    trackActivity(USER_A, 'page_view', '/cricket');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    trackActivity(USER_A, 'page_view', '/cricket');
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  // ── Independent dedup keys ────────────────────────────────────────────

  it('login and page_view have independent dedup keys', () => {
    trackActivity(USER_A, 'login');
    trackActivity(USER_A, 'page_view', '/cricket');
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('different users have independent login dedup', () => {
    trackActivity(USER_A, 'login');
    trackActivity(USER_B, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  it('different page paths have independent dedup', () => {
    trackActivity(USER_A, 'page_view', '/cricket');
    trackActivity(USER_A, 'page_view', '/vibe-planner');
    expect(mockInsert).toHaveBeenCalledTimes(2);
  });

  // ── sessionStorage resilience ─────────────────────────────────────────

  it('still inserts when sessionStorage is full (setItem throws)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    trackActivity(USER_A, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(1);

    warnSpy.mockRestore();
    vi.restoreAllMocks();
  });

  it('still inserts when sessionStorage has corrupted JSON', () => {
    sessionStorage.setItem('activity_dedup', 'not-valid-json!!!');
    trackActivity(USER_A, 'login');
    expect(mockInsert).toHaveBeenCalledTimes(1);
  });
});
