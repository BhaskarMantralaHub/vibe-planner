'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '../lib/utils';
import { FaCheckCircle, FaExclamationCircle, FaTimesCircle } from 'react-icons/fa';

const FEE_AMOUNT = 60;

export default function FeeTracker() {
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { players, fees, selectedSeasonId, seasons, recordFee } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  const feeAmount = season?.fee_amount ?? FEE_AMOUNT;

  const [payingPlayer, setPayingPlayer] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));

  const totalExpected = activePlayers.length * feeAmount;
  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const paidCount = seasonFees.filter((f) => Number(f.amount_paid) >= feeAmount).length;
  const progressPct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  const handleMarkPaid = (playerId: string) => {
    if (!selectedSeasonId) return;
    recordFee(selectedSeasonId, playerId, feeAmount);
  };

  const handlePartialSubmit = () => {
    if (!selectedSeasonId || !payingPlayer || !payAmount) return;
    recordFee(selectedSeasonId, payingPlayer, parseFloat(payAmount));
    setPayingPlayer(null);
    setPayAmount('');
  };

  return (
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 sm:p-5 min-w-0">
      {/* Header + Progress */}
      <div className="mb-5">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-[16px] font-semibold text-[var(--text)]">Season Fee</h3>
          <span className="text-[14px] font-bold text-[var(--orange)]">{formatCurrency(feeAmount)}/player</span>
        </div>
        <div className="flex items-center gap-3 mb-1.5">
          <div className="flex-1 h-2.5 bg-[var(--border)] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${Math.min(progressPct, 100)}%`,
                background: progressPct >= 100 ? 'var(--green)' : progressPct >= 50 ? 'var(--orange)' : 'var(--red)',
              }}
            />
          </div>
          <span className="text-[13px] font-semibold text-[var(--text)] whitespace-nowrap">{progressPct}%</span>
        </div>
        <div className="flex justify-between text-[12px] text-[var(--muted)]">
          <span>Collected {formatCurrency(totalCollected)} of {formatCurrency(totalExpected)}</span>
          <span>{paidCount}/{activePlayers.length} paid</span>
        </div>
      </div>

      {/* Partial payment inline form */}
      {payingPlayer && (
        <div className="mb-4 p-3 rounded-xl border border-[var(--orange)]/20 bg-[var(--orange)]/5">
          <p className="text-[12px] text-[var(--muted)] mb-2">
            Record partial payment for <b>{activePlayers.find((p) => p.id === payingPlayer)?.name}</b>
          </p>
          <div className="flex gap-2">
            <input
              type="number" step="0.01" value={payAmount}
              onChange={(e) => setPayAmount(e.target.value)}
              className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none"
              placeholder="Amount"
              autoFocus
            />
            <button onClick={handlePartialSubmit}
              disabled={!payAmount}
              className="rounded-lg bg-[var(--green)] px-3 py-2 text-[13px] font-medium text-white cursor-pointer disabled:opacity-40">
              Save
            </button>
            <button onClick={() => { setPayingPlayer(null); setPayAmount(''); }}
              className="rounded-lg px-3 py-2 text-[13px] text-[var(--muted)] cursor-pointer border border-[var(--border)]">
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Player fee list */}
      <div className="space-y-1.5">
        {activePlayers.map((p) => {
          const fee = feeMap[p.id];
          const paid = fee ? Number(fee.amount_paid) : 0;
          const isPaid = paid >= feeAmount;
          const isPartial = paid > 0 && paid < feeAmount;
          const isUnpaid = paid === 0;

          return (
            <div key={p.id} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-[var(--hover-bg)] transition-colors">
              {/* Status icon */}
              {isPaid && <FaCheckCircle size={16} className="flex-shrink-0" style={{ color: 'var(--green)' }} />}
              {isPartial && <FaExclamationCircle size={16} className="flex-shrink-0" style={{ color: 'var(--orange)' }} />}
              {isUnpaid && <FaTimesCircle size={16} className="flex-shrink-0" style={{ color: 'var(--red)' }} />}

              {/* Jersey */}
              <span className="text-[12px] font-bold text-[var(--orange)] w-8 text-center flex-shrink-0">
                {p.jersey_number ? `#${p.jersey_number}` : '—'}
              </span>

              {/* Name */}
              <span className={`flex-1 text-[14px] font-medium min-w-0 truncate ${isUnpaid ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>
                {p.name}
              </span>

              {/* Amount + status */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <span className="text-[13px] font-semibold" style={{
                  color: isPaid ? 'var(--green)' : isPartial ? 'var(--orange)' : 'var(--red)',
                }}>
                  {isPaid ? formatCurrency(feeAmount) : isPartial ? formatCurrency(paid) : '$0'}
                </span>

                {fee?.paid_date && (
                  <span className="text-[11px] text-[var(--dim)] hidden sm:inline">
                    {new Date(fee.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  </span>
                )}

                {/* Admin actions */}
                {isAdmin && !isPaid && (
                  <div className="flex gap-1">
                    <button onClick={() => handleMarkPaid(p.id)}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-white bg-[var(--green)] cursor-pointer hover:opacity-90">
                      Paid
                    </button>
                    <button onClick={() => { setPayingPlayer(p.id); setPayAmount(String(paid || '')); }}
                      className="rounded-md px-2 py-1 text-[11px] font-medium text-[var(--orange)] border border-[var(--orange)]/30 cursor-pointer hover:bg-[var(--orange)]/10">
                      Partial
                    </button>
                  </div>
                )}

                {isAdmin && isPaid && (
                  <span className="text-[11px] text-[var(--green)] font-medium">Paid</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
