'use client';

import { useState, useMemo, useRef, useEffect } from 'react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody } from '@/components/ui/drawer';
import { Button, Text } from '@/components/ui';
import { useCricketStore } from '@/stores/cricket-store';
import { useSplitsStore } from '@/stores/splits-store';
import { useAuthStore } from '@/stores/auth-store';
import { nameToGradient } from '@/lib/avatar';
import { formatCurrency, formatDate } from '../lib/utils';
import { ArrowRight, Check, Handshake } from 'lucide-react';
import { toast } from 'sonner';

export default function SplitSettleDrawer() {
  const { showSettleForm, settleTarget, addSplitSettlement, splits, shares, settlements } = useSplitsStore();
  const { players, selectedSeasonId } = useCricketStore();
  const { user } = useAuthStore();

  const setOpen = (v: boolean) => useSplitsStore.setState({
    showSettleForm: v,
    ...(v ? {} : { settleTarget: null }),
  });

  const fromPlayer = players.find((p) => p.id === settleTarget?.fromId);
  const toPlayer = players.find((p) => p.id === settleTarget?.toId);

  // Compute actual net owed between from → to across all splits + settlements
  const suggestedAmount = useMemo(() => {
    if (!settleTarget) return 0;
    const { fromId, toId } = settleTarget;
    const activeSplitsList = splits.filter((s) => !s.deleted_at);
    let net = 0;
    // Splits where `to` paid and `from` has a share → from owes to
    for (const s of activeSplitsList) {
      if (s.paid_by === toId) {
        const sh = shares.find((x) => x.split_id === s.id && x.player_id === fromId);
        if (sh) net += Number(sh.share_amount);
      }
      // Reverse: splits where `from` paid and `to` has a share → reduces debt
      if (s.paid_by === fromId) {
        const sh = shares.find((x) => x.split_id === s.id && x.player_id === toId);
        if (sh) net -= Number(sh.share_amount);
      }
    }
    // Existing settlements
    for (const st of settlements) {
      if (st.from_player === fromId && st.to_player === toId) net -= Number(st.amount);
      if (st.from_player === toId && st.to_player === fromId) net += Number(st.amount);
    }
    const computed = Math.max(0, Math.round(net * 100) / 100);
    // Fallback to the amount passed by the caller if computed is 0 (data might not be loaded yet)
    return computed > 0 ? computed : (settleTarget.amount ?? 0);
  }, [settleTarget, splits, shares, settlements]);

  const [settleAmount, setSettleAmount] = useState('');
  const [settled, setSettled] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const amountInputRef = useRef<HTMLInputElement>(null);

  // Auto-focus the amount input when drawer opens
  useEffect(() => {
    if (showSettleForm && !settled) {
      setTimeout(() => amountInputRef.current?.focus(), 350); // wait for drawer animation
    }
  }, [showSettleForm, settled]);

  const effectiveAmount = settleAmount || suggestedAmount.toFixed(2);
  const numAmount = parseFloat(effectiveAmount) || 0;
  const newBalance = Math.max(0, Math.round((suggestedAmount - numAmount) * 100) / 100);

  // Activities between these two people
  const activities = useMemo(() => {
    if (!settleTarget) return [];
    const fromId = settleTarget.fromId;
    const toId = settleTarget.toId;
    const activeSplits = splits.filter((s) => !s.deleted_at);
    const items: { id: string; type: 'split' | 'settlement'; desc: string; amount: number; date: string }[] = [];

    // Splits where toPlayer paid and fromPlayer has a share
    for (const s of activeSplits) {
      if (s.paid_by === toId) {
        const sh = shares.find((sh) => sh.split_id === s.id && sh.player_id === fromId);
        if (sh) items.push({ id: s.id, type: 'split', desc: s.description || s.category, amount: Number(sh.share_amount), date: s.split_date });
      }
    }
    // Splits where fromPlayer paid and toPlayer has a share (reverse — reduces debt)
    for (const s of activeSplits) {
      if (s.paid_by === fromId) {
        const sh = shares.find((sh) => sh.split_id === s.id && sh.player_id === toId);
        if (sh) items.push({ id: s.id, type: 'split', desc: s.description || s.category, amount: -Number(sh.share_amount), date: s.split_date });
      }
    }
    // Past settlements between them
    for (const st of settlements) {
      if (st.from_player === fromId && st.to_player === toId) {
        items.push({ id: st.id, type: 'settlement', desc: 'Settlement', amount: -Number(st.amount), date: st.settled_date });
      }
    }

    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [settleTarget, splits, shares, settlements]);

  const handleSettle = () => {
    if (!user || !selectedSeasonId || !settleTarget || numAmount <= 0 || submitting) return;
    setSubmitting(true);

    const countBefore = useSplitsStore.getState().settlements.length;
    const settledAmount = numAmount;

    addSplitSettlement(user.id, selectedSeasonId, {
      from_player: settleTarget.fromId,
      to_player: settleTarget.toId,
      amount: settledAmount,
      settled_date: new Date().toISOString().split('T')[0],
    });

    setSettled(true);
    setTimeout(() => {
      setSettled(false);
      setSettleAmount('');
      setSubmitting(false);
      setOpen(false);

      const latestSettlements = useSplitsStore.getState().settlements;
      const newSettlement = latestSettlements.length > countBefore ? latestSettlements[0] : null;
      if (newSettlement) {
        toast.success(`Settlement of $${settledAmount.toFixed(2)} recorded`, {
          duration: 5000,
          action: {
            label: 'Undo',
            onClick: () => useSplitsStore.getState().deleteSplitSettlement(newSettlement.id),
          },
        });
      }
    }, 2000);
  };

  const handleClose = (v: boolean) => {
    if (!v) { setSettled(false); setSettleAmount(''); setSubmitting(false); }
    setOpen(v);
  };

  if (!fromPlayer || !toPlayer) return null;

  const [fromGF, fromGT] = nameToGradient(fromPlayer.name);
  const [toGF, toGT] = nameToGradient(toPlayer.name);
  const fromInitials = fromPlayer.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const toInitials = toPlayer.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const fromPhoto = fromPlayer.photo_url;
  const toPhoto = toPlayer.photo_url;

  return (
    <Drawer open={showSettleForm} onOpenChange={handleClose}>
      <DrawerHandle />
      <DrawerTitle>Settle Up</DrawerTitle>
      <DrawerHeader>
        <Text as="h3" size="lg" weight="bold" tracking="tight">
          <Handshake size={18} className="inline mr-2" style={{ color: 'var(--cricket)' }} />
          Settle Up
        </Text>
      </DrawerHeader>
      <DrawerBody>
        {settled ? (
          <div className="flex flex-col items-center justify-center py-10 text-center animate-fade-in">
            <div className="relative mb-6">
              <div className="h-20 w-20 rounded-full flex items-center justify-center"
                style={{ background: 'linear-gradient(135deg, #059669, #10B981)', animation: 'bounceIn 0.5s ease-out', boxShadow: '0 0 40px rgba(16, 185, 129, 0.3)' }}>
                <Check size={36} className="text-white" />
              </div>
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="absolute top-1/2 left-1/2 h-2 w-2 rounded-full"
                  style={{
                    background: i % 2 === 0 ? '#059669' : 'var(--cricket)',
                    ['--tx' as string]: `${Math.cos(i * Math.PI / 4) * 60}px`,
                    ['--ty' as string]: `${Math.sin(i * Math.PI / 4) * 60}px`,
                    animation: 'particleBurst 0.6s ease-out forwards',
                    animationDelay: `${i * 30}ms`,
                  }} />
              ))}
            </div>
            <Text as="h3" size="2xl" weight="bold" tracking="tight" className="mb-2" style={{ animation: 'slideIn 0.3s ease-out 0.3s both' }}>Settled!</Text>
            <Text as="p" size="md" color="muted" style={{ animation: 'slideIn 0.3s ease-out 0.4s both' }}>${numAmount.toFixed(2)} payment recorded</Text>
            {newBalance === 0 && (
              <div className="mt-4 rounded-full px-5 py-2"
                style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))', animation: 'slideIn 0.3s ease-out 0.5s both', boxShadow: '0 0 20px var(--cricket-glow)' }}>
                <Text size="sm" weight="bold" className="text-white">All squared up!</Text>
              </div>
            )}
          </div>
        ) : (
          <>
            {/* From → To */}
            <div className="flex items-center justify-center gap-4 py-4">
              <div className="flex flex-col items-center gap-1.5">
                {fromPhoto
                  ? <img src={fromPhoto} alt={fromPlayer.name} className="h-14 w-14 rounded-full object-cover" />
                  : <div className="h-14 w-14 rounded-full text-[16px] font-bold text-white flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${fromGF}, ${fromGT})` }}>{fromInitials}</div>}
                <Text size="xs" weight="medium" truncate className="max-w-[80px] text-center">{fromPlayer.name.split(' ')[0]}</Text>
              </div>
              <div className="flex flex-col items-center gap-1"><ArrowRight size={20} style={{ color: 'var(--cricket)' }} /><Text size="2xs" weight="bold" style={{ color: 'var(--cricket)' }}>pays</Text></div>
              <div className="flex flex-col items-center gap-1.5">
                {toPhoto
                  ? <img src={toPhoto} alt={toPlayer.name} className="h-14 w-14 rounded-full object-cover" />
                  : <div className="h-14 w-14 rounded-full text-[16px] font-bold text-white flex items-center justify-center" style={{ background: `linear-gradient(135deg, ${toGF}, ${toGT})` }}>{toInitials}</div>}
                <Text size="xs" weight="medium" truncate className="max-w-[80px] text-center">{toPlayer.name.split(' ')[0]}</Text>
              </div>
            </div>

            {/* Amount — styled input with visible border */}
            <div>
              <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-2">Settlement Amount</Text>
              <div className="flex items-center rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 focus-within:border-[var(--cricket)] transition-colors">
                <Text size="xl" weight="bold" color="muted" className="mr-1">$</Text>
                <input ref={amountInputRef} type="text" inputMode="decimal"
                  value={settleAmount || suggestedAmount.toFixed(2)}
                  onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setSettleAmount(e.target.value); }}
                  className="flex-1 bg-transparent outline-none font-bold text-[28px] leading-none"
                  style={{ color: 'var(--text)', caretColor: 'var(--cricket)', fontVariantNumeric: 'tabular-nums' }} />
              </div>
              {numAmount > 0 && numAmount < suggestedAmount && (
                <Text as="p" size="xs" color="muted" className="mt-1.5">Partial — {formatCurrency(newBalance)} will remain</Text>
              )}
              {numAmount > suggestedAmount && suggestedAmount > 0 && (
                <Text as="p" size="xs" className="mt-1.5" style={{ color: 'var(--split-owe)' }}>Amount exceeds balance of {formatCurrency(suggestedAmount)}</Text>
              )}
            </div>

            {/* Activity — what led to this debt */}
            {activities.length > 0 && (
              <div>
                <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-2">How this came about</Text>
                <div className="space-y-1.5 max-h-[160px] overflow-y-auto overscroll-contain rounded-xl border border-[var(--border)] bg-[var(--surface)] p-2">
                  {activities.map((a) => {
                    const isDebt = a.amount > 0;
                    const label = a.type === 'settlement'
                      ? 'Settled'
                      : isDebt
                        ? `${toPlayer?.name?.split(' ')[0]} paid`
                        : `${fromPlayer?.name?.split(' ')[0]} paid`;
                    return (
                      <div key={a.id + a.type + a.amount} className="flex items-center gap-2.5 rounded-lg p-2.5"
                        style={{ background: 'var(--card)', borderLeft: `3px solid ${a.type === 'settlement' ? '#059669' : isDebt ? '#EF4444' : '#059669'}` }}>
                        <div className="flex-1 min-w-0">
                          <Text size="xs" weight="semibold" truncate className="block">{a.desc}</Text>
                          <Text as="p" size="2xs" color="dim">{label} · {formatDate(a.date)}</Text>
                        </div>
                        <div className="flex-shrink-0 text-right">
                          <Text size="sm" weight="bold" tabular style={{ color: isDebt ? '#EF4444' : '#059669' }}>
                            {isDebt ? '+' : '-'}{formatCurrency(Math.abs(a.amount))}
                          </Text>
                          <Text as="p" size="2xs" style={{ color: isDebt ? '#EF4444' : '#059669' }}>
                            {isDebt ? 'owes' : 'paid'}
                          </Text>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Summary */}
            <div className="rounded-xl p-3 space-y-2" style={{ background: 'color-mix(in srgb, var(--cricket) 6%, transparent)', border: '1px solid color-mix(in srgb, var(--cricket) 15%, transparent)' }}>
              <div className="flex justify-between"><Text size="sm" color="muted">Current balance</Text><Text size="sm" weight="semibold" tabular style={{ color: 'var(--split-owe)' }}>{formatCurrency(suggestedAmount)}</Text></div>
              <div className="flex justify-between"><Text size="sm" color="muted">This settlement</Text><Text size="sm" weight="semibold" tabular style={{ color: 'var(--split-credit)' }}>-{formatCurrency(numAmount)}</Text></div>
              <div className="h-px" style={{ background: 'var(--border)' }} />
              <div className="flex justify-between"><Text size="sm" weight="bold">New balance</Text><Text size="sm" weight="bold" tabular style={{ color: newBalance === 0 ? 'var(--cricket)' : 'var(--split-owe)' }}>{newBalance === 0 ? 'Settled!' : formatCurrency(newBalance)}</Text></div>
            </div>

            <Button onClick={handleSettle} disabled={numAmount <= 0 || submitting} variant="primary" brand="cricket" size="xl" fullWidth loading={submitting}>
              <Handshake size={18} />Confirm Settlement
            </Button>
          </>
        )}
      </DrawerBody>
    </Drawer>
  );
}
