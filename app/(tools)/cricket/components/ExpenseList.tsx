'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { getCategoryConfig } from '../lib/constants';
import { formatCurrency, formatDate } from '../lib/utils';
import { FaExclamationTriangle, FaCheckCircle, FaWallet, FaEllipsisV } from 'react-icons/fa';
import { MdEdit, MdDeleteOutline } from 'react-icons/md';
import { createPortal } from 'react-dom';

/* ── Expense Card Menu ── */
function ExpenseMenu({ anchorRef, onEdit, onDelete, onClose }: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const [pos, setPos] = useState({ top: 0, left: 0 });

  useState(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 150;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
  });

  return createPortal(
    <>
      <div className="fixed inset-0 z-[99]" onClick={onClose} />
      <div className="fixed z-[100] w-[150px] rounded-xl overflow-hidden shadow-2xl animate-[scaleIn_0.1s]"
        style={{ top: pos.top, left: pos.left, background: 'var(--surface)', border: '1px solid var(--border)' }}>
        <button onClick={() => { onEdit(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--text)' }}>
          <MdEdit size={15} style={{ color: 'var(--blue)' }} /> Edit
        </button>
        <button onClick={() => { onDelete(); onClose(); }}
          className="w-full flex items-center gap-2.5 px-3.5 py-2.5 text-[13px] font-medium transition-colors hover:bg-[var(--hover-bg)] text-left cursor-pointer"
          style={{ color: 'var(--red)' }}>
          <MdDeleteOutline size={15} /> Delete
        </button>
      </div>
    </>,
    document.body,
  );
}

/* ── Delete Confirm ── */
function DeleteConfirm({ description, onConfirm, onCancel }: { description: string; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
      <div className="w-[340px] rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }}>
            <MdDeleteOutline size={20} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text)]">Delete Expense</p>
            <p className="text-[13px] text-[var(--muted)]">Remove <b>{description}</b>?</p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)]">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--red)] text-white cursor-pointer hover:opacity-90">
            Delete
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default function ExpenseList() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { expenses, fees, players, selectedSeasonId, deleteExpense, setShowExpenseForm } = useCricketStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; desc: string } | null>(null);
  const menuBtnRef = useState<HTMLButtonElement | null>(null);

  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const activePlayers = players.filter((p) => p.is_active);

  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSpent = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const poolBalance = totalCollected - totalSpent;
  const isLow = poolBalance < 0;
  const perPerson = activePlayers.length > 0 ? Math.ceil(Math.abs(poolBalance) / activePlayers.length) : 0;

  const adminName = (user?.user_metadata?.full_name as string) || user?.email || '';

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

        {isLow && activePlayers.length > 0 && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2.5"
            style={{ backgroundColor: '#EF444410', border: '1px solid #EF444425' }}>
            <FaExclamationTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
            <div>
              <p className="text-[14px] font-bold text-[var(--text)]">Insufficient funds</p>
              <p className="text-[13px] leading-relaxed" style={{ color: '#FCA5A5' }}>
                Pool is short by <span className="font-bold" style={{ color: '#F87171' }}>{formatCurrency(poolBalance)}</span>. Suggest collecting <span className="font-bold text-[var(--text)]">{formatCurrency(perPerson)}</span> per player ({activePlayers.length} players).
              </p>
            </div>
          </div>
        )}

        {!isLow && totalCollected > 0 && poolBalance > 0 && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2.5"
            style={{ background: 'linear-gradient(135deg, #3B82F612, #60A5FA18)', border: '1px solid #3B82F630' }}>
            <FaCheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: '#60A5FA' }} />
            <div>
              <p className="text-[14px] font-bold" style={{ color: '#60A5FA' }}>Funds available</p>
              <p className="text-[13px] leading-relaxed text-[var(--muted)]">
                <span className="font-bold" style={{ color: '#93C5FD' }}>{formatCurrency(poolBalance)}</span> remaining. Rolls over to next season.
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
          <div className="space-y-2">
            {seasonExpenses.map((e) => {
              const cfg = getCategoryConfig(e.category);
              return (
                <div key={e.id} className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 overflow-hidden"
                  style={{ borderLeftWidth: '4px', borderLeftColor: cfg.color }}>

                  {/* Three-dot menu */}
                  {isAdmin && (
                    <button
                      ref={(el) => { if (openMenu === e.id && el) (menuBtnRef as unknown as [HTMLButtonElement | null, React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>])[1](el); }}
                      onClick={() => setOpenMenu(openMenu === e.id ? null : e.id)}
                      className="absolute top-2.5 right-2.5 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
                      <FaEllipsisV size={12} />
                    </button>
                  )}

                  {openMenu === e.id && (
                    <ExpenseMenu
                      anchorRef={{ current: (menuBtnRef as unknown as [HTMLButtonElement | null, React.Dispatch<React.SetStateAction<HTMLButtonElement | null>>])[0] }}
                      onEdit={() => { /* TODO: edit expense */ setOpenMenu(null); }}
                      onDelete={() => { setDeletingExpense({ id: e.id, desc: e.description || cfg.label }); setOpenMenu(null); }}
                      onClose={() => setOpenMenu(null)}
                    />
                  )}

                  <div className="flex items-start gap-3 pr-8">
                    {/* Category badge */}
                    <div className="flex-shrink-0 mt-0.5">
                      <span className="inline-block rounded-lg px-2.5 py-1 text-[11px] font-bold"
                        style={{ backgroundColor: cfg.bgColor, color: cfg.color, border: `1px solid ${cfg.borderColor}` }}>
                        {cfg.label}
                      </span>
                    </div>

                    {/* Info */}
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] sm:text-[15px] font-semibold text-[var(--text)] truncate">
                        {e.description || cfg.label}
                      </p>
                      <p className="text-[12px] text-[var(--muted)] mt-0.5">
                        {formatDate(e.expense_date)}
                      </p>
                    </div>

                    {/* Amount */}
                    <div className="flex-shrink-0 text-right">
                      <p className="text-[16px] sm:text-[18px] font-extrabold text-[var(--text)]">
                        {formatCurrency(Number(e.amount))}
                      </p>
                    </div>
                  </div>

                  {/* Footer — added by / updated info */}
                  <div className="mt-2 pt-2 border-t border-[var(--border)]/30 flex items-center justify-between text-[11px]">
                    <span className="text-[var(--dim)]">
                      Added {formatDate(e.created_at?.split('T')[0] || e.expense_date)}
                      {adminName && <> by <span className="text-[var(--muted)] font-medium">{adminName}</span></>}
                    </span>
                    {e.updated_at && e.updated_at !== e.created_at && (
                      <span className="text-[var(--dim)]">
                        Updated {formatDate(e.updated_at.split('T')[0])}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete confirmation */}
      {deletingExpense && (
        <DeleteConfirm
          description={deletingExpense.desc}
          onConfirm={() => { deleteExpense(deletingExpense.id); setDeletingExpense(null); }}
          onCancel={() => setDeletingExpense(null)}
        />
      )}
    </div>
  );
}
