'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency } from '../lib/utils';
import { EmptyState, Dialog, DialogContent, DialogTitle, DialogDescription, DialogFooter, Button } from '@/components/ui';
import { FaCheckCircle, FaExclamationCircle, FaTimesCircle } from 'react-icons/fa';
import { MdEdit, MdUndo } from 'react-icons/md';
import { toast } from 'sonner';

export default function FeeTracker() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const adminName = (user?.user_metadata?.full_name as string) || user?.email || 'Admin';
  const { players, fees, selectedSeasonId, seasons, updateSeason, recordFee, deleteFee } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  const feeAmount = season?.fee_amount ?? 60;

  const [filter, setFilter] = useState<'all' | 'unpaid' | 'partial' | 'paid'>('all');
  const [editingFee, setEditingFee] = useState(false);
  const [feeInput, setFeeInput] = useState(String(feeAmount));
  const [payingPlayer, setPayingPlayer] = useState<string | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [undoPlayer, setUndoPlayer] = useState<{ id: string; name: string } | null>(null);

  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feeMap = Object.fromEntries(seasonFees.map((f) => [f.player_id, f]));

  const totalExpected = activePlayers.length * feeAmount;
  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const paidCount = seasonFees.filter((f) => Number(f.amount_paid) >= feeAmount).length;
  const partialCount = seasonFees.filter((f) => Number(f.amount_paid) > 0 && Number(f.amount_paid) < feeAmount).length;
  const unpaidCount = activePlayers.length - paidCount - partialCount;
  const progressPct = totalExpected > 0 ? Math.round((totalCollected / totalExpected) * 100) : 0;

  // Classify each player's payment status
  const classifyPlayer = (playerId: string) => {
    const fee = feeMap[playerId];
    const paid = fee ? Number(fee.amount_paid) : 0;
    if (paid >= feeAmount) return 'paid';
    if (paid > 0) return 'partial';
    return 'unpaid';
  };

  // Filter players based on active filter
  const filteredPlayers = activePlayers.filter((p) => {
    if (filter === 'all') return true;
    return classifyPlayer(p.id) === filter;
  });

  // Sort players based on active filter
  const sortedPlayers = [...filteredPlayers].sort((a, b) => {
    const statusA = classifyPlayer(a.id);
    const statusB = classifyPlayer(b.id);

    if (filter === 'all') {
      const order = { unpaid: 0, partial: 1, paid: 2 };
      if (order[statusA] !== order[statusB]) return order[statusA] - order[statusB];
      return a.name.localeCompare(b.name);
    }
    if (filter === 'unpaid') {
      return a.name.localeCompare(b.name);
    }
    if (filter === 'partial') {
      const paidA = feeMap[a.id] ? Number(feeMap[a.id].amount_paid) : 0;
      const paidB = feeMap[b.id] ? Number(feeMap[b.id].amount_paid) : 0;
      return paidA - paidB;
    }
    // paid: most recent payment date first
    const dateA = feeMap[a.id]?.paid_date ?? '';
    const dateB = feeMap[b.id]?.paid_date ?? '';
    return dateB.localeCompare(dateA);
  });

  const filterOptions = [
    { key: 'all' as const, label: 'All', count: activePlayers.length },
    { key: 'unpaid' as const, label: 'Unpaid', count: unpaidCount },
    { key: 'partial' as const, label: 'Partial', count: partialCount },
    { key: 'paid' as const, label: 'Paid', count: paidCount },
  ];

  const saveFeeAmount = () => {
    const val = parseFloat(feeInput);
    if (!selectedSeasonId || isNaN(val) || val <= 0) return;
    updateSeason(selectedSeasonId, { fee_amount: val });
    setEditingFee(false);
  };

  const handleMarkPaid = (playerId: string) => {
    if (!selectedSeasonId) return;
    recordFee(selectedSeasonId, playerId, feeAmount, adminName);
    toast.success('Fee marked as paid');
  };

  const confirmUndo = () => {
    if (!undoPlayer) return;
    const fee = feeMap[undoPlayer.id];
    if (fee) {
      deleteFee(fee.id);
      toast.success(`Payment reverted for ${undoPlayer.name}`);
    }
    setUndoPlayer(null);
  };

  const handlePartialSubmit = () => {
    if (!selectedSeasonId || !payingPlayer || !payAmount) return;
    recordFee(selectedSeasonId, payingPlayer, parseFloat(payAmount), adminName);
    toast.success('Partial payment recorded');
    setPayingPlayer(null);
    setPayAmount('');
  };

  return (
    <div className="space-y-5">
      {/* Summary card */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden">
        {/* Fee amount header */}
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[17px] sm:text-[18px] font-bold text-[var(--text)] tracking-tight">Season Fee</h3>
          {isAdmin && !editingFee ? (
            <button onClick={() => { setFeeInput(String(feeAmount)); setEditingFee(true); }}
              className="flex items-center gap-1.5 text-[15px] sm:text-[16px] font-extrabold text-[var(--cricket)] cursor-pointer hover:opacity-80 transition-opacity">
              {formatCurrency(feeAmount)}<span className="text-[12px] font-semibold text-[var(--muted)]">/player</span> <MdEdit size={14} className="text-[var(--muted)]" />
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
            <span className="text-[15px] sm:text-[16px] font-extrabold text-[var(--cricket)]">{formatCurrency(feeAmount)}<span className="text-[12px] font-semibold text-[var(--muted)]">/player</span></span>
          )}
        </div>

        {/* Progress bar with percentage */}
        <div className="mb-3 relative">
          <div className="h-4 bg-[var(--border)]/60 rounded-full overflow-hidden">
            <div className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(progressPct, 100)}%`,
                background: progressPct >= 100
                  ? 'linear-gradient(90deg, #059669, #10B981)'
                  : progressPct >= 50
                    ? 'linear-gradient(90deg, var(--cricket-accent), var(--cricket))'
                    : 'linear-gradient(90deg, #DC2626, #EF4444)',
              }} />
          </div>
          {progressPct > 8 && (
            <span className="absolute inset-0 flex items-center justify-center text-[10px] font-extrabold text-white drop-shadow-sm">
              {progressPct}%
            </span>
          )}
        </div>

        {/* Stats row */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[13px] sm:text-[14px] font-semibold text-[var(--text)]">
            <span className="font-extrabold">{formatCurrency(totalCollected)}</span>
            <span className="text-[var(--muted)] font-normal"> of </span>
            <span className="text-[var(--muted)]">{formatCurrency(totalExpected)}</span>
          </span>
          <div className="flex gap-2 sm:gap-3">
            <span className="inline-flex items-center gap-1 text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: '#05966915', color: '#059669' }}>
              <FaCheckCircle size={10} /> {paidCount}
            </span>
            {partialCount > 0 && (
              <span className="inline-flex items-center gap-1 text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: 'color-mix(in srgb, var(--cricket-accent) 8%, transparent)', color: 'var(--cricket-accent)' }}>
                <FaExclamationCircle size={10} /> {partialCount}
              </span>
            )}
            <span className="inline-flex items-center gap-1 text-[12px] font-bold rounded-full px-2 py-0.5" style={{ background: '#EF444415', color: '#EF4444' }}>
              <FaTimesCircle size={10} /> {unpaidCount}
            </span>
          </div>
        </div>
      </div>

      {/* Filter chips */}
      {activePlayers.length > 0 && (
        <div className="flex gap-2 overflow-x-auto no-scrollbar">
          {filterOptions.map((opt) => (
            <button
              key={opt.key}
              onClick={() => setFilter(opt.key)}
              className={`flex-shrink-0 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-all cursor-pointer ${
                filter === opt.key
                  ? 'bg-[var(--cricket)] text-white'
                  : 'bg-transparent border border-[var(--border)] text-[var(--muted)] hover:border-[var(--cricket)]/30'
              }`}
            >
              {opt.label} {opt.count}
            </button>
          ))}
        </div>
      )}

      {/* Player fee cards */}
      {activePlayers.length === 0 ? (
        <EmptyState
          icon="🏏"
          title="No players yet"
          description="Add players to the roster to start tracking fees"
        />
      ) : (
      <div className="space-y-2">
        {sortedPlayers.length === 0 && (
          <p className="text-center text-[13px] text-[var(--muted)] py-6">
            No {filter} players
          </p>
        )}
        {sortedPlayers.map((p) => {
          const fee = feeMap[p.id];
          const paid = fee ? Number(fee.amount_paid) : 0;
          const isPaid = paid >= feeAmount;
          const isPartial = paid > 0 && paid < feeAmount;
          const statusColor = isPaid ? '#059669' : isPartial ? 'var(--cricket-accent)' : '#EF4444';

          return (
            <div key={p.id} className="rounded-xl border bg-[var(--surface)] p-2.5 sm:p-3 min-w-0 overflow-hidden"
              style={{ borderColor: isPaid ? '#05966940' : isPartial ? 'color-mix(in srgb, var(--cricket-accent) 25%, transparent)' : 'var(--border)', borderLeftWidth: isPaid || isPartial ? '4px' : '1px' }}>
              <div className="flex items-center gap-2.5 sm:gap-3">
                {/* Circular jersey badge with status ring */}
                <div className="flex-shrink-0 relative">
                  <div className="flex h-11 w-11 sm:h-12 sm:w-12 items-center justify-center rounded-full font-extrabold text-[13px] sm:text-[14px] transition-all"
                    style={{
                      backgroundColor: `${statusColor}15`,
                      color: statusColor,
                      border: `2.5px solid ${statusColor}45`,
                    }}>
                    {p.jersey_number ? `#${p.jersey_number}` : p.name.charAt(0)}
                  </div>
                  {/* Status dot */}
                  <div className="absolute -bottom-0.5 -right-0.5 h-4 w-4 rounded-full flex items-center justify-center"
                    style={{ backgroundColor: statusColor, border: '2px solid var(--surface)' }}>
                    {isPaid && <FaCheckCircle size={8} color="#fff" />}
                    {isPartial && <FaExclamationCircle size={8} color="#fff" />}
                    {!isPaid && !isPartial && <FaTimesCircle size={8} color="#fff" />}
                  </div>
                </div>

                {/* Player info */}
                <div className="flex-1 min-w-0">
                  <span className="text-[14px] sm:text-[15px] font-bold text-[var(--text)] truncate block">{p.name}</span>
                  {fee?.paid_date ? (
                    <p className="text-[11px] sm:text-[12px] text-[var(--muted)] mt-0.5 truncate">
                      <span className="font-semibold" style={{ color: statusColor }}>{isPaid ? 'Paid' : 'Partial'}</span>
                      {' '}{new Date(fee.paid_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                      {fee.marked_by && (
                        <> <span className="text-[var(--border)]">&middot;</span> by {fee.marked_by}</>
                      )}
                    </p>
                  ) : (
                    <p className="text-[11px] sm:text-[12px] text-[var(--dim)] mt-0.5">Not paid</p>
                  )}
                </div>

                {/* Amount — hero number */}
                <div className="flex-shrink-0 text-right">
                  <span className="text-[16px] sm:text-[18px] font-extrabold tabular-nums" style={{ color: statusColor }}>
                    {formatCurrency(paid)}
                  </span>
                  {isPartial && (
                    <span className="block text-[10px] font-medium text-[var(--dim)] tabular-nums">of {formatCurrency(feeAmount)}</span>
                  )}
                </div>

                {/* Actions */}
                {isAdmin && (
                  <div className="flex gap-1 flex-shrink-0">
                    {(isPaid || isPartial) ? (
                      <button onClick={() => setUndoPlayer({ id: p.id, name: p.name })}
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
                          style={{ background: 'linear-gradient(135deg, var(--cricket-accent), var(--cricket))', color: '#fff', border: '1.5px solid var(--cricket-accent)', boxShadow: '0 2px 8px var(--cricket-glow)' }}>
                          Partial
                        </button>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Inline partial payment form */}
              {payingPlayer === p.id && (
                <div className="mt-2.5 pt-2.5 border-t border-[var(--border)]/50">
                  <div className="flex items-center gap-2">
                    <span className="text-[13px] font-semibold text-[var(--muted)]">$</span>
                    <input type="number" step="0.01" value={payAmount} onChange={(e) => setPayAmount(e.target.value)}
                      className="min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] font-semibold text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
                      placeholder="Amount" autoFocus />
                    <button onClick={handlePartialSubmit} disabled={!payAmount}
                      className="flex-shrink-0 rounded-lg px-3 py-2 text-[12px] font-bold text-white cursor-pointer disabled:opacity-40"
                      style={{ background: 'linear-gradient(135deg, #059669, #10B981)' }}>
                      Save
                    </button>
                    <button onClick={() => { setPayingPlayer(null); setPayAmount(''); }}
                      className="flex-shrink-0 rounded-lg px-2 py-2 text-[12px] font-medium text-[var(--muted)] cursor-pointer border border-[var(--border)]">
                      &times;
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
      )}

      {/* Undo payment confirmation */}
      <Dialog open={!!undoPlayer} onOpenChange={(open) => { if (!open) setUndoPlayer(null); }}>
        <DialogContent showClose={false} className="max-w-xs text-center">
          <div className="mb-3 text-2xl">&#9888;&#65039;</div>
          <DialogTitle className="text-center">Revert payment?</DialogTitle>
          <DialogDescription className="text-center">
            This will remove the fee payment record for <strong>{undoPlayer?.name}</strong>. They will show as unpaid.
          </DialogDescription>
          <DialogFooter className="mt-5">
            <Button variant="secondary" size="lg" fullWidth onClick={() => setUndoPlayer(null)}>
              Cancel
            </Button>
            <Button variant="danger" size="lg" fullWidth onClick={confirmUndo}>
              Revert
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
