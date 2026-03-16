'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';

export default function ExpenseForm() {
  const { user } = useAuthStore();
  const { players, selectedSeasonId, addExpense, showExpenseForm, setShowExpenseForm } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const [category, setCategory] = useState('ground');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [paidBy, setPaidBy] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedPlayers, setSelectedPlayers] = useState<string[]>([]);
  const [splitAll, setSplitAll] = useState(true);

  if (!showExpenseForm) return null;

  const resetAndClose = () => {
    setCategory('ground');
    setDescription('');
    setAmount('');
    setPaidBy('');
    setDate(new Date().toISOString().split('T')[0]);
    setSelectedPlayers([]);
    setSplitAll(true);
    setShowExpenseForm(false);
  };

  const handleSubmit = () => {
    if (!user || !selectedSeasonId || !paidBy || !amount) return;
    const splitIds = splitAll ? activePlayers.map((p) => p.id) : selectedPlayers;
    if (splitIds.length === 0) return;

    addExpense(user.id, selectedSeasonId, {
      paid_by: paidBy,
      category,
      description: description.trim(),
      amount: parseFloat(amount),
      expense_date: date,
    }, splitIds);

    resetAndClose();
  };

  const togglePlayer = (id: string) => {
    setSelectedPlayers((prev) => prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]);
  };

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-50 bg-black/50" onClick={resetAndClose} />

      {/* Modal */}
      <div className="fixed inset-x-4 top-[10%] z-50 mx-auto max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl animate-slide-in">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[18px] font-bold text-[var(--text)]">Add Expense</h3>
          <button onClick={resetAndClose} className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer text-lg">✕</button>
        </div>

        {/* Category */}
        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Category</label>
          <div className="flex flex-wrap gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const cfg = getCategoryConfig(c.key);
              const active = category === c.key;
              return (
                <button
                  key={c.key}
                  onClick={() => setCategory(c.key)}
                  className="rounded-lg px-3 py-1.5 text-[13px] font-medium cursor-pointer transition-all border"
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

        {/* Description + Amount row */}
        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Description</label>
            <input
              value={description} onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
              placeholder="Ground booking, balls, etc."
            />
          </div>
          <div className="w-28">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Amount ($)</label>
            <input
              type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
              placeholder="0.00"
            />
          </div>
        </div>

        {/* Paid by + Date row */}
        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Paid By</label>
            <select
              value={paidBy} onChange={(e) => setPaidBy(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
            >
              <option value="">Select player</option>
              {activePlayers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className="w-40">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
            />
          </div>
        </div>

        {/* Split among */}
        <div className="mb-5">
          <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Split Among</label>
          <label className="mb-2 flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox" checked={splitAll}
              onChange={(e) => { setSplitAll(e.target.checked); if (e.target.checked) setSelectedPlayers([]); }}
              className="accent-[var(--orange)]"
            />
            <span className="text-[13px] text-[var(--text)]">All players ({activePlayers.length})</span>
          </label>
          {!splitAll && (
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {activePlayers.map((p) => (
                <button
                  key={p.id}
                  onClick={() => togglePlayer(p.id)}
                  className="rounded-lg px-3 py-1.5 text-[13px] cursor-pointer border transition-all"
                  style={{
                    backgroundColor: selectedPlayers.includes(p.id) ? 'var(--orange)' : 'transparent',
                    borderColor: selectedPlayers.includes(p.id) ? 'var(--orange)' : 'var(--border)',
                    color: selectedPlayers.includes(p.id) ? 'white' : 'var(--text)',
                  }}
                >
                  {p.name}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={!paidBy || !amount || (!splitAll && selectedPlayers.length === 0)}
          className="w-full rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-4 py-3 text-[15px] font-semibold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Add Expense
        </button>
      </div>
    </>
  );
}
