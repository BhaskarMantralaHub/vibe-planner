'use client';

import { useState, useEffect } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const SETTLE_FORM_KEY = 'cricket_settle_form_draft';

export default function SettleUpModal() {
  const { user } = useAuthStore();
  const { players, selectedSeasonId, showSettleForm, setShowSettleForm, addSettlement } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const getSavedForm = () => {
    try { const s = sessionStorage.getItem(SETTLE_FORM_KEY); return s ? JSON.parse(s) : null; } catch { return null; }
  };
  const draft = getSavedForm();
  const [fromPlayer, setFromPlayer] = useState(draft?.fromPlayer ?? '');
  const [toPlayer, setToPlayer] = useState(draft?.toPlayer ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [date, setDate] = useState(draft?.date ?? new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (draft && (draft.fromPlayer || draft.amount)) setShowSettleForm(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (showSettleForm && (fromPlayer || amount)) {
      sessionStorage.setItem(SETTLE_FORM_KEY, JSON.stringify({ fromPlayer, toPlayer, amount, date }));
    }
  }, [fromPlayer, toPlayer, amount, date, showSettleForm]);

  if (!showSettleForm) return null;

  const resetAndClose = () => {
    setFromPlayer('');
    setToPlayer('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setShowSettleForm(false);
    sessionStorage.removeItem(SETTLE_FORM_KEY);
  };

  const handleSubmit = () => {
    if (!user || !selectedSeasonId || !fromPlayer || !toPlayer || !amount || fromPlayer === toPlayer) return;
    addSettlement(user.id, selectedSeasonId, {
      from_player: fromPlayer,
      to_player: toPlayer,
      amount: parseFloat(amount),
      settled_date: date,
    });
    toast.success('Settlement recorded');
    resetAndClose();
  };

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/50" onClick={resetAndClose} />
      <div className="fixed inset-x-4 top-[20%] z-50 mx-auto max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl animate-slide-in">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-[18px] font-bold text-[var(--text)]">Record Settlement</h3>
          <button onClick={resetAndClose} className="text-[var(--muted)] hover:text-[var(--text)] cursor-pointer text-lg">✕</button>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">From (who is paying)</label>
          <select
            value={fromPlayer} onChange={(e) => setFromPlayer(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
          >
            <option value="">Select player</option>
            {activePlayers.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-4">
          <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">To (who receives)</label>
          <select
            value={toPlayer} onChange={(e) => setToPlayer(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
          >
            <option value="">Select player</option>
            {activePlayers.filter((p) => p.id !== fromPlayer).map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        <div className="mb-4 flex gap-3">
          <div className="flex-1">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Amount ($)</label>
            <input
              type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
              placeholder="0.00"
            />
          </div>
          <div className="w-40">
            <label className="mb-1.5 block text-[13px] font-medium text-[var(--muted)]">Date</label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none"
            />
          </div>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={!fromPlayer || !toPlayer || !amount || fromPlayer === toPlayer}
          variant="primary"
          brand="cricket"
          size="lg"
          fullWidth
        >
          Record Settlement
        </Button>
      </div>
    </>
  );
}
