'use client';

import { useState, useEffect } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';

export default function ExpenseForm() {
  const { user } = useAuthStore();
  const { selectedSeasonId, addExpense, showExpenseForm, setShowExpenseForm } = useCricketStore();

  const [category, setCategory] = useState('ground');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);

  // Lock body scroll when modal is open
  useEffect(() => {
    if (!showExpenseForm) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [showExpenseForm]);

  if (!showExpenseForm) return null;

  const resetAndClose = () => {
    setCategory('ground');
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setShowExpenseForm(false);
  };

  const handleSubmit = () => {
    if (!user || !selectedSeasonId || !amount) return;

    addExpense(user.id, selectedSeasonId, {
      paid_by: user.id,
      category,
      description: description.trim(),
      amount: parseFloat(amount),
      expense_date: date,
    }, []);

    resetAndClose();
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={resetAndClose} />

      {/* Modal */}
      <div className="fixed inset-x-3 top-[10%] z-50 mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl animate-slide-in">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[18px] font-bold text-[var(--text)]">Add Expense</h3>
          <button onClick={resetAndClose} className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer text-lg">✕</button>
        </div>

        {/* Category */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Category</label>
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => {
              const cfg = getCategoryConfig(c.key);
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className="rounded-lg px-3 py-1.5 text-[12px] font-medium cursor-pointer transition-all border"
                  style={{
                    backgroundColor: active ? cfg.bgColor : 'transparent',
                    borderColor: active ? cfg.borderColor : 'var(--border)',
                    color: active ? cfg.color : 'var(--muted)',
                  }}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Description</label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
            placeholder="Ground booking, balls, etc."
          />
        </div>

        {/* Amount + Date */}
        <div className="mb-5 grid grid-cols-[1fr_140px] gap-3">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount ($)</label>
            <input
              type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!amount}
          className="w-full rounded-xl px-4 py-3 text-[14px] font-semibold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ background: 'linear-gradient(135deg, var(--orange), var(--red))' }}
        >
          Add Expense
        </button>
      </div>
    </>
  );
}
