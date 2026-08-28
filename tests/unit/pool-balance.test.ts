import { describe, it, expect } from 'vitest';
import {
  computePoolBalance,
  computeCarriedForward,
  computeSeasonPool,
  type SeasonLike,
  type SeasonMoney,
} from '@/app/(tools)/cricket/lib/utils';

const fee = (amount_paid: number | string) => ({ amount_paid });
const amt = (amount: number | string) => ({ amount });

describe('computePoolBalance', () => {
  it('adds opening balance, fees and sponsorships, then subtracts expenses', () => {
    const r = computePoolBalance({
      openingBalance: 250,
      fees: [fee(60), fee(60), fee(30)],
      sponsors: [amt(420)],
      expenses: [amt(1266.79)],
    });

    expect(r.openingBalance).toBe(250);
    expect(r.feesCollected).toBe(150);
    expect(r.sponsorshipsCollected).toBe(420);
    expect(r.totalIn).toBe(820);
    expect(r.totalSpent).toBe(1266.79);
    expect(r.balance).toBeCloseTo(-446.79, 2);
  });

  /**
   * The bug this function exists to kill. The WhatsApp text share computed
   * `fees − expenses` while the share image computed `(fees + sponsors) −
   * expenses`, so the two printed different balances for the same season —
   * under-reporting by the sponsorship total.
   */
  it('never loses sponsorships', () => {
    const withSponsors = computePoolBalance({
      fees: [fee(1080)], sponsors: [amt(420)], expenses: [amt(1266.79)],
    });
    const withoutSponsors = computePoolBalance({
      fees: [fee(1080)], sponsors: [], expenses: [amt(1266.79)],
    });

    expect(withSponsors.balance - withoutSponsors.balance).toBeCloseTo(420, 2);
    // Spring 2026's real figures: the number that must appear everywhere.
    expect(withSponsors.balance).toBeCloseTo(233.21, 2);
  });

  it('counts the opening balance exactly ONCE', () => {
    // The other way to get this wrong: adding it to totalIn AND again to the
    // balance, which double-counts carried-forward money.
    const base = computePoolBalance({ fees: [fee(100)], sponsors: [], expenses: [] });
    const carried = computePoolBalance({
      openingBalance: 250, fees: [fee(100)], sponsors: [], expenses: [],
    });

    expect(carried.balance - base.balance).toBe(250);
    expect(carried.totalIn).toBe(350);
    expect(carried.balance).toBe(350);
  });

  it('reproduces the pre-migration number when the opening balance is absent', () => {
    // Guarantees the change was invisible on every existing season, where
    // opening_balance is 0 or null.
    const legacy = { fees: [fee(1080)], sponsors: [amt(420)], expenses: [amt(1266.79)] };
    const expected = 233.21;

    expect(computePoolBalance(legacy).balance).toBeCloseTo(expected, 2);
    expect(computePoolBalance({ ...legacy, openingBalance: 0 }).balance).toBeCloseTo(expected, 2);
    // Nullable on purpose — restore.yml rebuilds rows without column defaults.
    expect(computePoolBalance({ ...legacy, openingBalance: null }).balance).toBeCloseTo(expected, 2);
    expect(computePoolBalance({ ...legacy, openingBalance: undefined }).balance).toBeCloseTo(expected, 2);
  });

  it('coerces the strings PostgREST sends for NUMERIC columns', () => {
    // Postgres NUMERIC arrives as a string. Unguarded, '60' + '60' is '6060'.
    const r = computePoolBalance({
      openingBalance: '250' as unknown as number,
      fees: [fee('60'), fee('60')],
      sponsors: [amt('100.50')],
      expenses: [amt('10.25')],
    });

    expect(r.feesCollected).toBe(120);
    expect(r.totalIn).toBe(470.5);
    expect(r.balance).toBeCloseTo(460.25, 2);
  });

  it('reports a deficit rather than clamping at zero', () => {
    // A team that has overspent genuinely is in the red; hiding it would be
    // the one thing worse than showing it.
    const r = computePoolBalance({ fees: [fee(100)], sponsors: [], expenses: [amt(400)] });
    expect(r.balance).toBe(-300);
  });

  it('carries a negative opening balance through', () => {
    // A season can start in deficit if the previous one closed there.
    const r = computePoolBalance({ openingBalance: -80, fees: [fee(100)], sponsors: [], expenses: [] });
    expect(r.balance).toBe(20);
  });

  it('is all zeroes for a season with nothing recorded', () => {
    const r = computePoolBalance({ fees: [], sponsors: [], expenses: [] });
    expect(r).toEqual({
      openingBalance: 0,
      feesCollected: 0,
      sponsorshipsCollected: 0,
      totalIn: 0,
      totalSpent: 0,
      balance: 0,
    });
  });

  it('treats a partial fee payment as exactly what was paid', () => {
    // Fees are amount_paid, not the season fee — a $30 part-payment adds $30.
    const r = computePoolBalance({
      fees: [fee(60), fee(30)], sponsors: [], expenses: [],
    });
    expect(r.feesCollected).toBe(90);
  });
});

/* ── Carrying money between seasons ─────────────────────────────────────── */

const SPRING: SeasonLike = {
  id: 'spring', name: '2026 MTCA Spring League', year: 2026, season_type: 'spring',
  // Null: the first season on record, so nothing carried IN to it.
  opening_balance: null,
};
const FALL: SeasonLike = {
  id: 'fall', name: '2026 MTCA Fall League', year: 2026, season_type: 'fall',
  // Null: not frozen, so it should track Spring live.
  opening_balance: null,
};
const SEASONS = [SPRING, FALL];

/** Spring: 1080 fees + 420 sponsors − 1266.79 expenses = 233.21 left. */
const money = (extraSpringExpense = 0): SeasonMoney => ({
  fees: [{ season_id: 'spring', amount_paid: 1080 }],
  sponsors: [{ season_id: 'spring', amount: 420 }],
  expenses: [
    { season_id: 'spring', amount: 1266.79 },
    ...(extraSpringExpense ? [{ season_id: 'spring', amount: extraSpringExpense }] : []),
  ],
});

describe('computeCarriedForward', () => {
  it('derives the figure LIVE from the previous season while unfrozen', () => {
    const c = computeCarriedForward('fall', SEASONS, money());
    expect(c.amount).toBeCloseTo(233.21, 2);
    expect(c.fromSeasonName).toBe('2026 MTCA Spring League');
    expect(c.live).toBe(true);
  });

  /**
   * The reason it is live rather than a snapshot: Spring is mid-playoffs. A
   * figure frozen today would be wrong the moment the semi-final ground is paid
   * for, and nobody would notice it had gone stale.
   */
  it('MOVES when more of the previous season is spent', () => {
    const before = computeCarriedForward('fall', SEASONS, money());
    const after = computeCarriedForward('fall', SEASONS, money(100));

    expect(before.amount - after.amount).toBeCloseTo(100, 2);
    expect(after.amount).toBeCloseTo(133.21, 2);
  });

  it('stops moving once frozen by an explicit opening balance', () => {
    const frozen = [SPRING, { ...FALL, opening_balance: 233.21 }];
    const a = computeCarriedForward('fall', frozen, money());
    const b = computeCarriedForward('fall', frozen, money(500));

    expect(a.amount).toBeCloseTo(233.21, 2);
    // Spending another $500 of Spring's money no longer rewrites Fall.
    expect(b.amount).toBeCloseTo(233.21, 2);
    expect(b.live).toBe(false);
    // Still names where it came from, so the entry can be labelled.
    expect(b.fromSeasonName).toBe('2026 MTCA Spring League');
  });

  it('treats a frozen ZERO as frozen, not as unset', () => {
    // The distinction that a `|| 0` fallback would destroy: an admin recording
    // "nothing carried over" must not silently re-derive a live figure.
    const frozen = [SPRING, { ...FALL, opening_balance: 0 }];
    const c = computeCarriedForward('fall', frozen, money());
    expect(c.amount).toBe(0);
    expect(c.live).toBe(false);
  });

  it('carries nothing into the earliest season', () => {
    const c = computeCarriedForward('spring', SEASONS, money());
    expect(c.amount).toBe(0);
    expect(c.fromSeasonName).toBeNull();
  });

  it('orders seasons chronologically, spring → summer → fall', () => {
    const summer: SeasonLike = {
      id: 'summer', name: 'Summer 2026', year: 2026, season_type: 'summer', opening_balance: null,
    };
    const c = computeCarriedForward('fall', [SPRING, summer, FALL], money());
    // Fall's predecessor is Summer, not Spring, even though Spring holds the money.
    expect(c.fromSeasonName).toBe('Summer 2026');
  });

  it('crosses a year boundary', () => {
    const nextSpring: SeasonLike = {
      id: 'spring27', name: 'Spring 2027', year: 2027, season_type: 'spring', opening_balance: null,
    };
    const c = computeCarriedForward('spring27', [SPRING, FALL, nextSpring], money());
    expect(c.fromSeasonName).toBe('2026 MTCA Fall League');
  });

  it('carries a deficit forward rather than clamping at zero', () => {
    const overspent: SeasonMoney = {
      fees: [{ season_id: 'spring', amount_paid: 100 }],
      sponsors: [],
      expenses: [{ season_id: 'spring', amount: 400 }],
    };
    const c = computeCarriedForward('fall', SEASONS, overspent);
    expect(c.amount).toBe(-300);
  });

  it('returns zero for an unknown season rather than throwing', () => {
    const c = computeCarriedForward('nope', SEASONS, money());
    expect(c).toEqual({ amount: 0, fromSeasonName: null, live: false });
  });
});

describe('computeSeasonPool', () => {
  it('chains three seasons through to the newest', () => {
    // Spring leaves 233.21 → Summer adds 60, spends 33.21 → Fall starts at 260.
    const summer: SeasonLike = {
      id: 'summer', name: 'Summer 2026', year: 2026, season_type: 'summer', opening_balance: null,
    };
    const m: SeasonMoney = {
      fees: [
        { season_id: 'spring', amount_paid: 1080 },
        { season_id: 'summer', amount_paid: 60 },
      ],
      sponsors: [{ season_id: 'spring', amount: 420 }],
      expenses: [
        { season_id: 'spring', amount: 1266.79 },
        { season_id: 'summer', amount: 33.21 },
      ],
    };

    expect(computeSeasonPool('summer', [SPRING, summer, FALL], m).balance).toBeCloseTo(260, 2);
    expect(computeSeasonPool('fall', [SPRING, summer, FALL], m).carried.amount).toBeCloseTo(260, 2);
  });

  it('includes the carried figure in the season balance exactly once', () => {
    const p = computeSeasonPool('fall', SEASONS, {
      ...money(),
      fees: [...money().fees, { season_id: 'fall', amount_paid: 60 }],
    });
    // 233.21 carried + 60 collected, nothing spent.
    expect(p.openingBalance).toBeCloseTo(233.21, 2);
    expect(p.balance).toBeCloseTo(293.21, 2);
  });

  it('does not let one season see another season’s money', () => {
    const m: SeasonMoney = {
      fees: [{ season_id: 'fall', amount_paid: 999 }],
      sponsors: [],
      expenses: [],
    };
    // Spring is earliest and has no rows of its own here.
    expect(computeSeasonPool('spring', SEASONS, m).balance).toBe(0);
  });

  it('survives a self-referential season without hanging', () => {
    // Defensive: a malformed chain must terminate, not recurse forever.
    const loop: SeasonLike[] = [
      { id: 'a', name: 'A', year: 2026, season_type: 'fall', opening_balance: null },
      { id: 'b', name: 'B', year: 2026, season_type: 'fall', opening_balance: null },
    ];
    expect(() => computeSeasonPool('a', loop, money())).not.toThrow();
  });
});
