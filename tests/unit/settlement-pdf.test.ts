import { describe, it, expect } from 'vitest';
import {
  buildSettlementPdfModel,
  settlementPdfTitle,
} from '@/app/(tools)/cricket/lib/settlement-pdf';
import { computeSettlements } from '@/app/(tools)/cricket/lib/settlement';
import type {
  CricketSplit,
  CricketSplitShare,
  CricketSplitSettlement,
} from '@/types/cricket';

/**
 * The printed report must agree with the Splits page and the shared link to
 * the penny. It is built from `computeSettlements`, so these tests exist to
 * prove the GROUPING preserves the engine's totals rather than to re-test the
 * arithmetic — the moment a group's rows stop summing to its header, the
 * document is lying to whoever is being asked to pay.
 */

const NAMES: Record<string, string> = {
  a: 'Aarav Sharma',
  b: 'Venkat Gudala (Kittu)',
  c: 'Venkat Subbu',
  d: 'Priya Nair',
};
const nameOf = (id: string) => NAMES[id] ?? 'Unknown player';

function split(id: string, paidBy: string, amount: number, deleted = false): CricketSplit {
  return {
    id,
    season_id: 's1',
    team_id: 't1',
    paid_by: paidBy,
    amount,
    description: `Split ${id}`,
    category: 'ground',
    split_date: '2026-04-01',
    created_at: '2026-04-01T00:00:00Z',
    deleted_at: deleted ? '2026-04-02T00:00:00Z' : null,
    receipt_urls: null,
    created_by: null,
  } as unknown as CricketSplit;
}

function share(splitId: string, playerId: string, amount: number): CricketSplitShare {
  return { id: `${splitId}-${playerId}`, split_id: splitId, player_id: playerId, share_amount: amount } as unknown as CricketSplitShare;
}

function settle(from: string, to: string, amount: number): CricketSplitSettlement {
  return {
    id: `${from}-${to}-${amount}`,
    season_id: 's1', team_id: 't1',
    from_player: from, to_player: to, amount,
    settled_date: '2026-04-05', created_at: '2026-04-05T00:00:00Z',
  } as unknown as CricketSplitSettlement;
}

const build = (
  splits: CricketSplit[], shares: CricketSplitShare[], settlements: CricketSplitSettlement[] = [],
) => buildSettlementPdfModel({
  teamName: 'Sunrisers Manteca',
  seasonName: '2026 MTCA Spring League',
  ledger: computeSettlements(splits, shares, settlements),
  nameOf,
  generatedAt: new Date('2026-04-10T17:30:00Z'),
});

describe('settlement PDF model', () => {
  it('groups by payer and every group total equals the sum of its rows', () => {
    // a paid 90, split three ways -> b and c each owe a 30.
    // d paid 40, split two ways   -> b owes d 20.
    const model = build(
      [split('s1', 'a', 90), split('s2', 'd', 40)],
      [
        share('s1', 'a', 30), share('s1', 'b', 30), share('s1', 'c', 30),
        share('s2', 'd', 20), share('s2', 'b', 20),
      ],
    );

    for (const g of model.groups) {
      const sum = g.rows.reduce((n, r) => n + r.amountCents, 0);
      expect(sum, `${g.fromName}'s rows must sum to the header`).toBe(g.totalCents);
    }
    // And the document total equals the engine's total.
    const docTotal = model.groups.reduce((n, g) => n + g.totalCents, 0);
    expect(docTotal).toBe(model.totalOutstandingCents);
  });

  it('puts the biggest debtor first, and their biggest debt first', () => {
    const model = build(
      [split('s1', 'a', 90), split('s2', 'd', 40)],
      [
        share('s1', 'a', 30), share('s1', 'b', 30), share('s1', 'c', 30),
        share('s2', 'd', 20), share('s2', 'b', 20),
      ],
    );
    // b owes 30 + 20 = 50; c owes 30.
    expect(model.groups[0].fromName).toBe('Venkat Gudala (Kittu)');
    expect(model.groups[0].totalCents).toBe(5000);
    expect(model.groups[0].rows.map((r) => r.amountCents)).toEqual([3000, 2000]);
    expect(model.groups[1].fromName).toBe('Venkat Subbu');
  });

  it('uses FULL stored names — two Venkats must stay distinguishable', () => {
    const model = build(
      [split('s1', 'a', 90)],
      [share('s1', 'a', 30), share('s1', 'b', 30), share('s1', 'c', 30)],
    );
    const names = model.groups.map((g) => g.fromName);
    expect(names).toContain('Venkat Gudala (Kittu)');
    expect(names).toContain('Venkat Subbu');
    expect(new Set(names).size).toBe(names.length);
  });

  it('reports all settled when nothing is outstanding', () => {
    const model = build([], []);
    expect(model.allSettled).toBe(true);
    expect(model.groups).toEqual([]);
    expect(model.totalOutstandingCents).toBe(0);
    expect(model.paymentCount).toBe(0);
    expect(model.membersInvolved).toBe(0);
  });

  it('drops a pair once a settlement clears it', () => {
    const model = build(
      [split('s1', 'a', 60)],
      [share('s1', 'a', 30), share('s1', 'b', 30)],
      [settle('b', 'a', 30)],
    );
    expect(model.allSettled).toBe(true);
  });

  it('reflects a partial settlement in the printed figure', () => {
    const model = build(
      [split('s1', 'a', 60)],
      [share('s1', 'a', 30), share('s1', 'b', 30)],
      [settle('b', 'a', 10)],
    );
    expect(model.totalOutstandingCents).toBe(2000);
    expect(model.groups[0].rows[0]).toEqual({ toName: 'Aarav Sharma', amountCents: 2000 });
  });

  it('excludes deleted splits, matching the engine and both other views', () => {
    const model = build(
      [split('s1', 'a', 60, true)],
      [share('s1', 'a', 30), share('s1', 'b', 30)],
    );
    expect(model.allSettled).toBe(true);
  });

  it('names a player who is no longer on the roster rather than dropping them', () => {
    // The Balances tab drops departed players; the printed report keeps the
    // debt, so an unknown id must still render as something readable.
    const model = buildSettlementPdfModel({
      teamName: 'T', seasonName: 'S',
      ledger: computeSettlements(
        [split('s1', 'zz', 20)],
        [share('s1', 'zz', 10), share('s1', 'a', 10)],
        [],
      ),
      nameOf,
    });
    expect(model.groups[0].rows[0].toName).toBe('Unknown player');
  });

  it('keeps cents exact — no float drift on thirds', () => {
    // 100 split three ways: 33.33 / 33.33 / 33.34
    const model = build(
      [split('s1', 'a', 100)],
      [share('s1', 'a', 33.33), share('s1', 'b', 33.33), share('s1', 'c', 33.34)],
    );
    const total = model.groups.reduce((n, g) => n + g.totalCents, 0);
    expect(total).toBe(3333 + 3334);
    expect(Number.isInteger(total)).toBe(true);
  });

  it('counts payments and members from the ledger, not the groups', () => {
    const model = build(
      [split('s1', 'a', 90), split('s2', 'd', 40)],
      [
        share('s1', 'a', 30), share('s1', 'b', 30), share('s1', 'c', 30),
        share('s2', 'd', 20), share('s2', 'b', 20),
      ],
    );
    expect(model.paymentCount).toBe(3);           // b->a, c->a, b->d
    expect(model.membersInvolved).toBe(4);        // a, b, c, d
  });
});

describe('settlementPdfTitle', () => {
  it('names the team and the season', () => {
    // A blob: URL has no filename, so this string IS the name the reader sees
    // in the browser tab. If it regresses, the tab reads as a bare UUID.
    const model = build([], []);
    expect(settlementPdfTitle(model)).toBe(
      'Sunrisers Manteca — 2026 MTCA Spring League settlement',
    );
  });
});
