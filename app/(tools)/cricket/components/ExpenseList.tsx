'use client';

import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { getCategoryConfig } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaExclamationTriangle, FaCheckCircle, FaWallet } from 'react-icons/fa';
import { MdDeleteOutline } from 'react-icons/md';

export default function ExpenseList() {
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { expenses, fees, players, selectedSeasonId, deleteExpense } = useCricketStore();

  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const activePlayers = players.filter((p) => p.is_active);

  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSpent = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const poolBalance = totalCollected - totalSpent;
  const isLow = poolBalance < 0;
  const perPerson = activePlayers.length > 0 ? Math.ceil(Math.abs(poolBalance) / activePlayers.length) : 0;

  return (
    <div className="space-y-4">
      {/* Pool Fund Balance */}
      <div className="rounded-2xl border bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden"
        style={{ borderColor: isLow ? 'var(--red)' : poolBalance > 0 ? 'var(--green)' : 'var(--border)' }}>
        <div className="flex items-center gap-3 mb-3">
          <div className="flex-shrink-0 h-10 w-10 rounded-xl flex items-center justify-center"
            style={{
              backgroundColor: isLow ? '#EF444415' : '#05966915',
              color: isLow ? '#EF4444' : '#059669',
            }}>
            <FaWallet size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-widest text-[var(--muted)] mb-0.5">Team Pool Fund</p>
            <p className="text-[28px] sm:text-[34px] font-extrabold leading-tight" style={{ color: isLow ? 'var(--red)' : 'var(--green)' }}>
              {isLow ? '-' : ''}{formatCurrency(poolBalance)}
            </p>
          </div>
        </div>

        <div className="flex gap-4 text-[13px] sm:text-[14px] font-semibold">
          <span className="text-[var(--green)]">Collected: {formatCurrency(totalCollected)}</span>
          <span className="text-[var(--red)]">Spent: {formatCurrency(totalSpent)}</span>
        </div>

        {/* Low fund warning */}
        {isLow && activePlayers.length > 0 && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2.5"
            style={{ backgroundColor: '#EF444410', border: '1px solid #EF444425' }}>
            <FaExclamationTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
            <div>
              <p className="text-[14px] font-bold text-[var(--text)]">Insufficient funds</p>
              <p className="text-[13px] text-[var(--muted)] leading-relaxed">
                Pool is short by <span className="font-semibold text-[var(--red)]">{formatCurrency(poolBalance)}</span>. Suggest collecting <span className="font-bold text-[var(--text)]">{formatCurrency(perPerson)}</span> per player ({activePlayers.length} players) to cover the deficit.
              </p>
            </div>
          </div>
        )}

        {/* Healthy fund message */}
        {!isLow && totalCollected > 0 && poolBalance > 0 && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2.5"
            style={{ background: 'linear-gradient(135deg, #05966912, #10B98118)', border: '1px solid #05966930' }}>
            <FaCheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#10B981' }} />
            <div>
              <p className="text-[14px] font-bold" style={{ color: '#10B981' }}>Funds available</p>
              <p className="text-[13px] leading-relaxed" style={{ color: '#6EE7B7' }}>
                <span className="font-bold" style={{ color: '#34D399' }}>{formatCurrency(poolBalance)}</span> remaining in the pool. Rolls over to next season.
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Expense list */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 overflow-hidden min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] sm:text-[18px] font-bold text-[var(--text)]">
            Expenses <span className="text-[var(--muted)] font-normal text-[14px]">({seasonExpenses.length})</span>
          </h3>
          {seasonExpenses.length > 0 && (
            <span className="text-[15px] font-extrabold text-[var(--red)]">-{formatCurrency(totalSpent)}</span>
          )}
        </div>

        {seasonExpenses.length === 0 ? (
          <p className="text-[14px] text-[var(--muted)] text-center py-6">No expenses yet this season.</p>
        ) : (
          <div className="space-y-1.5">
            {seasonExpenses.map((e) => {
              const cfg = getCategoryConfig(e.category);
              return (
                <div key={e.id} className="flex items-center gap-2 sm:gap-3 rounded-xl px-2.5 sm:px-3 py-2.5 hover:bg-[var(--hover-bg)] transition-colors group">
                  <span
                    className="flex-shrink-0 rounded-lg px-2 py-1 text-[10px] sm:text-[11px] font-semibold"
                    style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}
                  >
                    {cfg.label}
                  </span>
                  <div className="flex-1 min-w-0">
                    <span className="text-[13px] sm:text-[14px] font-medium text-[var(--text)] block truncate">
                      {e.description || cfg.label}
                    </span>
                    <p className="text-[11px] sm:text-[12px] text-[var(--muted)]">
                      {formatDate(e.expense_date)}
                    </p>
                  </div>
                  <span className="text-[14px] sm:text-[15px] font-semibold text-[var(--text)] flex-shrink-0">{formatCurrency(Number(e.amount))}</span>
                  {isAdmin && (
                    <button
                      onClick={() => deleteExpense(e.id)}
                      className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg text-[var(--muted)] opacity-0 group-hover:opacity-100 hover:bg-[var(--red)]/10 hover:text-[var(--red)] cursor-pointer transition-all"
                    >
                      <MdDeleteOutline size={16} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
