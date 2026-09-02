/**
 * THE settlement engine for peer-to-peer splits. One implementation, two
 * readers: SplitsDashboard's personal balances and the public team settlement
 * report. There must never be a second one in TypeScript — a report that
 * disagreed with the Splits page would be worse than no report.
 *
 * (The `get_settlement_report` RPC mirrors this in SQL because the public page
 * is statically exported and must not ship the ledger to the browser. That
 * pair is the one duplication, and docs/settlement-report-verification.sql
 * exists to keep them honest.)
 *
 * THE MODEL IS PAIRWISE, NOT NET-BALANCE SIMPLIFICATION. What A owes B comes
 * only from splits B actually paid that A shared in, less settlements between
 * those two people. It is NOT derived by netting everyone's global balance and
 * re-routing payments through strangers.
 *
 * Why that matters, concretely: A owes B $50 and B owes C $50. This engine
 * says "A pays B $50, B pays C $50". A global-netting engine would say "A pays
 * C $50" — fewer transfers, but it invents a debt between two people who never
 * shared an expense, and it contradicts what both of them already see on the
 * Splits page. Splitwise calls the second one "simplify debts" and ships it
 * off by default for exactly this reason.
 *
 * MONEY IS INTEGER CENTS end to end. Shares are stored as NUMERIC(10,2), so
 * every input converts exactly; summing in cents means debtor and creditor
 * totals reconcile to the penny with no float drift.
 */

import type {
  CricketSplit,
  CricketSplitShare,
  CricketSplitSettlement,
} from '@/types/cricket';

/** Below this, a pair is settled. Half a cent — smaller than representable money. */
const ZERO_CENTS = 0;

export type SettlementRow = {
  fromId: string;
  toId: string;
  /** Always > 0, in cents. */
  amountCents: number;
};

export type PairwiseLedger = {
  /** One row per pair that still owes something, largest first. */
  rows: SettlementRow[];
  /** Every player id that appears in at least one outstanding row. */
  involvedIds: string[];
  /** Sum of all outstanding rows, in cents. */
  totalCents: number;
};

/** NUMERIC(10,2) -> exact cents. Math.round is safe here: the input has at most 2dp. */
export function toCents(amount: number | string | null | undefined): number {
  const n = typeof amount === 'string' ? Number(amount) : (amount ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

export function centsToDollars(cents: number): number {
  return cents / 100;
}

/** "$58.57" — the report's only money formatter, so rows cannot disagree. */
export function formatCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(cents);
  return `${sign}$${(abs / 100).toFixed(2)}`;
}

/**
 * Directed pair key. Ordered by id so both directions of a pair collapse onto
 * one accumulator and cancel each other out — the sign then tells us who owes.
 */
function pairKey(a: string, b: string): { key: string; flipped: boolean } {
  return a < b ? { key: `${a}|${b}`, flipped: false } : { key: `${b}|${a}`, flipped: true };
}

/**
 * Build the outstanding settlement plan for one season's splits.
 *
 * Mirrors SplitsDashboard's per-person accumulation exactly, generalised from
 * "me vs everyone" to "everyone vs everyone":
 *   - a split paid by P, shared by S (S != P)  =>  S owes P the share
 *   - a settlement F -> T                      =>  reduces what F owes T
 *
 * Deleted splits are excluded (their shares are kept in the DB so restore
 * works, so filtering on the split is the only correct filter).
 */
export function computeSettlements(
  splits: CricketSplit[],
  shares: CricketSplitShare[],
  settlements: CricketSplitSettlement[],
): PairwiseLedger {
  const activeSplits = splits.filter((s) => !s.deleted_at);
  const activeSplitIds = new Set(activeSplits.map((s) => s.id));
  const payerOf = new Map<string, string>();
  for (const s of activeSplits) payerOf.set(s.id, s.paid_by);

  // net[key] > 0 means the FIRST id of the key owes the second.
  const net = new Map<string, number>();

  const add = (debtor: string, creditor: string, cents: number) => {
    if (debtor === creditor || cents === 0) return;
    const { key, flipped } = pairKey(debtor, creditor);
    net.set(key, (net.get(key) ?? 0) + (flipped ? -cents : cents));
  };

  for (const sh of shares) {
    if (!activeSplitIds.has(sh.split_id)) continue;
    const payer = payerOf.get(sh.split_id);
    if (!payer) continue;
    // The sharer owes the payer their share.
    add(sh.player_id, payer, toCents(sh.share_amount));
  }

  for (const st of settlements) {
    // Paying down a debt reduces it; paying when square creates the reverse.
    add(st.to_player, st.from_player, toCents(st.amount));
  }

  const rows: SettlementRow[] = [];
  const involved = new Set<string>();

  for (const [key, cents] of net) {
    if (cents === ZERO_CENTS) continue;
    const [first, second] = key.split('|');
    const [fromId, toId] = cents > 0 ? [first, second] : [second, first];
    const amountCents = Math.abs(cents);
    rows.push({ fromId, toId, amountCents });
    involved.add(fromId);
    involved.add(toId);
  }

  rows.sort((a, b) => b.amountCents - a.amountCents || a.fromId.localeCompare(b.fromId));

  return {
    rows,
    involvedIds: [...involved],
    totalCents: rows.reduce((sum, r) => sum + r.amountCents, 0),
  };
}

/**
 * One player's slice of the ledger — what SplitsDashboard renders. Derived from
 * the same rows the team report uses, so the two can never drift.
 */
export function personalBalances(ledger: PairwiseLedger, playerId: string): {
  iOwe: { id: string; amountCents: number }[];
  owedToMe: { id: string; amountCents: number }[];
} {
  const iOwe: { id: string; amountCents: number }[] = [];
  const owedToMe: { id: string; amountCents: number }[] = [];
  for (const r of ledger.rows) {
    if (r.fromId === playerId) iOwe.push({ id: r.toId, amountCents: r.amountCents });
    else if (r.toId === playerId) owedToMe.push({ id: r.fromId, amountCents: r.amountCents });
  }
  return { iOwe, owedToMe };
}
