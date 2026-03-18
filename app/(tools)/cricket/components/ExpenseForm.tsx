'use client';

import { useState, useEffect } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';
import { FaTshirt, FaTrophy, FaUtensils, FaBox } from 'react-icons/fa';
import { MdSportsCricket } from 'react-icons/md';
import type { IconType } from 'react-icons';

const CATEGORY_ICONS: Record<string, IconType> = {
  FaTshirt, MdSportsCricket, FaTrophy, FaUtensils, FaBox,
};

const EXPENSE_FORM_KEY = 'cricket_expense_form_draft';

export default function ExpenseForm() {
  const { user } = useAuthStore();
  const { selectedSeasonId, addExpense, showExpenseForm, setShowExpenseForm } = useCricketStore();

  const getSavedForm = () => {
    try {
      const saved = sessionStorage.getItem(EXPENSE_FORM_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  };

  const draft = getSavedForm();
  const [category, setCategory] = useState(draft?.category ?? 'ground');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [date, setDate] = useState(draft?.date ?? new Date().toISOString().split('T')[0]);

  // Restore modal open state after iOS Safari reload
  useEffect(() => {
    if (draft && (draft.description || draft.amount)) {
      setShowExpenseForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form state to sessionStorage for iOS Safari survival
  useEffect(() => {
    if (showExpenseForm && (description || amount)) {
      sessionStorage.setItem(EXPENSE_FORM_KEY, JSON.stringify({ category, description, amount, date }));
    }
  }, [category, description, amount, date, showExpenseForm]);

  // Lock body scroll when modal is open (position:fixed for iOS Safari)
  useEffect(() => {
    if (!showExpenseForm) return;
    const scrollY = window.scrollY;
    document.body.style.position = 'fixed';
    document.body.style.top = `-${scrollY}px`;
    document.body.style.left = '0';
    document.body.style.right = '0';
    return () => {
      document.body.style.position = '';
      document.body.style.top = '';
      document.body.style.left = '';
      document.body.style.right = '';
      window.scrollTo(0, scrollY);
    };
  }, [showExpenseForm]);

  if (!showExpenseForm) return null;

  const resetAndClose = () => {
    setCategory('ground');
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setShowExpenseForm(false);
    sessionStorage.removeItem(EXPENSE_FORM_KEY);
  };

  const handleSubmit = () => {
    if (!user || !selectedSeasonId || !amount) return;

    const userName = (user.user_metadata?.full_name as string) || user.email || '';
    addExpense(user.id, selectedSeasonId, {
      category,
      description: description.trim(),
      amount: parseFloat(amount),
      expense_date: date,
    }, userName);

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
          <label className="mb-2 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Category</label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = category === c.key;
              const Icon = CATEGORY_ICONS[c.iconName];
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 cursor-pointer transition-all border-2 active:scale-95"
                  style={{
                    backgroundColor: active ? `${c.color}15` : 'var(--surface)',
                    borderColor: active ? c.color : 'var(--border)',
                    boxShadow: active ? `0 2px 12px ${c.color}20` : 'none',
                  }}
                >
                  {Icon && <Icon size={20} style={{ color: active ? c.color : 'var(--muted)' }} />}
                  <span className="text-[11px] font-bold" style={{ color: active ? c.color : 'var(--muted)' }}>
                    {c.label}
                  </span>
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
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
            placeholder="Ground booking, balls, etc."
          />
        </div>

        {/* Amount + Date */}
        <div className="mb-5 grid grid-cols-[1fr_140px] gap-3">
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Amount ($)</label>
            <input
              type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
              placeholder="0.00"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-[12px] font-semibold uppercase tracking-wide text-[var(--muted)]">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--orange)] transition-colors"
            />
          </div>
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!amount}
          className="w-full rounded-xl px-4 py-3 text-[14px] font-bold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
          style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', border: '1.5px solid #D97706', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}
        >
          Add Expense
        </button>
      </div>
    </>
  );
}
