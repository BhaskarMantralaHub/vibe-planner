import { describe, it, expect } from 'vitest';
import {
  computeSettlements,
  personalBalances,
  toCents,
  formatCents,
} from '@/app/(tools)/cricket/lib/settlement';
import type {
  CricketSplit,
  CricketSplitShare,
  CricketSplitSettlement,
} from '@/types/cricket';

// ── fixtures ────────────────────────────────────────────────────────────────

let seq = 0;
const uid = (label: string) => `${label}`;

function split(id: string, paidBy: string, amount: number, deleted = false): CricketSplit {
  return {
    id, team_id: 'team-1', season_id: 'season-1', paid_by: paidBy,
    category: 'food', description: `split ${id}`, amount,
    split_date: '2026-08-01', receipt_urls: null, created_by: null,
    deleted_at: deleted ? '2026-08-02T00:00:00Z' : null, deleted_by: null,
    created_at: '2026-08-01T00:00:00Z', updated_at: '2026-08-01T00:00:00Z',
  } as CricketSplit;
}

function share(splitId: string, playerId: string, amount: number): CricketSplitShare {
  return { id: `sh-${seq++}`, split_id: splitId, player_id: playerId, share_amount: amount };
}

function settlement(from: string, to: string, amount: number): CricketSplitSettlement {
  return {
    id: `st-${seq++}`, team_id: 'team-1', season_id: 'season-1',
    from_player: from, to_player: to, amount, settled_date: '2026-08-15',
    created_at: '2026-08-15T00:00:00Z',
  };
}

/** The invariant the whole report rests on: money in equals money out. */
function expectReconciled(rows: { fromId: string; toId: string; amountCents: number }[]) {
  const owed = new Map<string, number>();
  for (const r of rows) {
    owed.set(r.fromId, (owed.get(r.fromId) ?? 0) - r.amountCents);
    owed.set(r.toId, (owed.get(r.toId) ?? 0) + r.amountCents);
  }
  const sum = [...owed.values()].reduce((a, b) => a + b, 0);
  expect(sum).toBe(0);
  const debtors = rows.reduce((s, r) => s + r.amountCents, 0);
  const creditors = [...owed.values()].filter((v) => v > 0).reduce((a, b) => a + b, 0);
  const debtorTotal = [...owed.values()].filter((v) => v < 0).reduce((a, b) => a + Math.abs(b), 0);
  expect(creditors).toBe(debtorTotal);
  expect(debtors).toBeGreaterThanOrEqual(creditors);
}

// ── money precision ─────────────────────────────────────────────────────────

describe('money is exact', () => {
  it('converts NUMERIC(10,2) values to cents without drift', () => {
    expect(toCents(58.57)).toBe(5857);
    expect(toCents(0.1)).toBe(10);
    expect(toCents(0.7)).toBe(70);
    expect(toCents('23.93')).toBe(2393);
    expect(toCents(null)).toBe(0);
    expect(toCents(undefined)).toBe(0);
  });

  it('survives the classic float traps', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in floats. In cents it is just 30.
    expect(toCents(0.1) + toCents(0.2)).toBe(30);
    // A third of a dollar three ways, the way computeSplitAmounts does it.
    expect(toCents(0.34) + toCents(0.33) + toCents(0.33)).toBe(100);
  });

  it('formats cents as money', () => {
    expect(formatCents(5857)).toBe('$58.57');
    expect(formatCents(100)).toBe('$1.00');
    expect(formatCents(5)).toBe('$0.05');
    expect(formatCents(0)).toBe('$0.00');
  });

  it('reconciles a 3-way split of an odd amount to the exact cent', () => {
    // $100 three ways = 33.34 / 33.33 / 33.33
    const splits = [split('s1', 'A', 100)];
    const shares = [
      share('s1', 'A', 33.34), share('s1', 'B', 33.33), share('s1', 'C', 33.33),
    ];
    const led = computeSettlements(splits, shares, []);
    expect(led.totalCents).toBe(6666);
    expectReconciled(led.rows);
  });
});

// ── core shapes (§39.1-4) ───────────────────────────────────────────────────

describe('settlement shapes', () => {
  it('1. one debtor, one creditor', () => {
    const led = computeSettlements(
      [split('s1', 'A', 100)],
      [share('s1', 'A', 50), share('s1', 'B', 50)],
      [],
    );
    expect(led.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 5000 }]);
    expect(led.involvedIds.sort()).toEqual(['A', 'B']);
    expectReconciled(led.rows);
  });

  it('2. one debtor, multiple creditors', () => {
    const led = computeSettlements(
      [split('s1', 'B', 60), split('s2', 'C', 40)],
      [share('s1', 'A', 60), share('s2', 'A', 40)],
      [],
    );
    expect(led.rows).toEqual([
      { fromId: 'A', toId: 'B', amountCents: 6000 },
      { fromId: 'A', toId: 'C', amountCents: 4000 },
    ]);
    expect(led.totalCents).toBe(10000);
    expectReconciled(led.rows);
  });

  it('3. multiple debtors, one creditor', () => {
    const led = computeSettlements(
      [split('s1', 'A', 90)],
      [share('s1', 'B', 60), share('s1', 'C', 30)],
      [],
    );
    expect(led.rows).toEqual([
      { fromId: 'B', toId: 'A', amountCents: 6000 },
      { fromId: 'C', toId: 'A', amountCents: 3000 },
    ]);
    expectReconciled(led.rows);
  });

  it('4. multiple debtors, multiple creditors', () => {
    const led = computeSettlements(
      [split('s1', 'A', 100), split('s2', 'B', 50)],
      [
        share('s1', 'B', 25), share('s1', 'C', 25), share('s1', 'D', 50),
        share('s2', 'C', 25), share('s2', 'D', 25),
      ],
      [],
    );
    // B owes A 25 but A owes B nothing; C owes A 25 and B 25; D owes A 50 and B 25.
    // Equal amounts tie-break on payer name, so the four 2500s run B,C,C,D.
    expect(led.rows).toEqual([
      { fromId: 'D', toId: 'A', amountCents: 5000 },
      { fromId: 'B', toId: 'A', amountCents: 2500 },
      { fromId: 'C', toId: 'A', amountCents: 2500 },
      { fromId: 'C', toId: 'B', amountCents: 2500 },
      { fromId: 'D', toId: 'B', amountCents: 2500 },
    ]);
    expectReconciled(led.rows);
  });

  it('nets two people who each paid for the other', () => {
    const led = computeSettlements(
      [split('s1', 'A', 100), split('s2', 'B', 60)],
      [share('s1', 'B', 100), share('s2', 'A', 60)],
      [],
    );
    // B owes A 100, A owes B 60 -> one row of 40.
    expect(led.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 4000 }]);
    expectReconciled(led.rows);
  });
});

// ── settlements (§39.6-8) ───────────────────────────────────────────────────

describe('settlements are never double counted', () => {
  it('7. partial settlement reduces the debt', () => {
    const led = computeSettlements(
      [split('s1', 'B', 100)],
      [share('s1', 'A', 100)],
      [settlement('A', 'B', 40)],
    );
    expect(led.rows).toEqual([{ fromId: 'A', toId: 'B', amountCents: 6000 }]);
  });

  it('6. a fully settled debt disappears entirely', () => {
    const led = computeSettlements(
      [split('s1', 'B', 100)],
      [share('s1', 'A', 100)],
      [settlement('A', 'B', 100)],
    );
    expect(led.rows).toEqual([]);
    expect(led.totalCents).toBe(0);
    expect(led.involvedIds).toEqual([]);
  });

  it('8. multiple settlements against one debt accumulate', () => {
    const led = computeSettlements(
      [split('s1', 'B', 100)],
      [share('s1', 'A', 100)],
      [settlement('A', 'B', 30), settlement('A', 'B', 25), settlement('A', 'B', 20)],
    );
    expect(led.rows).toEqual([{ fromId: 'A', toId: 'B', amountCents: 2500 }]);
  });

  it('overpaying flips the direction rather than going negative', () => {
    const led = computeSettlements(
      [split('s1', 'B', 100)],
      [share('s1', 'A', 100)],
      [settlement('A', 'B', 150)],
    );
    expect(led.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 5000 }]);
    expectReconciled(led.rows);
  });

  it('a settlement between people with no shared split creates a debt the other way', () => {
    // Recording a payment nobody owed is a data-entry mistake, but it must not
    // vanish silently — the money moved.
    const led = computeSettlements([], [], [settlement('A', 'B', 25)]);
    expect(led.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 2500 }]);
  });
});

// ── zero / empty (§39.5, §39.15) ────────────────────────────────────────────

describe('zero and empty states', () => {
  it('5. all-square produces no rows at all', () => {
    const led = computeSettlements(
      [split('s1', 'A', 50), split('s2', 'B', 50)],
      [share('s1', 'B', 50), share('s2', 'A', 50)],
      [],
    );
    expect(led.rows).toEqual([]);
    expect(led.involvedIds).toEqual([]);
    expect(led.totalCents).toBe(0);
  });

  it('15. never emits a zero-value row', () => {
    const led = computeSettlements(
      [split('s1', 'A', 30)],
      [share('s1', 'B', 30)],
      [settlement('B', 'A', 30)],
    );
    expect(led.rows.every((r) => r.amountCents > 0)).toBe(true);
    expect(led.rows).toEqual([]);
  });

  it('handles no data at all', () => {
    const led = computeSettlements([], [], []);
    expect(led).toEqual({ rows: [], involvedIds: [], totalCents: 0 });
  });

  it("ignores a payer's own share of the split they paid", () => {
    const led = computeSettlements(
      [split('s1', 'A', 100)],
      [share('s1', 'A', 50), share('s1', 'B', 50)],
      [],
    );
    expect(led.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 5000 }]);
  });
});

// ── deleted splits ──────────────────────────────────────────────────────────

describe('deleted splits', () => {
  it('excludes soft-deleted splits even though their shares survive', () => {
    const led = computeSettlements(
      [split('s1', 'A', 100, true)],
      [share('s1', 'B', 100)],
      [],
    );
    expect(led.rows).toEqual([]);
  });

  it('ignores orphan shares whose split is not in the season', () => {
    const led = computeSettlements(
      [split('s1', 'A', 10)],
      [share('s1', 'B', 10), share('other-split', 'C', 999)],
      [],
    );
    expect(led.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 1000 }]);
  });
});

// ── members involved (§8) ───────────────────────────────────────────────────

describe('members involved counts only people with an outstanding balance', () => {
  it('excludes squared-up members from the involved list', () => {
    const led = computeSettlements(
      [split('s1', 'A', 90), split('s2', 'C', 20)],
      [
        share('s1', 'B', 30), share('s1', 'C', 30), share('s1', 'D', 30),
        share('s2', 'A', 20),
      ],
      [settlement('D', 'A', 30)],
    );
    // D settled in full, so D is not involved. C owes A 30 less the 20 A owes
    // C, so C stays in at 10. A/B/C remain.
    expect(led.involvedIds).not.toContain('D');
    expect(led.involvedIds.sort()).toEqual(['A', 'B', 'C']);
  });
});

// ── inactive players (§39.13) ───────────────────────────────────────────────

describe('inactive players', () => {
  it('13. keeps an outstanding balance for someone who has left', () => {
    // The engine works on ids only — it has no concept of active. Roster
    // filtering happens at display time, and must never drop a debt.
    const led = computeSettlements(
      [split('s1', 'A', 40)],
      [share('s1', 'GONE', 40)],
      [],
    );
    expect(led.rows).toEqual([{ fromId: 'GONE', toId: 'A', amountCents: 4000 }]);
  });
});

// ── season isolation (§39.11-12) ────────────────────────────────────────────

describe('season scoping', () => {
  it('11/12. only sees the rows it is handed, so seasons cannot bleed', () => {
    const spring = computeSettlements(
      [split('sp1', 'A', 20)], [share('sp1', 'B', 20)], [],
    );
    const fall = computeSettlements(
      [split('fa1', 'C', 70)], [share('fa1', 'D', 70)], [],
    );
    expect(spring.rows).toEqual([{ fromId: 'B', toId: 'A', amountCents: 2000 }]);
    expect(fall.rows).toEqual([{ fromId: 'D', toId: 'C', amountCents: 7000 }]);
    expect(spring.totalCents).not.toBe(fall.totalCents);
  });
});

// ── parity with the authenticated Splits page (§39.16) ──────────────────────

describe('personal view is a slice of the team ledger', () => {
  it('16. matches what SplitsDashboard shows each player', () => {
    const splits = [split('s1', 'A', 100), split('s2', 'B', 50)];
    const shares = [
      share('s1', 'B', 40), share('s1', 'C', 60),
      share('s2', 'A', 25), share('s2', 'C', 25),
    ];
    const settlements = [settlement('C', 'A', 10)];
    const led = computeSettlements(splits, shares, settlements);

    const a = personalBalances(led, 'A');
    // B owes A 40, A owes B 25 -> net B owes A 15. C owes A 60 less 10 settled = 50.
    expect(a.owedToMe.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'B', amountCents: 1500 },
      { id: 'C', amountCents: 5000 },
    ]);
    expect(a.iOwe).toEqual([]);

    const c = personalBalances(led, 'C');
    expect(c.iOwe.sort((x, y) => x.id.localeCompare(y.id))).toEqual([
      { id: 'A', amountCents: 5000 },
      { id: 'B', amountCents: 2500 },
    ]);
    expect(c.owedToMe).toEqual([]);

    // Every player's slice, summed, is the whole ledger counted twice.
    const everyone = ['A', 'B', 'C'];
    const total = everyone.reduce((sum, p) => {
      const bal = personalBalances(led, p);
      return sum + bal.iOwe.reduce((s, d) => s + d.amountCents, 0)
                 + bal.owedToMe.reduce((s, d) => s + d.amountCents, 0);
    }, 0);
    expect(total).toBe(led.totalCents * 2);
  });

  it('a player with no splits has an empty slice', () => {
    const led = computeSettlements(
      [split('s1', 'A', 10)], [share('s1', 'B', 10)], [],
    );
    expect(personalBalances(led, 'Z')).toEqual({ iOwe: [], owedToMe: [] });
  });
});

// ── ordering ────────────────────────────────────────────────────────────────

describe('row ordering', () => {
  it('puts the largest debt first so the report leads with what matters', () => {
    const led = computeSettlements(
      [split('s1', 'A', 100)],
      [share('s1', 'B', 10), share('s1', 'C', 60), share('s1', 'D', 30)],
      [],
    );
    expect(led.rows.map((r) => r.amountCents)).toEqual([6000, 3000, 1000]);
  });

  it('is deterministic for equal amounts', () => {
    const led = computeSettlements(
      [split('s1', 'A', 60)],
      [share('s1', 'C', 30), share('s1', 'B', 30)],
      [],
    );
    expect(led.rows.map((r) => r.fromId)).toEqual(['B', 'C']);
  });
});
