'use client';

import { useCricketStore } from '@/stores/cricket-store';
import { getCategoryConfig } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/utils';

export default function ExpenseList() {
  const { expenses, splits, players, selectedSeasonId, deleteExpense } = useCricketStore();

  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const playerMap = Object.fromEntries(players.map((p) => [p.id, p.name]));

  if (seasonExpenses.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h3 className="mb-2 text-[16px] font-semibold text-[var(--text)]">Expenses</h3>
        <p className="text-[14px] text-[var(--muted)] text-center py-6">No expenses yet this season.</p>
      </div>
    );
  }

  const total = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[var(--text)]">Expenses ({seasonExpenses.length})</h3>
        <span className="text-[15px] font-bold text-[var(--orange)]">{formatCurrency(total)}</span>
      </div>

      <div className="space-y-1">
        {seasonExpenses.map((e) => {
          const cfg = getCategoryConfig(e.category);
          const splitCount = splits.filter((s) => s.expense_id === e.id).length;
          return (
            <div key={e.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--hover-bg)] transition-colors group">
              <span
                className="rounded-lg px-2 py-1 text-[11px] font-medium"
                style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
              >
                {cfg.label}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-[14px] font-medium text-[var(--text)]">
                  {e.description || cfg.label}
                </span>
                <p className="text-[12px] text-[var(--muted)]">
                  {formatDate(e.expense_date)} &bull; {playerMap[e.paid_by] ?? 'Unknown'} &bull; {splitCount} players
                </p>
              </div>
              <span className="text-[15px] font-semibold text-[var(--text)]">{formatCurrency(Number(e.amount))}</span>
              <button
                onClick={() => deleteExpense(e.id)}
                className="rounded-lg px-2 py-1 text-[12px] text-[var(--red)] opacity-0 group-hover:opacity-100 hover:bg-[var(--red)]/10 cursor-pointer transition-all"
              >
                Delete
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
