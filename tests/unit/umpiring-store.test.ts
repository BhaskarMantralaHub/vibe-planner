import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { CricketPlayer, CricketUmpiringDuty, DutyStatus } from '@/types/cricket';

/* ── Supabase mock ──────────────────────────────────────────────────── */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockQuery: any = {};
const chainMethods = ['select', 'insert', 'update', 'delete', 'upsert', 'eq', 'is', 'in', 'order', 'limit'];
for (const m of chainMethods) mockQuery[m] = vi.fn().mockReturnValue(mockQuery);
mockQuery.maybeSingle = vi.fn().mockResolvedValue({ data: null, error: null });
// eslint-disable-next-line @typescript-eslint/no-explicit-any
mockQuery.then = vi.fn((resolve: any) => {
  resolve({ data: [], error: null });
  return Promise.resolve();
});

const mockRpc = vi.fn().mockResolvedValue({ data: 'ok', error: null });
const mockSupabase = { from: vi.fn().mockReturnValue(mockQuery), rpc: mockRpc };

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseClient: () => mockSupabase,
  isCloudMode: () => true,
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: { getState: () => ({ currentTeamId: 'team-1' }) },
}));

const toastCalls: string[] = [];
vi.mock('sonner', () => ({
  toast: Object.assign(
    (m: string) => { toastCalls.push(`plain:${m}`); },
    {
      success: (m: string) => { toastCalls.push(`success:${m}`); },
      error: (m: string) => { toastCalls.push(`error:${m}`); },
      warning: (m: string) => { toastCalls.push(`warning:${m}`); },
      loading: (m: string) => { toastCalls.push(`loading:${m}`); return 1; },
      dismiss: () => {},
    },
  ),
}));

import {
  useUmpiringStore,
  computeDutyStats,
  dutyStatFor,
  isLiveDuty,
  todayPT,
  DEFAULT_DUTY_TARGET,
  DUTY_CLAIM_MESSAGES,
} from '@/stores/umpiring-store';
import { useUIStore } from '@/stores/ui-store';

/* ── Fixtures ───────────────────────────────────────────────────────── */
let seq = 0;
const duty = (over: Partial<CricketUmpiringDuty> = {}): CricketUmpiringDuty => ({
  id: `duty-${++seq}`,
  team_id: 'team-1',
  season_id: 'season-1',
  cricclubs_fixture_id: 7000 + seq,
  role_slot: 1,
  match_date: '2026-09-12',
  match_time: '10:45',
  venue: 'Cordes Park',
  team_a: 'MTCA Falcons',
  team_b: 'MTCA Asuras',
  match_type: 'league',
  umpire_team_cricclubs_id: 1014,
  umpire_team_raw: 'MTCA Sunrisers Manteca',
  source: 'mtca',
  swap_team: null,
  assigned_player_id: null,
  assigned_player_name: null,
  assigned_by: null,
  assigned_at: null,
  status: 'open',
  cancelled_reason: null,
  completed_by: null,
  completed_at: null,
  notes: null,
  mtca_removed_at: null,
  deleted_at: null,
  deleted_by: null,
  created_at: '2026-08-01T00:00:00Z',
  updated_at: '2026-08-01T00:00:00Z',
  ...over,
});

const player = (over: Partial<CricketPlayer> = {}): CricketPlayer => ({
  id: 'p1',
  user_id: 'u1',
  name: 'Ravi',
  jersey_number: 7,
  phone: null,
  player_role: null,
  batting_style: null,
  bowling_style: null,
  cricclub_id: null,
  shirt_size: null,
  email: 'ravi@example.com',
  designation: null,
  photo_url: null,
  is_active: true,
  is_guest: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...over,
});

const assigned = (playerId: string, status: DutyStatus) =>
  duty({
    assigned_player_id: playerId,
    status,
    completed_at: status === 'completed' || status === 'no_show' ? '2026-09-12T18:00:00Z' : null,
  });

beforeEach(() => {
  toastCalls.length = 0;
  mockRpc.mockReset().mockResolvedValue({ data: 'ok', error: null });
  mockSupabase.from = vi.fn().mockReturnValue(mockQuery);
  useUmpiringStore.getState().reset();
  useUIStore.setState({ inflightCount: 0 });
});

/* ══════════════════════════════════════════════════════════════════════
 * computeDutyStats — the fairness maths
 * ════════════════════════════════════════════════════════════════════ */
describe('computeDutyStats', () => {
  const ravi = player({ id: 'p1', name: 'Ravi' });
  const akash = player({ id: 'p2', name: 'Akash', user_id: 'u2', email: 'a@e.com' });

  it('defaults to a target of 1', () => {
    expect(DEFAULT_DUTY_TARGET).toBe(1);
    const s = computeDutyStats([], [ravi]);
    expect(s.target).toBe(1);
  });

  it('counts a completed duty as done', () => {
    const s = computeDutyStats([assigned('p1', 'completed')], [ravi, akash]);
    expect(s.done).toBe(1);
    expect(s.open).toBe(1);
    expect(s.perPlayer.find((p) => p.player_id === 'p1')?.state).toBe('done');
  });

  it('does NOT count a no-show as done', () => {
    // The whole point of tracking no_show separately.
    const s = computeDutyStats([assigned('p1', 'no_show')], [ravi]);
    expect(s.done).toBe(0);
    expect(s.perPlayer[0]?.completed).toBe(0);
    expect(s.perPlayer[0]?.state).toBe('open');
  });

  it('does not use completed_at as the done criterion', () => {
    // The schema stamps completed_at for BOTH completed and no_show, so any
    // implementation filtering on it would credit this no-show as done.
    const noShow = assigned('p1', 'no_show');
    expect(noShow.completed_at).not.toBeNull();
    expect(computeDutyStats([noShow], [ravi]).done).toBe(0);
  });

  it('reports a live claim as "booked", not done and not open', () => {
    const s = computeDutyStats([assigned('p1', 'claimed')], [ravi, akash]);
    expect(s.booked).toBe(1);
    expect(s.done).toBe(0);
    expect(s.open).toBe(1); // akash only
    expect(s.perPlayer.find((p) => p.player_id === 'p1')?.state).toBe('booked');
  });

  it('ignores a cancelled duty even when it still names a player', () => {
    // chk_umpiring_assignment deliberately lets a cancelled duty keep its
    // assignee, so grouping without a status filter would count it.
    const d = duty({ assigned_player_id: 'p1', status: 'cancelled', cancelled_reason: 'admin' });
    const s = computeDutyStats([d], [ravi]);
    expect(s.done).toBe(0);
    expect(s.booked).toBe(0);
  });

  it('ignores a soft-deleted (handed-away) duty', () => {
    const d = duty({
      assigned_player_id: 'p1',
      status: 'completed',
      completed_at: '2026-09-12T18:00:00Z',
      deleted_at: '2026-09-13T00:00:00Z',
    });
    expect(computeDutyStats([d], [ravi]).done).toBe(0);
  });

  it('excludes guests from the target denominator', () => {
    const guest = player({ id: 'g1', name: 'Guest', is_guest: true, user_id: null });
    const s = computeDutyStats([], [ravi, guest]);
    expect(s.eligible).toBe(1);
    expect(s.perPlayer).toHaveLength(1);
  });

  it('lists a guest only when they actually took part', () => {
    const guest = player({ id: 'g1', name: 'Guest', is_guest: true, user_id: null });
    expect(computeDutyStats([], [ravi, guest]).guests).toHaveLength(0);
    const s = computeDutyStats([assigned('g1', 'completed')], [ravi, guest]);
    expect(s.guests).toHaveLength(1);
    expect(s.guests[0]?.completed).toBe(1);
    // ...and still out of the eligible count.
    expect(s.eligible).toBe(1);
  });

  it('excludes inactive players from the denominator', () => {
    const gone = player({ id: 'p3', name: 'Gone', is_active: false, user_id: 'u3' });
    expect(computeDutyStats([], [ravi, gone]).eligible).toBe(1);
  });

  it('needs target duties, not one, when the target is raised', () => {
    const one = computeDutyStats([assigned('p1', 'completed')], [ravi], 2);
    expect(one.done).toBe(0);
    expect(one.perPlayer[0]?.completed).toBe(1);

    const two = computeDutyStats(
      [assigned('p1', 'completed'), assigned('p1', 'completed')],
      [ravi],
      2,
    );
    expect(two.done).toBe(1);
  });

  it('treats a target of 0 as nobody being required to stand', () => {
    expect(computeDutyStats([], [ravi], 0).done).toBe(1);
  });

  it('counts two slots on one match as two completions', () => {
    const fixtureId = 8001;
    const s = computeDutyStats(
      [
        duty({ cricclubs_fixture_id: fixtureId, role_slot: 1, assigned_player_id: 'p1', status: 'completed', completed_at: 'x' }),
        duty({ cricclubs_fixture_id: fixtureId, role_slot: 2, assigned_player_id: 'p1', status: 'completed', completed_at: 'x' }),
      ],
      [ravi],
      2,
    );
    expect(s.perPlayer[0]?.completed).toBe(2);
    expect(s.done).toBe(1);
  });

  it('does not divide by zero on an empty roster', () => {
    const s = computeDutyStats([], []);
    expect(s.eligible).toBe(0);
    expect(s.perPlayer).toEqual([]);
  });

  it('attributes nothing when the player row was hard-deleted', () => {
    // assigned_player_id nulled by the FK, name snapshot retained.
    const orphan = duty({
      assigned_player_id: null,
      assigned_player_name: 'Departed Player',
      status: 'completed',
      completed_at: 'x',
    });
    const s = computeDutyStats([orphan], [ravi]);
    expect(s.done).toBe(0);
    expect(orphan.assigned_player_name).toBe('Departed Player');
  });

  it('counts unclaimed slots as openSlots', () => {
    const s = computeDutyStats(
      [duty(), duty(), assigned('p1', 'claimed')],
      [ravi],
    );
    expect(s.openSlots).toBe(2);
  });
});

describe('dutyStatFor', () => {
  const p = player({ id: 'p1', name: 'Venkat Subbu' });

  it('counts only completed duties as stood', () => {
    const stat = dutyStatFor(p, [
      duty({ assigned_player_id: 'p1', status: 'completed' }),
      duty({ assigned_player_id: 'p1', status: 'no_show' }),
      duty({ assigned_player_id: 'p1', status: 'claimed' }),
    ]);
    expect(stat.completed).toBe(1);
    expect(stat.booked).toBe(1);
  });

  it('ignores other players and unassigned slots', () => {
    const stat = dutyStatFor(p, [
      duty({ assigned_player_id: 'p2', status: 'completed' }),
      duty({ assigned_player_id: null, status: 'open' }),
    ]);
    expect(stat).toMatchObject({ completed: 0, booked: 0, state: 'open' });
  });

  it('ignores soft-deleted and cancelled duties that keep an assignee', () => {
    // Both traps at once: a swapped-away duty retains assigned_player_id, and a
    // handed-away one is only tombstoned.
    const stat = dutyStatFor(p, [
      duty({ assigned_player_id: 'p1', status: 'completed', deleted_at: '2026-08-01T00:00:00Z' }),
      duty({ assigned_player_id: 'p1', status: 'cancelled', cancelled_reason: 'admin' }),
    ]);
    expect(stat.completed).toBe(0);
    expect(stat.state).toBe('open');
  });

  it('reports the state against the target', () => {
    const done = duty({ assigned_player_id: 'p1', status: 'completed' });
    expect(dutyStatFor(p, [done], 1).state).toBe('done');
    expect(dutyStatFor(p, [done], 2).state).toBe('open');
    expect(dutyStatFor(p, [], 0).state).toBe('done');
  });

  /**
   * The reason this is exported at all: the per-player sheet can be opened from
   * a duty card for somebody computeDutyStats leaves out entirely.
   */
  it('works for a DEACTIVATED player, whom computeDutyStats omits', () => {
    const gone = player({ id: 'p9', name: 'Left Midseason', is_active: false });
    const duties = [duty({ assigned_player_id: 'p9', status: 'completed' })];

    const roster = computeDutyStats(duties, [gone], 1);
    expect(roster.perPlayer).toHaveLength(0);
    expect(roster.guests).toHaveLength(0);

    // ...but their own tally still resolves, so the sheet is never blank.
    expect(dutyStatFor(gone, duties, 1)).toMatchObject({ completed: 1, state: 'done' });
  });

  it('agrees with computeDutyStats for an active player', () => {
    // Guards the refactor: the roster grid and the single-player sheet must
    // never disagree about how many times somebody has stood.
    const active = player({ id: 'p1', name: 'Venkat Subbu' });
    const duties = [
      duty({ assigned_player_id: 'p1', status: 'completed' }),
      duty({ assigned_player_id: 'p1', status: 'claimed' }),
      duty({ assigned_player_id: 'p1', status: 'no_show' }),
      duty({ assigned_player_id: 'p1', status: 'cancelled', cancelled_reason: 'admin' }),
    ];
    const fromRoster = computeDutyStats(duties, [active], 1).perPlayer[0];
    expect(dutyStatFor(active, duties, 1)).toEqual(fromRoster);
  });
});

describe('isLiveDuty', () => {
  it('is false for soft-deleted and for cancelled', () => {
    expect(isLiveDuty(duty())).toBe(true);
    expect(isLiveDuty(duty({ deleted_at: 'x' }))).toBe(false);
    expect(isLiveDuty(duty({ status: 'cancelled', cancelled_reason: 'admin' }))).toBe(false);
  });
});

describe('todayPT', () => {
  it('returns a YYYY-MM-DD string', () => {
    expect(todayPT()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('is stable regardless of the machine timezone', () => {
    // Both sides of the claim check must agree on "today", or a travelling
    // user sees a Claim button the server rejects as 'past'.
    const a = todayPT();
    const expected = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Los_Angeles',
      year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    expect(a).toBe(expected);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * claimDuty / releaseDuty
 * ════════════════════════════════════════════════════════════════════ */
describe('claimDuty', () => {
  const seed = (d: CricketUmpiringDuty) => useUmpiringStore.setState({ duties: [d] });

  it('calls the RPC with the duty id and returns ok', async () => {
    const d = duty();
    seed(d);
    const result = await useUmpiringStore.getState().claimDuty(d.id);
    expect(result).toBe('ok');
    expect(mockRpc).toHaveBeenCalledWith('claim_umpiring_duty', { p_duty_id: d.id });
    expect(toastCalls.some((t) => t.startsWith('success:'))).toBe(true);
  });

  it.each([
    ['not_open'], ['past'], ['duplicate_slot'],
    ['no_player'], ['not_found'], ['not_member'], ['not_yours'],
  ])('surfaces %s with its own plain-language message', async (code) => {
    const d = duty();
    seed(d);
    mockRpc.mockResolvedValue({ data: code, error: null });
    const result = await useUmpiringStore.getState().claimDuty(d.id);
    expect(result).toBe(code);
    // Not an error toast — none of these is a malfunction.
    expect(toastCalls).toContain(`plain:${DUTY_CLAIM_MESSAGES[code as 'not_open']}`);
  });

  it('retries exactly once on locked, then succeeds', async () => {
    const d = duty();
    seed(d);
    mockRpc
      .mockResolvedValueOnce({ data: 'locked', error: null })
      .mockResolvedValueOnce({ data: 'ok', error: null });
    const result = await useUmpiringStore.getState().claimDuty(d.id);
    expect(result).toBe('ok');
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('gives up after one retry if still locked', async () => {
    const d = duty();
    seed(d);
    mockRpc.mockResolvedValue({ data: 'locked', error: null });
    const result = await useUmpiringStore.getState().claimDuty(d.id);
    expect(result).toBe('locked');
    expect(mockRpc).toHaveBeenCalledTimes(2);
  });

  it('never treats a transport error as success', async () => {
    const d = duty();
    seed(d);
    mockRpc.mockResolvedValue({ data: null, error: { message: 'network down' } });
    const result = await useUmpiringStore.getState().claimDuty(d.id);
    expect(result).not.toBe('ok');
  });

  it('fails closed on an unrecognised reason code', async () => {
    // A future schema returning a new code must not read as success.
    const d = duty();
    seed(d);
    mockRpc.mockResolvedValue({ data: 'some_future_code', error: null });
    const result = await useUmpiringStore.getState().claimDuty(d.id);
    expect(result).toBe('not_found');
  });

  it('clears pendingId even when the claim fails', async () => {
    const d = duty();
    seed(d);
    mockRpc.mockResolvedValue({ data: 'not_open', error: null });
    await useUmpiringStore.getState().claimDuty(d.id);
    expect(useUmpiringStore.getState().pendingId).toBeNull();
  });
});

describe('releaseDuty', () => {
  it('calls release_umpiring_duty and reports success', async () => {
    const d = duty({ status: 'claimed', assigned_player_id: 'p1' });
    useUmpiringStore.setState({ duties: [d] });
    const result = await useUmpiringStore.getState().releaseDuty(d.id);
    expect(result).toBe('ok');
    expect(mockRpc).toHaveBeenCalledWith('release_umpiring_duty', { p_duty_id: d.id });
  });

  it('explains not_yours without an error toast', async () => {
    const d = duty({ status: 'claimed', assigned_player_id: 'p9' });
    useUmpiringStore.setState({ duties: [d] });
    mockRpc.mockResolvedValue({ data: 'not_yours', error: null });
    const result = await useUmpiringStore.getState().releaseDuty(d.id);
    expect(result).toBe('not_yours');
    expect(toastCalls.some((t) => t.startsWith('error:'))).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Admin actions — the schema ties status and completed_at together
 * ════════════════════════════════════════════════════════════════════ */
describe('admin duty actions', () => {
  const seed = () => {
    const d = duty({ status: 'claimed', assigned_player_id: 'p1' });
    useUmpiringStore.setState({ duties: [d] });
    return d;
  };

  it('markCompleted sets status AND completed_at in one update', async () => {
    const d = seed();
    await useUmpiringStore.getState().markCompleted(d.id, 'Admin');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('completed');
    expect(patch.completed_at).toBeTruthy();
    expect(patch.completed_by).toBe('Admin');
  });

  it('markNoShow also stamps completed_at, as the constraint requires', async () => {
    const d = seed();
    await useUmpiringStore.getState().markNoShow(d.id, 'Admin');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('no_show');
    expect(patch.completed_at).toBeTruthy();
  });

  it('reopenDuty clears completed_at in the same update as the status', async () => {
    // Two sequential PATCHes would fail chk_umpiring_completed_at.
    const d = seed();
    await useUmpiringStore.getState().reopenDuty(d.id);
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('claimed');
    expect(patch.completed_at).toBeNull();
    expect(patch.completed_by).toBeNull();
  });

  it('cancelDuty always supplies a reason', async () => {
    const d = seed();
    await useUmpiringStore.getState().cancelDuty(d.id, 'mtca_removed');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('cancelled');
    expect(patch.cancelled_reason).toBe('mtca_removed');
  });

  it('clearAssignment returns the slot to open with no assignee left behind', async () => {
    const d = seed();
    await useUmpiringStore.getState().clearAssignment(d.id);
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('open');
    expect(patch.assigned_player_id).toBeNull();
    expect(patch.assigned_at).toBeNull();
  });

  it('deleteDuty soft-deletes rather than removing the row', async () => {
    const d = seed();
    await useUmpiringStore.getState().deleteDuty(d.id, 'Admin');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.deleted_at).toBeTruthy();
    expect(mockQuery.delete).not.toHaveBeenCalled();
  });

  it('restoreDuty clears the tombstone', async () => {
    const d = seed();
    await useUmpiringStore.getState().restoreDuty(d.id);
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.deleted_at).toBeNull();
  });

  it('scopes every update by team_id as well as id', async () => {
    const d = seed();
    await useUmpiringStore.getState().markCompleted(d.id, 'Admin');
    expect(mockQuery.eq).toHaveBeenCalledWith('team_id', 'team-1');
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * Offline swaps — a trade, not a deletion
 * ════════════════════════════════════════════════════════════════════ */
describe('swapAwayDuty', () => {
  const seed = () => {
    const d = duty({ status: 'claimed', assigned_player_id: 'p1' });
    useUmpiringStore.setState({ duties: [d] });
    return d;
  };

  it('cancels rather than soft-deleting, so the duty stays visible', async () => {
    // MTCA still lists us for the match; hiding it makes the app look stale.
    const d = seed();
    await useUmpiringStore.getState().swapAwayDuty(d.id, 'MTCA Power Stars', 'Admin');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('cancelled');
    expect(patch.deleted_at).toBeUndefined();
  });

  it('records which team took it and always supplies a reason', async () => {
    const d = seed();
    await useUmpiringStore.getState().swapAwayDuty(d.id, 'MTCA Power Stars', 'Admin');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.swap_team).toBe('MTCA Power Stars');
    // chk_umpiring_cancelled_reason requires it whenever status is cancelled.
    expect(patch.cancelled_reason).toBe('admin');
  });

  it('unassigns whoever was down for it — they are no longer going', async () => {
    const d = seed();
    await useUmpiringStore.getState().swapAwayDuty(d.id, '', 'Admin');
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.assigned_player_id).toBeNull();
    expect(patch.assigned_at).toBeNull();
  });

  it('accepts an empty team name as null rather than an empty string', async () => {
    const d = seed();
    await useUmpiringStore.getState().swapAwayDuty(d.id, '', 'Admin');
    expect(mockQuery.update.mock.calls.at(-1)?.[0].swap_team).toBeNull();
  });
});

describe('undoSwap', () => {
  it('clears cancelled_reason in the SAME update as the status', async () => {
    // Leaving the reason behind while setting status='open' violates
    // chk_umpiring_cancelled_reason, which requires reason exactly when
    // cancelled. This is the whole point of a dedicated action.
    const d = duty({ status: 'cancelled', cancelled_reason: 'admin', swap_team: 'X' });
    useUmpiringStore.setState({ duties: [d] });
    await useUmpiringStore.getState().undoSwap(d.id);
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.status).toBe('open');
    expect(patch.cancelled_reason).toBeNull();
    expect(patch.swap_team).toBeNull();
  });

  it('leaves the slot genuinely open, with no assignee residue', async () => {
    const d = duty({ status: 'cancelled', cancelled_reason: 'admin', assigned_player_id: 'p1' });
    useUmpiringStore.setState({ duties: [d] });
    await useUmpiringStore.getState().undoSwap(d.id);
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    // chk_umpiring_assignment: an 'open' duty must have no player and no
    // assigned_at.
    expect(patch.assigned_player_id).toBeNull();
    expect(patch.assigned_at).toBeNull();
  });
});

describe('addSlotToMatch', () => {
  it('clones the match facts so the admin retypes nothing', async () => {
    const src = duty({ role_slot: 1, venue: 'Altamont Park', match_time: '11:30' });
    useUmpiringStore.setState({ duties: [src] });
    await useUmpiringStore.getState().addSlotToMatch(src.id, 'MTCA Power Stars');
    const row = mockQuery.insert.mock.calls.at(-1)?.[0];
    expect(row.match_date).toBe(src.match_date);
    expect(row.match_time).toBe('11:30');
    expect(row.venue).toBe('Altamont Park');
    expect(row.team_a).toBe(src.team_a);
    expect(row.cricclubs_fixture_id).toBe(src.cricclubs_fixture_id);
  });

  it('takes the next free slot number', async () => {
    const src = duty({ role_slot: 1 });
    useUmpiringStore.setState({ duties: [src] });
    await useUmpiringStore.getState().addSlotToMatch(src.id, '');
    expect(mockQuery.insert.mock.calls.at(-1)?.[0].role_slot).toBe(2);
  });

  it('skips slots already used on that match, cancelled ones included', async () => {
    // A cancelled slot still occupies its number under the unique index.
    const fixtureId = 9001;
    const s1 = duty({ cricclubs_fixture_id: fixtureId, role_slot: 1 });
    const s2 = duty({ cricclubs_fixture_id: fixtureId, role_slot: 2, status: 'cancelled', cancelled_reason: 'admin' });
    useUmpiringStore.setState({ duties: [s1, s2] });
    await useUmpiringStore.getState().addSlotToMatch(s1.id, '');
    expect(mockQuery.insert.mock.calls.at(-1)?.[0].role_slot).toBe(3);
  });

  it('marks the new slot as a swap-in, which also hides it from the sync', async () => {
    const src = duty({ role_slot: 1 });
    useUmpiringStore.setState({ duties: [src] });
    await useUmpiringStore.getState().addSlotToMatch(src.id, 'MTCA Asuras');
    const row = mockQuery.insert.mock.calls.at(-1)?.[0];
    expect(row.source).toBe('swap_in');
    expect(row.swap_team).toBe('MTCA Asuras');
    expect(row.status).toBe('open');
  });

  it('refuses when all four slots are taken instead of writing a bad row', async () => {
    const fixtureId = 9002;
    const rows = [1, 2, 3, 4].map((n) => duty({ cricclubs_fixture_id: fixtureId, role_slot: n }));
    useUmpiringStore.setState({ duties: rows });
    mockQuery.insert.mockClear();
    await useUmpiringStore.getState().addSlotToMatch(rows[0]!.id, '');
    expect(mockQuery.insert).not.toHaveBeenCalled();
    expect(toastCalls.some((t) => t.startsWith('error:'))).toBe(true);
  });

  it('does nothing when the source duty is not in state', async () => {
    useUmpiringStore.setState({ duties: [] });
    mockQuery.insert.mockClear();
    await useUmpiringStore.getState().addSlotToMatch('missing-id', '');
    expect(mockQuery.insert).not.toHaveBeenCalled();
  });
});

describe('addManualDuty', () => {
  const base = {
    match_date: '2026-10-04',
    match_time: '09:00',
    venue: 'Hansen Park',
    team_a: 'MTCA Falcons',
    team_b: 'MTCA Asuras',
    role_slot: 1 as const,
    notes: null,
    match_type: 'league' as const,
  };

  it('marks a duty taken over from another club as swap_in', async () => {
    await useUmpiringStore.getState().addManualDuty('season-1', { ...base, swap_team: 'MTCA Power Stars' });
    const row = mockQuery.insert.mock.calls.at(-1)?.[0];
    expect(row.source).toBe('swap_in');
    expect(row.swap_team).toBe('MTCA Power Stars');
    expect(row.cricclubs_fixture_id).toBeNull();
  });

  it('marks an admin-invented duty as manual', async () => {
    await useUmpiringStore.getState().addManualDuty('season-1', { ...base, swap_team: null });
    const row = mockQuery.insert.mock.calls.at(-1)?.[0];
    expect(row.source).toBe('manual');
  });

  it('creates the slot open, with no assignee', async () => {
    await useUmpiringStore.getState().addManualDuty('season-1', { ...base, swap_team: null });
    const row = mockQuery.insert.mock.calls.at(-1)?.[0];
    expect(row.status).toBe('open');
    expect(row.assigned_player_id).toBeUndefined();
  });
});

describe('updateDuty', () => {
  const seed = () => {
    const d = duty({ status: 'claimed', assigned_player_id: 'p1' });
    useUmpiringStore.setState({ duties: [d] });
    return d;
  };

  it('writes the edited date, time and venue', async () => {
    const d = seed();
    await useUmpiringStore.getState().updateDuty(d.id, {
      match_date: '2026-09-06',
      match_time: '14:30',
      venue: 'Cordes Park',
      team_a: 'MTCA A',
      team_b: 'MTCA B',
      match_type: 'league',
      swap_team: null,
      notes: null,
    });
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch.match_date).toBe('2026-09-06');
    expect(patch.match_time).toBe('14:30');
    expect(patch.venue).toBe('Cordes Park');
  });

  it('never touches status or assignment', async () => {
    // A details edit must not be able to un-complete a duty or drop its
    // umpire — those changes have their own actions with their own rules.
    const d = seed();
    await useUmpiringStore.getState().updateDuty(d.id, {
      match_date: '2026-09-06',
      match_time: null,
      venue: null,
      team_a: 'MTCA A',
      team_b: 'MTCA B',
      match_type: null,
      swap_team: null,
      notes: null,
    });
    const patch = mockQuery.update.mock.calls.at(-1)?.[0];
    expect(patch).not.toHaveProperty('status');
    expect(patch).not.toHaveProperty('assigned_player_id');
    expect(patch).not.toHaveProperty('completed_at');
    expect(patch).not.toHaveProperty('deleted_at');
    expect(patch).not.toHaveProperty('role_slot');
  });

  it('scopes the update by team_id as well as id', async () => {
    const d = seed();
    await useUmpiringStore.getState().updateDuty(d.id, {
      match_date: '2026-09-06', match_time: null, venue: null,
      team_a: 'A', team_b: 'B', match_type: null, swap_team: null, notes: null,
    });
    expect(mockQuery.eq).toHaveBeenCalledWith('team_id', 'team-1');
  });

  it('updates EVERY slot on the match, not just the one edited', async () => {
    // Each row stores its own copy of the match facts, so patching one would
    // leave the sibling slot showing the old time — one match, two times.
    const fixtureId = 5944;
    const s1 = duty({ cricclubs_fixture_id: fixtureId, role_slot: 1, match_time: '11:30' });
    const s2 = duty({ cricclubs_fixture_id: fixtureId, role_slot: 2, match_time: '11:30' });
    const other = duty({ cricclubs_fixture_id: 9999, role_slot: 1 });
    useUmpiringStore.setState({ duties: [s1, s2, other] });

    await useUmpiringStore.getState().updateDuty(s1.id, {
      match_date: s1.match_date, match_time: '13:00', venue: 'Cordes Park',
      team_a: s1.team_a, team_b: s1.team_b, match_type: 'league',
      swap_team: null, notes: null,
    });

    const ids = mockQuery.in.mock.calls.at(-1)?.[1];
    expect(ids).toContain(s1.id);
    expect(ids).toContain(s2.id);
    // A different match must not be dragged along.
    expect(ids).not.toContain(other.id);
  });

  it('groups manual duties by date and teams, since they have no fixture id', async () => {
    const a = duty({ cricclubs_fixture_id: null, role_slot: 1, source: 'manual' });
    const b = duty({ cricclubs_fixture_id: null, role_slot: 2, source: 'manual' });
    useUmpiringStore.setState({ duties: [a, b] });
    await useUmpiringStore.getState().updateDuty(a.id, {
      match_date: a.match_date, match_time: '09:00', venue: null,
      team_a: a.team_a, team_b: a.team_b, match_type: null, swap_team: null, notes: null,
    });
    const ids = mockQuery.in.mock.calls.at(-1)?.[1];
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
  });

  it('excludes removed slots from the update', async () => {
    const fixtureId = 4242;
    const live = duty({ cricclubs_fixture_id: fixtureId, role_slot: 1 });
    const gone = duty({ cricclubs_fixture_id: fixtureId, role_slot: 2, deleted_at: 'x' });
    useUmpiringStore.setState({ duties: [live, gone] });
    await useUmpiringStore.getState().updateDuty(live.id, {
      match_date: live.match_date, match_time: '09:00', venue: null,
      team_a: live.team_a, team_b: live.team_b, match_type: null, swap_team: null, notes: null,
    });
    const ids = mockQuery.in.mock.calls.at(-1)?.[1];
    expect(ids).toContain(live.id);
    expect(ids).not.toContain(gone.id);
  });
});

describe('setDutyTarget', () => {
  it('upserts on season_id', async () => {
    await useUmpiringStore.getState().setDutyTarget('season-1', 2);
    const [row, opts] = mockQuery.upsert.mock.calls.at(-1) ?? [];
    expect(row.duty_target).toBe(2);
    expect(row.season_id).toBe('season-1');
    expect(opts.onConflict).toBe('season_id');
  });
});

/* ══════════════════════════════════════════════════════════════════════
 * loadDuties — the TopProgressBar contract
 * ════════════════════════════════════════════════════════════════════ */
describe('loadDuties', () => {
  it('balances beginLoad/endLoad on success', async () => {
    await useUmpiringStore.getState().loadDuties('season-1');
    expect(useUIStore.getState().inflightCount).toBe(0);
  });

  it('balances beginLoad/endLoad when the query throws', async () => {
    // Without the try/finally, the progress bar would spin forever.
    mockSupabase.from = vi.fn().mockImplementation(() => { throw new Error('boom'); });
    await expect(useUmpiringStore.getState().loadDuties('season-1')).rejects.toThrow('boom');
    expect(useUIStore.getState().inflightCount).toBe(0);
  });

  it('stops showing the skeleton after a query error', async () => {
    mockSupabase.from = vi.fn().mockReturnValue({
      ...mockQuery,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      then: (resolve: any) => { resolve({ data: null, error: { message: 'nope' } }); return Promise.resolve(); },
    });
    await useUmpiringStore.getState().loadDuties('season-1');
    expect(useUmpiringStore.getState().loading).toBe(false);
  });

  it('defaults the target to 1 when the season has no settings row', () => {
    const { settings } = useUmpiringStore.getState();
    const target = settings?.duty_target ?? DEFAULT_DUTY_TARGET;
    expect(target).toBe(1);
  });
});
