import { format, parseISO } from 'date-fns';
import type {
  CricketPlayer,
  CricketExpense,
  CricketExpenseSplit,
  CricketSettlement,
  CricketSplit,
  CricketSplitShare,
  CricketSplitSettlement,
  PlayerBalance,
} from '@/types/cricket';

export function calculatePlayerBalances(
  players: CricketPlayer[],
  expenses: CricketExpense[],
  splits: CricketExpenseSplit[],
  settlements: CricketSettlement[],
): PlayerBalance[] {
  return players.filter((p) => p.is_active && !p.is_guest).map((player) => {
    // Total this player paid upfront for the team
    const totalPaid = expenses
      .filter((e) => e.paid_by === player.id)
      .reduce((sum, e) => sum + Number(e.amount), 0);

    // Total this player owes (their share of all expenses they're split into)
    const totalOwed = splits
      .filter((s) => s.player_id === player.id)
      .reduce((sum, s) => sum + Number(s.share_amount), 0);

    // Settlements this player has paid out
    const settlementsPaid = settlements
      .filter((s) => s.from_player === player.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    // Settlements this player has received
    const settlementsReceived = settlements
      .filter((s) => s.to_player === player.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    // Positive = team owes them, Negative = they owe the team
    const netBalance = totalPaid - totalOwed + settlementsPaid - settlementsReceived;

    return {
      player_id: player.id,
      player_name: player.name,
      jersey_number: player.jersey_number,
      total_paid: totalPaid,
      total_owed: totalOwed,
      settlements_paid: settlementsPaid,
      settlements_received: settlementsReceived,
      net_balance: netBalance,
    };
  });
}

export function getCategoryBreakdown(expenses: CricketExpense[]): { category: string; total: number; percentage: number }[] {
  const totals: Record<string, number> = {};
  expenses.forEach((e) => {
    totals[e.category] = (totals[e.category] || 0) + Number(e.amount);
  });

  const grand = Object.values(totals).reduce((a, b) => a + b, 0);
  if (grand === 0) return [];

  return Object.entries(totals)
    .map(([category, total]) => ({
      category,
      total,
      percentage: Math.round((total / grand) * 100),
    }))
    .sort((a, b) => b.total - a.total);
}

export function getMonthlySpending(expenses: CricketExpense[]): { month: string; total: number }[] {
  const monthly: Record<string, number> = {};
  expenses.forEach((e) => {
    const month = format(parseISO(e.expense_date), 'MMM');
    monthly[month] = (monthly[month] || 0) + Number(e.amount);
  });

  const monthOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return monthOrder
    .filter((m) => monthly[m])
    .map((month) => ({ month, total: monthly[month] }));
}

// Canonical USD format — always 2 decimals + thousand separators.
// Consistent character width ensures right-aligned columns of money line up cleanly,
// which is the standard finance UI convention.
const _currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
/* ── Pool fund ──────────────────────────────────────────────────────────── */

export interface PoolInputs {
  /** Money carried in from the previous season. Read as `?? 0` — the column is
   *  nullable so that restore.yml, which does not apply column defaults, can
   *  rebuild season rows from a pre-migration backup. */
  openingBalance?: number | null;
  /** `amount_paid` from cricket_season_fees, for this season. */
  fees: { amount_paid: number | string }[];
  /** cricket_sponsorships for this season, soft-deleted rows already excluded. */
  sponsors: { amount: number | string }[];
  /** cricket_expenses for this season, soft-deleted rows already excluded. */
  expenses: { amount: number | string }[];
}

export interface PoolBalance {
  openingBalance: number;
  feesCollected: number;
  sponsorshipsCollected: number;
  /** opening + fees + sponsorships — everything the pool has ever held. */
  totalIn: number;
  totalSpent: number;
  /** totalIn − totalSpent. Can be negative; a deficit is real. */
  balance: number;
}

/**
 * THE pool-fund calculation. One function, so the app cannot contradict itself
 * about how much money the team has.
 *
 * It replaced four separate copies that had already drifted apart:
 *   • app/(tools)/cricket/page.tsx        — (fees + sponsors) − expenses
 *   • ShareButton.tsx (WhatsApp text)     — fees − expenses  ← LOST sponsorships
 *   • ShareButton.tsx (share image / PDF) — (fees + sponsors) − expenses
 *   • .github/scripts/send-monthly-report.sh
 *
 * So the WhatsApp text share and the image share printed DIFFERENT balances for
 * the same season — under-reporting by the sponsorship total ($420 for Spring
 * 2026). That is why `opening_balance` could not simply be added where it was
 * needed: a fifth term across four copies is four chances to get money wrong.
 *
 * Splits are deliberately absent. Peer-to-peer splits are outside the pool fund
 * entirely (see CLAUDE.md) and must never be aggregated into it.
 *
 * Amounts are coerced with Number() because Postgres NUMERIC arrives as a
 * string through PostgREST, and `'60' + '60'` is '6060'.
 */
export function computePoolBalance(input: PoolInputs): PoolBalance {
  const sum = (rows: { amount?: number | string; amount_paid?: number | string }[], key: 'amount' | 'amount_paid') =>
    rows.reduce((total, r) => total + Number(r[key] ?? 0), 0);

  const openingBalance = Number(input.openingBalance ?? 0);
  const feesCollected = sum(input.fees, 'amount_paid');
  const sponsorshipsCollected = sum(input.sponsors, 'amount');
  const totalSpent = sum(input.expenses, 'amount');
  const totalIn = openingBalance + feesCollected + sponsorshipsCollected;

  return {
    openingBalance,
    feesCollected,
    sponsorshipsCollected,
    totalIn,
    totalSpent,
    balance: totalIn - totalSpent,
  };
}

/* ── Carrying money between seasons ─────────────────────────────────────── */

export interface SeasonLike {
  id: string;
  name: string;
  year: number;
  season_type: string;
  /** Explicitly set → FROZEN at that figure. Null → derive live from the
   *  previous season, which is what an unfinished previous season needs. */
  opening_balance?: number | null;
}

export interface CarriedForward {
  amount: number;
  /** The season the money came from, for the entry's label. */
  fromSeasonName: string | null;
  /**
   * True while the figure tracks the previous season's live balance, so it
   * moves if more of that season's money is spent. False once an admin has
   * frozen it by setting `opening_balance`.
   */
  live: boolean;
}

const SEASON_ORDER: Record<string, number> = { spring: 0, summer: 1, fall: 2 };

/** Chronological: year, then spring → summer → fall. */
function seasonRank(s: SeasonLike): number {
  return s.year * 10 + (SEASON_ORDER[s.season_type] ?? 0);
}

export interface SeasonMoney {
  fees: { season_id: string; amount_paid: number | string }[];
  sponsors: { season_id: string; amount: number | string }[];
  expenses: { season_id: string; amount: number | string }[];
}

/**
 * What a season starts with, carried over from the one before it.
 *
 * ── Live until frozen ──────────────────────────────────────────────────────
 * A snapshot taken while the previous season is still being played is wrong the
 * moment anyone spends more of that season's money — and Spring 2026 is mid
 * playoffs. So when `opening_balance` is null this figure is DERIVED from the
 * previous season's current balance and stays in sync.
 *
 * Setting `opening_balance` freezes it. That matters because a permanently live
 * chain is its own hazard: with several seasons on record, correcting one old
 * expense would silently rewrite every balance since. Freezing a season when it
 * closes gives correctness now and stability later.
 *
 * Recursion is bounded two ways — a visited set, and the fact that the earliest
 * season has no predecessor and so contributes 0.
 */
export function computeCarriedForward(
  seasonId: string,
  seasons: SeasonLike[],
  money: SeasonMoney,
  visited: Set<string> = new Set(),
): CarriedForward {
  const season = seasons.find((s) => s.id === seasonId);
  if (!season) return { amount: 0, fromSeasonName: null, live: false };

  // Chronologically previous season, whether or not it has any data.
  const rank = seasonRank(season);
  const previous = seasons
    .filter((s) => seasonRank(s) < rank)
    .sort((a, b) => seasonRank(b) - seasonRank(a))[0] ?? null;

  // Frozen: an admin has committed a figure, so use it verbatim.
  if (season.opening_balance !== null && season.opening_balance !== undefined) {
    return {
      amount: Number(season.opening_balance),
      fromSeasonName: previous?.name ?? null,
      live: false,
    };
  }

  // Nothing before it — the first season on record starts from nothing.
  // A cycle or a malformed chain lands here too rather than recursing forever.
  if (!previous || visited.has(seasonId)) {
    return { amount: 0, fromSeasonName: null, live: false };
  }

  visited.add(seasonId);
  const previousBalance = computeSeasonPool(previous.id, seasons, money, visited).balance;

  return { amount: previousBalance, fromSeasonName: previous.name, live: true };
}

export interface SeasonPool extends PoolBalance {
  carried: CarriedForward;
}

/**
 * A season's full pool position, including whatever carried in.
 *
 * This is the function screens should call. `computePoolBalance` is the
 * arithmetic; this resolves where the opening figure comes from first.
 */
export function computeSeasonPool(
  seasonId: string,
  seasons: SeasonLike[],
  money: SeasonMoney,
  visited: Set<string> = new Set(),
): SeasonPool {
  const carried = computeCarriedForward(seasonId, seasons, money, visited);
  const pool = computePoolBalance({
    openingBalance: carried.amount,
    fees: money.fees.filter((f) => f.season_id === seasonId),
    sponsors: money.sponsors.filter((s) => s.season_id === seasonId),
    expenses: money.expenses.filter((e) => e.season_id === seasonId),
  });
  return { ...pool, carried };
}

export function formatCurrency(amount: number): string {
  return _currencyFormatter.format(Math.abs(amount));
}

export function formatDate(dateStr: string): string {
  return format(parseISO(dateStr), 'MMM d');
}

export function computeSplitAmounts(amount: number, playerCount: number): number[] {
  if (playerCount === 0) return [];
  const base = Math.floor((amount * 100) / playerCount) / 100;
  const remainder = Math.round((amount - base * playerCount) * 100) / 100;
  return Array.from({ length: playerCount }, (_, i) =>
    i === 0 ? Math.round((base + remainder) * 100) / 100 : base,
  );
}

/** Calculate balances for peer-to-peer splits (completely separate from pool expenses) */
export function calculateSplitBalances(
  players: CricketPlayer[],
  splitExpenses: CricketSplit[],
  shares: CricketSplitShare[],
  settlements: CricketSplitSettlement[],
): PlayerBalance[] {
  const activeSplits = splitExpenses.filter((s) => !s.deleted_at);
  const activeSplitIds = new Set(activeSplits.map((s) => s.id));

  // Include inactive players who have split history (paid, owe, or settled)
  // so balances stay correct when someone leaves mid-season
  const playerIdsWithHistory = new Set<string>();
  for (const s of activeSplits) playerIdsWithHistory.add(s.paid_by);
  for (const sh of shares) { if (activeSplitIds.has(sh.split_id)) playerIdsWithHistory.add(sh.player_id); }
  for (const s of settlements) { playerIdsWithHistory.add(s.from_player); playerIdsWithHistory.add(s.to_player); }

  const relevantPlayers = players.filter((p) => p.is_active || playerIdsWithHistory.has(p.id));

  return relevantPlayers.map((player) => {
    const totalPaid = activeSplits
      .filter((s) => s.paid_by === player.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    const totalOwed = shares
      .filter((sh) => sh.player_id === player.id && activeSplitIds.has(sh.split_id))
      .reduce((sum, sh) => sum + Number(sh.share_amount), 0);

    const settlementsPaid = settlements
      .filter((s) => s.from_player === player.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    const settlementsReceived = settlements
      .filter((s) => s.to_player === player.id)
      .reduce((sum, s) => sum + Number(s.amount), 0);

    const netBalance = totalPaid - totalOwed - settlementsPaid + settlementsReceived;

    return {
      player_id: player.id,
      player_name: player.name,
      jersey_number: player.jersey_number,
      total_paid: totalPaid,
      total_owed: totalOwed,
      settlements_paid: settlementsPaid,
      settlements_received: settlementsReceived,
      net_balance: Math.round(netBalance * 100) / 100,
    };
  });
}

