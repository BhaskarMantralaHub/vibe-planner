'use client';

import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { calculatePlayerBalances, formatCurrency } from '../lib/utils';

export default function DuesSummary() {
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { players, expenses, splits, settlements, selectedSeasonId, setShowSettleForm } = useCricketStore();

  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const seasonSplits = splits.filter((s) => seasonExpenses.some((e) => e.id === s.expense_id));
  const seasonSettlements = settlements.filter((s) => s.season_id === selectedSeasonId);

  const balances = calculatePlayerBalances(players, seasonExpenses, seasonSplits, seasonSettlements);
  const activePlayers = balances.filter((b) => b.total_paid > 0 || b.total_owed > 0);

  if (activePlayers.length === 0) {
    return (
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 overflow-hidden min-w-0">
        <h3 className="mb-2 text-[16px] font-semibold text-[var(--text)]">Player Dues</h3>
        <p className="text-[14px] text-[var(--muted)] text-center py-6">Add expenses to see player dues.</p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 overflow-hidden min-w-0">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-[16px] font-semibold text-[var(--text)]">Player Dues</h3>
        {isAdmin && (
          <button
            onClick={() => setShowSettleForm(true)}
            className="rounded-lg border border-[var(--border)] px-3 py-1.5 text-[13px] font-medium text-[var(--text)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          >
            Settle Up
          </button>
        )}
      </div>

      <div className="space-y-1">
        {activePlayers.sort((a, b) => a.net_balance - b.net_balance).map((b) => {
          const isOwed = b.net_balance > 0.01;
          const owes = b.net_balance < -0.01;
          const settled = !isOwed && !owes;

          return (
            <div key={b.player_id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--hover-bg)] transition-colors">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-lg text-[13px] font-bold"
                style={{
                  backgroundColor: settled ? 'var(--dim)' : isOwed ? 'var(--green)' : 'var(--red)',
                  color: 'white',
                  opacity: settled ? 0.5 : 1,
                }}
              >
                {b.jersey_number ? `#${b.jersey_number}` : b.player_name.charAt(0)}
              </div>
              <div className="flex-1">
                <span className={`text-[14px] font-medium ${settled ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>
                  {b.player_name}
                </span>
              </div>
              <span
                className="text-[14px] font-semibold"
                style={{ color: settled ? 'var(--muted)' : isOwed ? 'var(--green)' : 'var(--red)' }}
              >
                {settled ? 'Settled' : isOwed ? `Owed ${formatCurrency(b.net_balance)}` : `Owes ${formatCurrency(b.net_balance)}`}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
