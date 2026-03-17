'use client';

import { useState, useEffect, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';
import { FaTshirt, FaTrophy, FaUtensils, FaBox } from 'react-icons/fa';
import { MdSportsCricket } from 'react-icons/md';
import type { IconType } from 'react-icons';

const CATEGORY_ICONS: Record<string, IconType> = {
  FaTshirt, MdSportsCricket, FaTrophy, FaUtensils, FaBox,
};
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

  useEffect(() => {
    if (anchorRef.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const menuWidth = 150;
      const left = Math.min(rect.right - menuWidth, window.innerWidth - menuWidth - 8);
      setPos({ top: rect.bottom + 4, left: Math.max(8, left) });
    }
    const close = () => onClose();
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRef, onClose]);

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

/* ── Inline Edit Form ── */
function InlineEditForm({ expense, onSave, onCancel }: {
  expense: { category: string; description: string; amount: number; expense_date: string };
  onSave: (updates: { category: string; description: string; amount: number; expense_date: string }) => void;
  onCancel: () => void;
}) {
  const [cat, setCat] = useState(expense.category);
  const [desc, setDesc] = useState(expense.description);
  const [amt, setAmt] = useState(String(expense.amount));
  const [date, setDate] = useState(expense.expense_date);

  return (
    <div className="space-y-3">
      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((c) => {
          const active = cat === c.key;
          const Icon = CATEGORY_ICONS[c.iconName];
          return (
            <button key={c.key} onClick={() => setCat(c.key)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer border transition-all"
              style={{
                backgroundColor: active ? `${c.color}15` : 'transparent',
                borderColor: active ? c.color : 'var(--border)',
                color: active ? c.color : 'var(--muted)',
              }}>
              {Icon && <Icon size={12} />} {c.label}
            </button>
          );
        })}
      </div>
      <input value={desc} onChange={(e) => setDesc(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
        placeholder="Description" />
      <div className="flex gap-2">
        <input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
          placeholder="Amount" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors" />
      </div>
      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover-bg)]">
          Cancel
        </button>
        <button onClick={() => onSave({ category: cat, description: desc, amount: parseFloat(amt), expense_date: date })}
          disabled={!amt}
          className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white cursor-pointer disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)' }}>
          Save
        </button>
      </div>
    </div>
  );
}

export default function ExpenseList() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { expenses, fees, sponsorships, players, selectedSeasonId, deleteExpense, restoreExpense, updateExpense, setShowExpenseForm } = useCricketStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; desc: string } | null>(null);
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const allSeasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const seasonExpenses = allSeasonExpenses.filter((e) => !e.deleted_at);
  const deletedExpenses = allSeasonExpenses.filter((e) => e.deleted_at);
  const [showDeleted, setShowDeleted] = useState(false);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const activePlayers = players.filter((p) => p.is_active);

  const seasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId);
  const totalFees = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSponsorship = seasonSponsors.reduce((sum, s) => sum + Number(s.amount), 0);
  const totalCollected = totalFees + totalSponsorship;
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

        <div className="flex flex-wrap gap-3 text-[12px] sm:text-[13px] font-semibold">
          <span className="text-[var(--green)]">Fees: {formatCurrency(totalFees)}</span>
          {totalSponsorship > 0 && <span className="text-[var(--orange)]">Sponsors: {formatCurrency(totalSponsorship)}</span>}
          <span className="text-[var(--red)]">Spent: {formatCurrency(totalSpent)}</span>
        </div>

        {isLow && activePlayers.length > 0 && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2.5"
            style={{ background: 'color-mix(in srgb, var(--red) 12%, var(--surface))', border: '1.5px solid color-mix(in srgb, var(--red) 30%, transparent)' }}>
            <FaExclamationTriangle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--red)' }} />
            <div>
              <p className="text-[14px] font-bold text-[var(--red)]">Insufficient funds</p>
              <p className="text-[13px] leading-relaxed text-[var(--text)]">
                Pool is short by <span className="font-extrabold text-[var(--red)]">{formatCurrency(poolBalance)}</span>. Suggest collecting <span className="font-extrabold text-[var(--orange)]">{formatCurrency(perPerson)}</span> per player ({activePlayers.length} players).
              </p>
            </div>
          </div>
        )}

        {!isLow && totalCollected > 0 && poolBalance > 0 && (
          <div className="mt-3 p-3 rounded-xl flex items-start gap-2.5"
            style={{ background: 'color-mix(in srgb, var(--blue) 10%, var(--surface))', border: '1px solid color-mix(in srgb, var(--blue) 25%, transparent)' }}>
            <FaCheckCircle size={16} className="flex-shrink-0 mt-0.5" style={{ color: 'var(--blue)' }} />
            <div>
              <p className="text-[14px] font-bold text-[var(--blue)]">Funds available</p>
              <p className="text-[13px] leading-relaxed text-[var(--text)]">
                <span className="font-bold text-[var(--blue)]">{formatCurrency(poolBalance)}</span> remaining. Rolls over to next season.
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
                    <>
                      <button
                        ref={openMenu === e.id ? menuBtnRef : null}
                        onClick={() => setOpenMenu(openMenu === e.id ? null : e.id)}
                        className="absolute top-2.5 right-2.5 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
                        <FaEllipsisV size={12} />
                      </button>

                      {openMenu === e.id && (
                        <ExpenseMenu
                          anchorRef={menuBtnRef}
                          onEdit={() => { setEditingExpense(e.id); setOpenMenu(null); }}
                          onDelete={() => { setDeletingExpense({ id: e.id, desc: e.description || cfg.label }); setOpenMenu(null); }}
                          onClose={() => setOpenMenu(null)}
                        />
                      )}
                    </>
                  )}

                  {editingExpense === e.id ? (
                    <InlineEditForm
                      expense={e}
                      onSave={(updates) => { updateExpense(e.id, updates as Partial<typeof e>); setEditingExpense(null); }}
                      onCancel={() => setEditingExpense(null)}
                    />
                  ) : (
                    <>
                      <div className="flex items-start gap-3 pr-8">
                        {/* Category icon */}
                        <div className="flex-shrink-0">
                          {(() => {
                            const Icon = CATEGORY_ICONS[cfg.iconName];
                            return (
                              <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                                style={{ backgroundColor: `${cfg.color}15`, border: `1.5px solid ${cfg.color}30` }}>
                                {Icon && <Icon size={18} style={{ color: cfg.color }} />}
                              </div>
                            );
                          })()}
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

                      {/* Footer */}
                      <div className="mt-2.5 pt-2 border-t border-[var(--border)]/30 space-y-1 text-[11px]">
                        <div className="flex items-center gap-2">
                          <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                            style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                            Added
                          </span>
                          <span className="text-[var(--text)] font-bold">{formatDate(e.created_at?.split('T')[0] || e.expense_date)}</span>
                          {adminName && <span className="text-[var(--muted)] font-medium">by <span className="text-[var(--text)] font-bold">{adminName}</span></span>}
                        </div>
                        {e.updated_at && e.updated_at !== e.created_at && (
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                              Updated
                            </span>
                            <span className="text-[var(--text)] font-bold">{formatDate(e.updated_at.split('T')[0])}</span>
                            {adminName && <span className="text-[var(--muted)] font-medium">by <span className="text-[var(--text)] font-bold">{adminName}</span></span>}
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently Deleted */}
      {isAdmin && deletedExpenses.length > 0 && (
        <div className="rounded-2xl border border-[var(--red)]/20 bg-[var(--card)] overflow-hidden min-w-0">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          >
            <span className="text-[14px] font-semibold text-[var(--red)]">
              Recently Deleted ({deletedExpenses.length})
            </span>
            <span className="text-[var(--muted)] text-[12px]">{showDeleted ? '▲' : '▼'}</span>
          </button>

          {showDeleted && (
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
              {deletedExpenses.map((e) => {
                const cfg = getCategoryConfig(e.category);
                const Icon = CATEGORY_ICONS[cfg.iconName];
                return (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl border bg-[var(--surface)] p-2.5"
                    style={{ borderColor: 'color-mix(in srgb, var(--red) 25%, var(--border))' }}>
                    <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cfg.color}20` }}>
                      {Icon && <Icon size={16} style={{ color: cfg.color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[13px] font-semibold text-[var(--text)] truncate">{e.description || cfg.label}</p>
                      <p className="text-[11px] text-[var(--muted)]">
                        <span className="font-semibold">{formatDate(e.expense_date)}</span>
                        {e.deleted_by && <> &middot; Deleted by <span className="font-bold text-[var(--text)]">{e.deleted_by}</span></>}
                      </p>
                    </div>
                    <span className="text-[14px] font-extrabold text-[var(--text)] flex-shrink-0">{formatCurrency(Number(e.amount))}</span>
                    <button
                      onClick={() => restoreExpense(e.id)}
                      className="flex-shrink-0 rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer active:scale-95 transition-all"
                      style={{ background: 'var(--surface)', color: 'var(--green)', border: '1.5px solid var(--border)' }}
                    >
                      Restore
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
      {deletingExpense && (
        <DeleteConfirm
          description={deletingExpense.desc}
          onConfirm={() => { deleteExpense(deletingExpense.id, adminName); setDeletingExpense(null); }}
          onCancel={() => setDeletingExpense(null)}
        />
      )}
    </div>
  );
}
