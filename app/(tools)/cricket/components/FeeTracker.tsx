'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '../lib/utils';
import { FaCheckCircle, FaExclamationCircle, FaTimesCircle } from 'react-icons/fa';
import { MdEdit, MdUndo } from 'react-icons/md';

export default function FeeTracker() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const adminName = (user?.user_metadata?.full_name as string) || user?.email || 'Admin';
  const { players, fees, selectedSeasonId, seasons, updateSeason, recordFee, deleteFee } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  const feeAmount = season?.fee_amount ?? 60;

  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState(String(feeAmount));
  const [payingPlayer, setPayingPlayer] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));

  const totalExpected = activePlayers.length * feeAmount;
  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const paidCount = seasonFees.filter((f) => Number(f.amount_paid) >= feeAmount).length;
  const partialCount = seasonFees.filter((f) => Number(f.amount_paid) > 0 && Number(f.amount_paid) < feeAmount).length;
  const unpaidCount = activePlayers.length - paidCount - partialCount;
  const progressPct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const saveFeeAmount = () => {
    const val = parseFloat(feeInput);
    if (!selectedSeasonId || isNaN(val) || val <= 0) return;
    updateSeason(selectedSeasonId, { fee_amount: val });
    setEditingFee(false);
  };

  const handleMarkPaid = (playerId: string) => {
    if (!selectedSeasonId) return;
    recordFee(selectedSeasonId, playerId, feeAmount, adminName);
  };

  const handleUndo = (playerId: string) => {
    const fee = feeMap[playerId];
    if (fee) deleteFee(fee.id);
  };

  const handlePartialSubmit = () => {
    if (!selectedSeasonId || !payingPlayer || !payAmount) return;
    recordFee(selectedSeasonId, payingPlayer, parseFloat(payAmount), adminName);
    setPayingPlayer(null);
    setPayAmount('');
  };

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
        {/* Fee amount header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[16px] font-semibold text-[var(--text)]">Season Fee</h3>
          {isAdmin && !editingFee ? (
            <button onClick={() => { setFeeInput(String(feeAmount)); setEditingFee(true); }}
              className="flex items-center gap-1.5 text-[14px] font-bold text-[var(--orange)] cursor-pointer hover:opacity-80">
              {formatCurrency(feeAmount)}/player <MdEdit size={14} />
            </button>
          ) : isAdmin && editingFee ? (
            <div className="flex items-center gap-2">
              <span className="text-[13px] text-[var(--muted)]">$</span>
              <input type="number" step="0.01" value={feeInput} onChange={(e) => setFeeInput(e.target.value)}
                className="w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] px-2 py-1.5 text-[14px] text-[var(--text)] outline-none text-center font-bold"
                autoFocus onKeyDown={(e) => { if (e.key === 'Enter') saveFeeAmount(); if (e.key === 'Escape') setEditingFee(false); }} />
              <button onClick={saveFeeAmount} className="rounded-lg bg-[var(--green)] px-2.5 py-1.5 text-[12px] text-white cursor-pointer">Save</button>
              <button onClick={() => setEditingFee(false)} className="text-[12px] text-[var(--muted)] cursor-pointer">Cancel</button>
            </div>
          ) : (
            <span className="text-[14px] font-bold text-[var(--orange)]">{formatCurrency(feeAmount)}/player</span>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-2">
          <div className="h-3 bg-[var(--border)] rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(progressPct, 100)}%`,
                background: progressPct >= 100 ? 'var(--green)' : progressPct >= 50 ? 'var(--orange)' : 'var(--red)',
              }} />
          </div>
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap justify-between gap-1 text-[12px] sm:text-[13px]">
          <span className="text-[var(--muted)]">
            {formatCurrency(totalCollected)} / {formatCurrency(totalExpected)}
          </span>
          <div className="flex gap-2 sm:gap-3">
            <span className="flex items-center gap-1 text-[var(--green)]"><FaCheckCircle size={12} /> {paidCount}</span>
            {partialCount > 0 && <span className="flex items-center gap-1 text-[var(--orange)]"><FaExclamationCircle size={12} /> {partialCount}</span>}
            <span className="flex items-center gap-1 text-[var(--red)]"><FaTimesCircle size={12} /> {unpaidCount}</span>
          </div>
        </div>
      </div>

      {/* Player fee cards */}
      <div className="space-y-2">
        {activePlayers.map((p) => {
          const fee = feeMap[p.id];
          const paid = fee ? Number(fee.amount_paid) : 0;
          const isPaid = paid >= feeAmount;
          const isPartial = paid > 0 && paid < feeAmount;

          return (
            <div key={p.id} className="rounded-xl border bg-[var(--surface)] p-2.5 sm:p-3 min-w-0 overflow-hidden"
              style={{ borderColor: isPaid ? 'var(--green)' : isPartial ? 'var(--orange)' : 'var(--border)', borderLeftWidth: isPaid || isPartial ? '4px' : '1px' }}>
              <div className="flex items-center gap-2 sm:gap-3">
                {/* Jersey badge as status indicator */}
                <div className="flex-shrink-0 relative">
                  <div className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-xl font-bold text-[13px] sm:text-[14px] transition-all"
                    style={{
                      backgroundColor: isPaid ? '#05966920' : isPartial ? '#D9770620' : '#EF444420',
                      color: isPaid ? '#059669' : isPartial ? '#D97706' : '#EF4444',
                      border: `2px solid ${isPaid ? '#05966940' : isPartial ? '#D9770640' : '#EF444440'}`,
                    }}>
                    {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                  </div>
                  {/* Status dot overlay */}
                  <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: isPaid ? '#059669' : isPartial ? '#D97706' : '#EF4444', border: '2px solid var(--surface)' }}>
                    {isPaid && <FaCheckCircle size={8} color="#fff" />}
                    {isPartial && <FaExclamationCircle size={8} color="#fff" />}
                    {!isPaid && !isPartial && <FaTimesCircle size={8} color="#fff" />}
                  </div>
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="text-[13px] sm:text-[14px] font-semibold text-[var(--text)] truncate">{p.name}</span>
                  </div>
                  {fee?.paid_date && (
                    <span className="text-[11px] sm:text-[12px] block truncate" style={{
                      color: isPaid ? 'var(--green)' : isPartial ? 'var(--orange)' : 'var(--muted)',
                    }}>
                      {isPaid ? 'Paid' : 'Partial'} on {new Date(fee.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {fee.marked_by && (
                        <span className="text-[var(--muted)]"> &middot; by {fee.marked_by}</span>
                      )}
                    </span>
                  )}
                </div>

                {/* Amount */}
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                  <span className="text-[13px] sm:text-[15px] font-bold" style={{
                    color: isPaid ? 'var(--green)' : isPartial ? 'var(--orange)' : 'var(--red)',
                  }}>
                    {formatCurrency(paid)}
                    {isPartial && <span className="text-[10px] sm:text-[11px] font-normal text-[var(--dim)]"> / {formatCurrency(feeAmount)}</span>}
                  </span>
                </div>

                {/* Actions */}
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    {(isPaid || isPartial) ? (
                      <button onClick={() => handleUndo(p.id)}
                        className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center rounded-lg cursor-pointer bg-[var(--red)]/10 text-[var(--red)] hover:bg-[var(--red)]/20 transition-colors"
                        title="Undo payment">
                        <MdUndo size={15} />
                      </button>
                    ) : (
                      <>
                        <button onClick={() => handleMarkPaid(p.id)}
                          className="rounded-full px-3 sm:px-4 py-1.5 text-[11px] sm:text-[12px] font-bold tracking-wide uppercase cursor-pointer whitespace-nowrap transition-all active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #059669, #10B981)', color: '#fff', border: '1.5px solid #059669', boxShadow: '0 2px 8px rgba(16,185,129,0.25)' }}>
                          Mark Paid
                        </button>
                        <button onClick={() => { setPayingPlayer(p.id); setPayAmount(''); }}
                          className="rounded-full px-3 sm:px-4 py-1.5 text-[11px] sm:text-[12px] font-bold tracking-wide uppercase cursor-pointer whitespace-nowrap transition-all active:scale-95"
                          style={{ background: 'linear-gradient(135deg, #D97706, #F59E0B)', color: '#fff', border: '1.5px solid #D97706', boxShadow: '0 2px 8px rgba(245,158,11,0.25)' }}>
                          Partial
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Inline partial payment form */}
              {payingPlayer === p.id && (
                <div className="mt-2 pt-2 border-t border-[var(--border)]/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] text-[var(--muted)]">$</span>
                    <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                      className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
                      placeholder="Amount" autoFocus />
                    <button onClick={handlePartialSubmit} disabled={!payAmount}
                      className="rounded-lg px-3 py-2 text-[12px] font-semibold text-white cursor-pointer disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}>
                      Save
                    </button>
                    <button onClick={() => { setPayingPlayer(null); setPayAmount(''); }}
                      className="rounded-lg px-3 py-2 text-[12px] text-[var(--muted)] cursor-pointer border border-[var(--border)]">
                      Cancel
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
