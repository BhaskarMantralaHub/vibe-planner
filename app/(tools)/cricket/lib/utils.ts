import { format, parseISO } from 'date-fns';
import type {
  CricketPlayer,
  CricketExpense,
  CricketExpenseSplit,
  CricketSettlement,
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

export function formatCurrency(amount: number): string {
  return `$${Math.abs(amount).toFixed(2).replace(/\.00$/, '')}`;
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
