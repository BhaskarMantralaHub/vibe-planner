'use client';

import { useMemo, useEffect, useState, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useSplitsStore } from '@/stores/splits-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import { nameToGradient } from '@/lib/avatar';
import { Text, CardMenu, FilterDropdown, RefreshButton } from '@/components/ui';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Handshake, Trash2, Pencil, ChevronDown, EllipsisVertical, PartyPopper, CheckCircle2, Receipt, ArrowDownRight, ArrowUpRight, TrendingUp, Paperclip, FileText, ExternalLink, RotateCcw } from 'lucide-react';

const isUrlPdf = (url: string) => url.split('?')[0].toLowerCase().endsWith('.pdf');
import dynamic from 'next/dynamic';
import { createPortal } from 'react-dom';

// Lazy-load heavy form drawers — they only need to mount when the user actually opens them.
// Cuts initial Splits page mount cost (saves ~700 lines of SplitForm + image-compression imports).
const SplitForm = dynamic(() => import('./SplitForm'), { ssr: false });
const SplitSettleDrawer = dynamic(() => import('./SplitSettleDrawer'), { ssr: false });

/* ── Reusable sub-components ── */

function Pagination({ page, setPage, totalItems, pageSize }: { page: number; setPage: (p: number) => void; totalItems: number; pageSize: number }) {
  const totalPages = Math.ceil(totalItems / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-4 pt-4 border-t border-[var(--border)]/50">
      <button onClick={() => setPage(Math.max(0, page - 1))} disabled={page === 0}
        className="px-5 py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold cursor-pointer transition-all active:scale-95 border border-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--hover-bg)]"
        style={{ color: 'var(--text)' }}>Prev</button>
      <Text size="xs" color="muted" tabular weight="semibold">{page + 1} / {totalPages}</Text>
      <button onClick={() => setPage(Math.min(totalPages - 1, page + 1))} disabled={page >= totalPages - 1}
        className="px-5 py-2.5 min-h-[44px] rounded-xl text-[13px] font-semibold cursor-pointer transition-all active:scale-95 border border-[var(--border)] disabled:opacity-30 disabled:cursor-not-allowed hover:bg-[var(--hover-bg)]"
        style={{ color: 'var(--text)' }}>Next</button>
    </div>
  );
}

function PlayerAvatar({ name, photoUrl, size = 'md', opacity = 1 }: { name: string; photoUrl?: string | null; size?: 'sm' | 'md' | 'lg'; opacity?: number }) {
  const [gF, gT] = nameToGradient(name);
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const dims = size === 'sm' ? 'h-7 w-7 text-[9px]' : size === 'lg' ? 'h-14 w-14 text-[16px]' : 'h-9 w-9 text-[11px]';
  if (photoUrl) {
    return <img src={photoUrl} alt={name} className={`${dims} rounded-full object-cover flex-shrink-0`} style={{ opacity }} />;
  }
  return (
    <div className={`${dims} rounded-full font-bold text-white flex items-center justify-center flex-shrink-0`}
      style={{ background: `linear-gradient(135deg, ${gF}, ${gT})`, opacity }}
      role="img" aria-label={name}>{initials}</div>
  );
}

function DeleteConfirm({ description, paidBy, date, amount, type, onConfirm, onCancel }: { description: string; paidBy?: string; date?: string; amount?: string; type?: 'split' | 'settlement'; onConfirm: () => void; onCancel: () => void }) {
  const isSettlement = type === 'settlement';
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus trap + escape key
  useEffect(() => {
    confirmRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onCancel(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
      role="alertdialog" aria-modal="true" aria-label={isSettlement ? 'Undo settlement' : 'Delete split'}
      style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={onCancel}>
      <div className="w-full max-w-[360px] rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: isSettlement ? 'rgba(245,158,11,0.1)' : 'var(--split-owe-bg)' }}>
            {isSettlement ? <Handshake size={20} style={{ color: '#D97706' }} /> : <Trash2 size={20} style={{ color: 'var(--split-owe)' }} />}
          </div>
          <div>
            <Text size="sm" weight="semibold">{isSettlement ? 'Undo Settlement' : 'Delete Split'}</Text>
            <Text as="p" size="xs" color="muted">{isSettlement ? 'Revert' : 'Remove'} <b>{description}</b>?</Text>
          </div>
        </div>

        <div className="rounded-xl p-3 mb-4 space-y-1.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
          {paidBy && (
            <div className="flex justify-between">
              <Text size="xs" color="muted">{isSettlement ? 'From' : 'Paid by'}</Text>
              <Text size="xs" weight="semibold">{paidBy}</Text>
            </div>
          )}
          {date && (
            <div className="flex justify-between">
              <Text size="xs" color="muted">Date</Text>
              <Text size="xs" weight="semibold">{formatDate(date)}</Text>
            </div>
          )}
          {amount && (
            <div className="flex justify-between">
              <Text size="xs" color="muted">Amount</Text>
              <Text size="xs" weight="bold" tabular style={{ color: isSettlement ? 'var(--split-credit)' : 'var(--split-owe)' }}>{amount}</Text>
            </div>
          )}
          <div className="border-t border-[var(--border)]/50 pt-1.5 mt-1.5">
            <Text as="p" size="2xs" color="dim">
              {isSettlement ? 'This will restore the debt between these two players.' : 'This will remove the split and all associated shares. Settlements are not affected.'}
            </Text>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button onClick={onCancel} className="px-4 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">Cancel</button>
          <button ref={confirmRef} onClick={onConfirm} className="px-4 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-opacity"
            style={{ background: 'var(--split-owe)' }}>{isSettlement ? 'Undo' : 'Delete'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Loading skeleton ── */
function SplitsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Hero skeleton */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <Skeleton className="h-3 w-24 mb-3 rounded" />
        <Skeleton className="h-10 w-36 mb-3 rounded" />
        <Skeleton className="h-4 w-32 mb-4 rounded" />
        <div className="flex gap-3">
          <Skeleton className="flex-1 h-16 rounded-xl" />
          <Skeleton className="flex-1 h-16 rounded-xl" />
        </div>
      </div>
      {/* Tab bar skeleton */}
      <Skeleton className="h-10 w-full rounded-xl" />
      {/* Card skeletons */}
      {[1, 2, 3].map((i) => (
        <div key={i} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-40 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
            <Skeleton className="h-6 w-16 rounded" />
          </div>
        </div>
      ))}
    </div>
  );
}

/* ── Main Dashboard ── */

export default function SplitsDashboard() {
  const { user } = useAuthStore();
  const { players, selectedSeasonId, adminUserIds } = useCricketStore();
  const { splits, shares, settlements, loading, loadSplits } = useSplitsStore();
  const { userAccess } = useAuthStore();
  const isGlobalAdmin = userAccess.includes('admin');
  const isTeamAdmin = user ? adminUserIds.includes(user.id) : false;
  const isAdmin = isGlobalAdmin || isTeamAdmin;

  // Track whether the form/settle drawers have ever been opened — if not, we don't mount them
  // (lazy-loaded via next/dynamic above). Once opened, they stay mounted so subsequent opens are instant.
  const showSplitForm = useSplitsStore((s) => s.showSplitForm);
  const showSettleForm = useSplitsStore((s) => s.showSettleForm);
  const editingSplitId = useSplitsStore((s) => s.editingSplitId);
  const [splitFormMounted, setSplitFormMounted] = useState(false);
  const [settleDrawerMounted, setSettleDrawerMounted] = useState(false);
  useEffect(() => {
    if (showSplitForm || editingSplitId) setSplitFormMounted(true);
  }, [showSplitForm, editingSplitId]);
  useEffect(() => {
    if (showSettleForm) setSettleDrawerMounted(true);
  }, [showSettleForm]);

  useEffect(() => {
    if (selectedSeasonId) loadSplits(selectedSeasonId);
  }, [selectedSeasonId, loadSplits]);

  const activePlayers = useMemo(() => players.filter((p) => p.is_active), [players]);

  const seasonSplits = useMemo(() => splits.filter((s) => s.season_id === selectedSeasonId), [splits, selectedSeasonId]);
  const seasonSettlements = useMemo(() => settlements.filter((s) => s.season_id === selectedSeasonId), [settlements, selectedSeasonId]);

  const myPlayer = useMemo(
    () => activePlayers.find((p) => p.email?.toLowerCase() === user?.email?.toLowerCase()),
    [activePlayers, user?.email],
  );

  const activeSplits = useMemo(
    () => seasonSplits.filter((s) => !s.deleted_at).sort((a, b) => b.created_at.localeCompare(a.created_at)),
    [seasonSplits],
  );
  const deletedSplits = useMemo(
    () => seasonSplits.filter((s) => s.deleted_at).sort((a, b) => (b.deleted_at ?? '').localeCompare(a.deleted_at ?? '')),
    [seasonSplits],
  );
  const hasSplits = activeSplits.length > 0 || seasonSettlements.length > 0 || deletedSplits.length > 0;

  // Pre-build shares lookup map
  const sharesMap = useMemo(() => {
    const map = new Map<string, typeof shares>();
    for (const sh of shares) {
      const arr = map.get(sh.split_id);
      if (arr) arr.push(sh);
      else map.set(sh.split_id, [sh]);
    }
    return map;
  }, [shares]);

  // My personal debts
  const { myDebtsIOwe, myDebtsOwedToMe } = useMemo(() => {
    if (!myPlayer) return { myDebtsIOwe: [] as { id: string; name: string; photo: string | null; amount: number }[], myDebtsOwedToMe: [] as { id: string; name: string; photo: string | null; amount: number }[] };

    const perPerson: Record<string, number> = {};

    for (const s of activeSplits) {
      const splitShareList = sharesMap.get(s.id) ?? [];
      if (s.paid_by === myPlayer.id) {
        for (const sh of splitShareList) {
          if (sh.player_id !== myPlayer.id) {
            perPerson[sh.player_id] = (perPerson[sh.player_id] ?? 0) + Number(sh.share_amount);
          }
        }
      } else {
        const myShareEntry = splitShareList.find((sh) => sh.player_id === myPlayer.id);
        if (myShareEntry) {
          perPerson[s.paid_by] = (perPerson[s.paid_by] ?? 0) - Number(myShareEntry.share_amount);
        }
      }
    }

    for (const st of seasonSettlements) {
      if (st.from_player === myPlayer.id) {
        perPerson[st.to_player] = (perPerson[st.to_player] ?? 0) + Number(st.amount);
      } else if (st.to_player === myPlayer.id) {
        perPerson[st.from_player] = (perPerson[st.from_player] ?? 0) - Number(st.amount);
      }
    }

    const iOwe: { id: string; name: string; photo: string | null; amount: number }[] = [];
    const owedToMe: { id: string; name: string; photo: string | null; amount: number }[] = [];

    for (const [pid, net] of Object.entries(perPerson)) {
      const rounded = Math.round(net * 100) / 100;
      if (Math.abs(rounded) < 0.01) continue;
      const p = activePlayers.find((pl) => pl.id === pid);
      if (!p) continue;
      if (rounded > 0) owedToMe.push({ id: pid, name: p.name, photo: p.photo_url ?? null, amount: rounded });
      else iOwe.push({ id: pid, name: p.name, photo: p.photo_url ?? null, amount: Math.abs(rounded) });
    }

    return {
      myDebtsIOwe: iOwe.sort((a, b) => b.amount - a.amount),
      myDebtsOwedToMe: owedToMe.sort((a, b) => b.amount - a.amount),
    };
  }, [myPlayer, activeSplits, sharesMap, seasonSettlements, activePlayers]);

  // Activity feed
  const activityFeed = useMemo(() => {
    const items: { id: string; type: 'split' | 'settlement'; date: string; description: string; amount: number; paidByName: string; paidByPhoto: string | null; paidById: string; splitCount: number; receiptUrls: string[] | null }[] = [];
    for (const s of activeSplits) {
      const payer = activePlayers.find((p) => p.id === s.paid_by);
      items.push({ id: s.id, type: 'split', date: s.split_date, description: s.description || s.category, amount: Number(s.amount), paidByName: payer?.name ?? 'Unknown', paidByPhoto: payer?.photo_url ?? null, paidById: s.paid_by, splitCount: (sharesMap.get(s.id) ?? []).length, receiptUrls: s.receipt_urls ?? null });
    }
    return items.sort((a, b) => b.date.localeCompare(a.date));
  }, [activeSplits, activePlayers, sharesMap]);

  // UI state
  type SplitSubTab = 'balances' | 'activity' | 'settlements' | 'deleted';
  const [subTab, setSubTab] = useState<SplitSubTab>('activity');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [expandedSettlementId, setExpandedSettlementId] = useState<string | null>(null);
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [settlementPage, setSettlementPage] = useState(0);
  const [activityPage, setActivityPage] = useState(0);
  const [activityFilter, setActivityFilter] = useState<string>('all');
  const [settlementFilter, setSettlementFilter] = useState<string>('all');
  const PAGE_SIZE = 5;
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const [deletingItem, setDeletingItem] = useState<{ id: string; type: 'split' | 'settlement'; desc: string; paidBy?: string; date?: string; amount?: string } | null>(null);
  const [editBlockedSplit, setEditBlockedSplit] = useState<{ id: string; paidById: string; desc: string } | null>(null);
  const [permanentDeleting, setPermanentDeleting] = useState<{ id: string; desc: string; amount: string } | null>(null);

  const openSettleDrawer = (fromId: string, toId: string, amount: number) => {
    useSplitsStore.setState({ showSettleForm: true, settleTarget: { fromId, toId, amount } });
  };

  const handleDeleteSplit = (id: string) => {
    useSplitsStore.getState().deleteSplit(id, myPlayer?.name ?? 'Admin');
  };

  // Max amounts for proportion bars
  const maxOwe = myDebtsIOwe.length > 0 ? Math.max(...myDebtsIOwe.map((d) => d.amount)) : 0;
  const maxOwed = myDebtsOwedToMe.length > 0 ? Math.max(...myDebtsOwedToMe.map((d) => d.amount)) : 0;

  if (loading) return <SplitsSkeleton />;

  if (!hasSplits) {
    return (
      <>
        <EmptyState icon={<Receipt size={32} />} title="No splits yet"
          description="Track who paid for what and split it fairly. Separate from the team pool fund — splits are just between people involved."
          brand="cricket"
          action={{ label: '+ Split an Expense', onClick: () => useSplitsStore.setState({ showSplitForm: true }) }} />
        {splitFormMounted && <SplitForm />}
        {settleDrawerMounted && <SplitSettleDrawer />}
      </>
    );
  }

  const totalIOwe = myDebtsIOwe.reduce((sum, d) => sum + d.amount, 0);
  const totalOwedToMe = myDebtsOwedToMe.reduce((sum, d) => sum + d.amount, 0);
  const heroNet = Math.round((totalOwedToMe - totalIOwe) * 100) / 100;
  const allSettled = myDebtsIOwe.length === 0 && myDebtsOwedToMe.length === 0;

  return (
    <div className="space-y-4">

      {/* ── Hero Net Balance Card ── */}
      <div className="rounded-2xl border overflow-hidden" style={{ borderColor: allSettled ? 'color-mix(in srgb, var(--cricket) 25%, transparent)' : heroNet >= 0 ? 'var(--split-credit-border)' : 'var(--split-owe-border)', background: 'var(--card)' }}>
        {/* Accent stripe */}
        <div className="h-1" style={{ background: allSettled ? 'linear-gradient(90deg, var(--cricket), var(--cricket-accent))' : heroNet >= 0 ? 'linear-gradient(90deg, var(--split-credit), #6EE7B7)' : 'linear-gradient(90deg, var(--split-owe), #FCA5A5)' }} />
        <div className="p-4 sm:p-5">
          <div className="flex items-center justify-between mb-1">
            <Text as="p" size="xs" weight="semibold" color="muted" uppercase tracking="wider">Your Net Balance</Text>
            <div className="flex items-center gap-2">
              {!allSettled && (
                <div className="flex items-center gap-1 rounded-full px-2 py-0.5" style={{ background: heroNet >= 0 ? 'var(--split-credit-bg)' : 'var(--split-owe-bg)' }}>
                  {heroNet >= 0 ? <TrendingUp size={12} style={{ color: 'var(--split-credit)' }} /> : <ArrowDownRight size={12} style={{ color: 'var(--split-owe)' }} />}
                  <Text size="2xs" weight="bold" style={{ color: heroNet >= 0 ? 'var(--split-credit)' : 'var(--split-owe)' }}>
                    {heroNet >= 0 ? 'Positive' : 'Negative'}
                  </Text>
                </div>
              )}
              <RefreshButton onRefresh={async () => { if (selectedSeasonId) { await loadSplits(selectedSeasonId); toast.success('Splits refreshed'); } }} variant="bordered" title="Refresh splits" />
            </div>
          </div>
          {allSettled ? (
            <div className="flex items-center gap-3 mt-1">
              <div className="h-10 w-10 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--cricket) 15%, transparent)' }}>
                <CheckCircle2 size={22} style={{ color: 'var(--cricket)' }} />
              </div>
              <div>
                <Text as="p" size="2xl" weight="bold" tabular tracking="tight" className="leading-none" style={{ color: 'var(--cricket)' }}>$0.00</Text>
                <Text as="p" size="sm" color="muted" className="mt-0.5">All settled up — nice work!</Text>
              </div>
            </div>
          ) : (
            <>
              <Text as="p" size="3xl" weight="bold" tabular tracking="tight" className="leading-none mt-1" style={{ color: heroNet > 0 ? 'var(--split-credit)' : 'var(--split-owe)' }}>
                {heroNet > 0 ? '+' : '-'}{formatCurrency(Math.abs(heroNet))}
              </Text>
              <Text as="p" size="sm" color="muted" className="mt-1.5">
                {heroNet > 0 ? 'You are owed overall' : 'You owe overall'}
              </Text>
            </>
          )}
          {(totalIOwe > 0 || totalOwedToMe > 0) && (
            <div className="flex gap-3 mt-4">
              <div className="flex-1 rounded-xl p-3 border" style={{ background: 'var(--split-owe-bg)', borderColor: 'var(--split-owe-border)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowDownRight size={12} style={{ color: 'var(--split-owe)' }} />
                  <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px]">You Owe</Text>
                </div>
                <Text as="p" size="lg" weight="bold" tabular style={{ color: 'var(--split-owe)' }}>{formatCurrency(totalIOwe)}</Text>
              </div>
              <div className="flex-1 rounded-xl p-3 border" style={{ background: 'var(--split-credit-bg)', borderColor: 'var(--split-credit-border)' }}>
                <div className="flex items-center gap-1.5 mb-1">
                  <ArrowUpRight size={12} style={{ color: 'var(--split-credit)' }} />
                  <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px]">You&apos;re Owed</Text>
                </div>
                <Text as="p" size="lg" weight="bold" tabular style={{ color: 'var(--split-credit)' }}>{formatCurrency(totalOwedToMe)}</Text>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sub-tabs */}
      <SegmentedControl
        options={[
          { key: 'activity', label: `Activity${activityFeed.length > 0 ? ` (${activityFeed.length})` : ''}` },
          { key: 'balances', label: `Balances${myDebtsIOwe.length + myDebtsOwedToMe.length > 0 ? ` (${myDebtsIOwe.length + myDebtsOwedToMe.length})` : ''}` },
          { key: 'settlements', label: `Settled${seasonSettlements.length > 0 ? ` (${seasonSettlements.length})` : ''}` },
          ...(deletedSplits.length > 0 && isAdmin ? [{ key: 'deleted', label: `Deleted (${deletedSplits.length})` }] : []),
        ]}
        active={subTab}
        onChange={(key) => { setSubTab(key as SplitSubTab); setActivityPage(0); setSettlementPage(0); }}
      />

      {/* ── Balances tab ── */}
      {subTab === 'balances' && <div key="balances" className="tab-enter">

      {(myDebtsIOwe.length > 0 || myDebtsOwedToMe.length > 0) && (
        <div className="space-y-3">
          {/* You Owe section */}
          {myDebtsIOwe.length > 0 && (
            <div className="rounded-2xl border bg-[var(--card)] overflow-hidden" style={{ borderColor: 'var(--split-owe-border)' }}>
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'var(--split-owe-bg)' }}>
                  <ArrowDownRight size={13} style={{ color: 'var(--split-owe)' }} />
                </div>
                <Text size="sm" weight="bold" style={{ color: 'var(--split-owe)' }}>You Owe</Text>
                <Text size="xs" color="dim" className="ml-auto">{myDebtsIOwe.length} {myDebtsIOwe.length === 1 ? 'person' : 'people'}</Text>
              </div>
              <div className="px-3 pb-3 space-y-2">
                {myDebtsIOwe.map((d) => {
                  const isExp = expandedDebtId === `owe-${d.id}`;
                  const relatedSplits = myPlayer ? activeSplits.filter((s) =>
                    (s.paid_by === d.id && (sharesMap.get(s.id) ?? []).some((sh) => sh.player_id === myPlayer.id))
                    || (s.paid_by === myPlayer.id && (sharesMap.get(s.id) ?? []).some((sh) => sh.player_id === d.id)),
                  ) : [];
                  const fill = maxOwe > 0 ? d.amount / maxOwe : 0;
                  return (
                    <div key={`owe-${d.id}`} className="rounded-xl overflow-hidden border transition-colors duration-200" style={{ borderColor: isExp ? 'var(--split-owe-border)' : 'var(--border)' }}>
                      {/* Row with proportion bar background */}
                      <div className="proportion-bar owe" style={{ ['--fill' as string]: fill }}>
                        <div className="flex items-center relative z-[1]">
                          <button onClick={() => setExpandedDebtId(isExp ? null : `owe-${d.id}`)}
                            className="flex-1 flex items-center gap-3 p-3 cursor-pointer transition-all active:scale-[0.98] min-w-0">
                            <PlayerAvatar name={d.name} photoUrl={d.photo} />
                            <div className="flex-1 min-w-0 text-left">
                              <Text size="sm" weight="semibold" truncate>{d.name}</Text>
                              <Text as="p" size="2xs" color="dim">{relatedSplits.length} split{relatedSplits.length !== 1 ? 's' : ''}</Text>
                            </div>
                            <Text size="md" weight="bold" tabular style={{ color: 'var(--split-owe)' }}>{formatCurrency(d.amount)}</Text>
                            <ChevronDown size={16} className="flex-shrink-0 text-[var(--dim)] transition-transform duration-200" style={{ transform: isExp ? 'rotate(180deg)' : undefined }} />
                          </button>
                        </div>
                      </div>
                      {/* Animated expand/collapse */}
                      <div className={`expand-collapse ${isExp ? 'expanded' : ''}`}>
                        <div>
                          <div className="px-3 pb-3">
                            <div className="border-t border-[var(--border)]/50 pt-2 space-y-1.5">
                              {relatedSplits.map((s) => {
                                const iOwe = s.paid_by === d.id;
                                const relevantShare = myPlayer ? (sharesMap.get(s.id) ?? []).find((sh) => sh.player_id === (iOwe ? myPlayer.id : d.id)) : null;
                                const shareAmt = relevantShare ? Number(relevantShare.share_amount) : 0;
                                return (
                                  <div key={s.id} className="flex items-center gap-2.5 rounded-lg p-2.5" style={{ background: 'var(--surface)', borderLeft: `3px solid ${iOwe ? 'var(--split-owe)' : 'var(--split-credit)'}` }}>
                                    <div className="flex-1 min-w-0">
                                      <Text size="xs" weight="semibold" truncate>{s.description || s.category}</Text>
                                      <Text as="p" size="2xs" color="dim">Total {formatCurrency(Number(s.amount))} · {formatDate(s.split_date)}</Text>
                                    </div>
                                    <Text size="xs" weight="bold" tabular style={{ color: iOwe ? 'var(--split-owe)' : 'var(--split-credit)' }}>{iOwe ? '+' : '-'}{formatCurrency(shareAmt)}</Text>
                                  </div>
                                );
                              })}
                              {/* Past settlements */}
                              {(() => {
                                const pastSettlements = myPlayer ? seasonSettlements.filter((st) =>
                                  (st.from_player === myPlayer.id && st.to_player === d.id) || (st.from_player === d.id && st.to_player === myPlayer.id),
                                ) : [];
                                if (pastSettlements.length === 0) return null;
                                return (
                                  <div className="mt-1.5 rounded-lg p-2.5" style={{ background: 'var(--split-credit-bg)', borderLeft: '3px solid var(--split-credit)' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <Handshake size={12} style={{ color: 'var(--split-credit)' }} />
                                      <Text size="2xs" weight="bold" style={{ color: 'var(--split-credit)' }}>Previously settled ({pastSettlements.length})</Text>
                                    </div>
                                    {pastSettlements.map((st) => (
                                      <div key={st.id} className="flex items-center justify-between py-0.5">
                                        <Text size="2xs" color="dim">{formatDate(st.settled_date)}</Text>
                                        <Text size="xs" weight="bold" tabular style={{ color: 'var(--split-credit)' }}>-{formatCurrency(Number(st.amount))}</Text>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                            {/* Settle button inside expanded area */}
                            <button onClick={() => myPlayer && openSettleDrawer(myPlayer.id, d.id, d.amount)}
                              className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl py-3 min-h-[48px] text-[14px] font-bold cursor-pointer transition-all active:scale-[0.97]"
                              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))', color: 'white', boxShadow: '0 2px 12px var(--cricket-glow)' }}>
                              <Handshake size={16} />
                              Settle {formatCurrency(d.amount)}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Owed To You section */}
          {myDebtsOwedToMe.length > 0 && (
            <div className="rounded-2xl border bg-[var(--card)] overflow-hidden" style={{ borderColor: 'var(--split-credit-border)' }}>
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'var(--split-credit-bg)' }}>
                  <ArrowUpRight size={13} style={{ color: 'var(--split-credit)' }} />
                </div>
                <Text size="sm" weight="bold" style={{ color: 'var(--split-credit)' }}>Owed To You</Text>
                <Text size="xs" color="dim" className="ml-auto">{myDebtsOwedToMe.length} {myDebtsOwedToMe.length === 1 ? 'person' : 'people'}</Text>
              </div>
              <div className="px-3 pb-3 space-y-2">
                {myDebtsOwedToMe.map((d) => {
                  const isExp = expandedDebtId === `owed-${d.id}`;
                  const relatedSplits = myPlayer ? activeSplits.filter((s) =>
                    (s.paid_by === myPlayer.id && (sharesMap.get(s.id) ?? []).some((sh) => sh.player_id === d.id))
                    || (s.paid_by === d.id && (sharesMap.get(s.id) ?? []).some((sh) => sh.player_id === myPlayer.id)),
                  ) : [];
                  const fill = maxOwed > 0 ? d.amount / maxOwed : 0;
                  return (
                    <div key={`owed-${d.id}`} className="rounded-xl overflow-hidden border transition-colors duration-200" style={{ borderColor: isExp ? 'var(--split-credit-border)' : 'var(--border)' }}>
                      <div className="proportion-bar credit" style={{ ['--fill' as string]: fill }}>
                        <div className="flex items-center relative z-[1]">
                          <button onClick={() => setExpandedDebtId(isExp ? null : `owed-${d.id}`)}
                            className="flex-1 flex items-center gap-3 p-3 cursor-pointer transition-all active:scale-[0.98] min-w-0">
                            <PlayerAvatar name={d.name} photoUrl={d.photo} />
                            <div className="flex-1 min-w-0 text-left">
                              <Text size="sm" weight="semibold" truncate>{d.name}</Text>
                              <Text as="p" size="2xs" color="dim">{relatedSplits.length} split{relatedSplits.length !== 1 ? 's' : ''}</Text>
                            </div>
                            <Text size="md" weight="bold" tabular style={{ color: 'var(--split-credit)' }}>{formatCurrency(d.amount)}</Text>
                            <ChevronDown size={16} className="flex-shrink-0 text-[var(--dim)] transition-transform duration-200" style={{ transform: isExp ? 'rotate(180deg)' : undefined }} />
                          </button>
                        </div>
                      </div>
                      <div className={`expand-collapse ${isExp ? 'expanded' : ''}`}>
                        <div>
                          <div className="px-3 pb-3">
                            <div className="border-t border-[var(--border)]/50 pt-2 space-y-1.5">
                              {relatedSplits.map((s) => {
                                const theyOwe = myPlayer && s.paid_by === myPlayer.id;
                                const relevantShare = (sharesMap.get(s.id) ?? []).find((sh) => sh.player_id === (theyOwe ? d.id : myPlayer?.id ?? ''));
                                const shareAmt = relevantShare ? Number(relevantShare.share_amount) : 0;
                                return (
                                  <div key={s.id} className="flex items-center gap-2.5 rounded-lg p-2.5" style={{ background: 'var(--surface)', borderLeft: `3px solid ${theyOwe ? 'var(--split-credit)' : 'var(--split-owe)'}` }}>
                                    <div className="flex-1 min-w-0">
                                      <Text size="xs" weight="semibold" truncate>{s.description || s.category}</Text>
                                      <Text as="p" size="2xs" color="dim">Total {formatCurrency(Number(s.amount))} · {formatDate(s.split_date)}</Text>
                                    </div>
                                    <Text size="xs" weight="bold" tabular style={{ color: theyOwe ? 'var(--split-credit)' : 'var(--split-owe)' }}>{theyOwe ? '+' : '-'}{formatCurrency(shareAmt)}</Text>
                                  </div>
                                );
                              })}
                              {/* Past settlements */}
                              {(() => {
                                const pastSettlements = seasonSettlements.filter((st) =>
                                  (st.from_player === d.id && st.to_player === myPlayer?.id) || (st.from_player === myPlayer?.id && st.to_player === d.id),
                                );
                                if (pastSettlements.length === 0) return null;
                                return (
                                  <div className="mt-1.5 rounded-lg p-2.5" style={{ background: 'var(--split-credit-bg)', borderLeft: '3px solid var(--split-credit)' }}>
                                    <div className="flex items-center gap-2 mb-1">
                                      <Handshake size={12} style={{ color: 'var(--split-credit)' }} />
                                      <Text size="2xs" weight="bold" style={{ color: 'var(--split-credit)' }}>Previously settled ({pastSettlements.length})</Text>
                                    </div>
                                    {pastSettlements.map((st) => (
                                      <div key={st.id} className="flex items-center justify-between py-0.5">
                                        <Text size="2xs" color="dim">{formatDate(st.settled_date)}</Text>
                                        <Text size="xs" weight="bold" tabular style={{ color: 'var(--split-credit)' }}>-{formatCurrency(Number(st.amount))}</Text>
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </div>
                            {/* Settle button inside expanded area */}
                            <button onClick={() => myPlayer && openSettleDrawer(d.id, myPlayer.id, d.amount)}
                              className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl py-3 min-h-[48px] text-[14px] font-bold cursor-pointer transition-all active:scale-[0.97]"
                              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))', color: 'white', boxShadow: '0 2px 12px var(--cricket-glow)' }}>
                              <Handshake size={16} />
                              Settle {formatCurrency(d.amount)}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* All settled celebration */}
      {allSettled && hasSplits && (
        <div className="rounded-2xl border bg-[var(--card)] p-6 text-center" style={{ borderColor: 'color-mix(in srgb, var(--cricket) 25%, transparent)' }}>
          <div className="h-14 w-14 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'color-mix(in srgb, var(--cricket) 12%, transparent)' }}>
            <PartyPopper size={28} style={{ color: 'var(--cricket)' }} />
          </div>
          <Text as="h3" size="lg" weight="bold" className="mb-1">All settled up!</Text>
          <Text as="p" size="sm" color="muted">No outstanding balances. Great teamwork.</Text>
        </div>
      )}

      </div>}

      {/* ── Activity tab ── */}
      {subTab === 'activity' && <div key="activity" className="tab-enter">
      {activityFeed.length > 0 ? (() => {
        const filteredActivity = activityFilter === 'all' ? activityFeed
          : activityFilter === 'mine' ? activityFeed.filter((a) => a.paidById === myPlayer?.id || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === myPlayer?.id))
          : activityFeed.filter((a) => a.paidById === activityFilter || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === activityFilter));
        const pagedActivity = filteredActivity.slice(activityPage * PAGE_SIZE, (activityPage + 1) * PAGE_SIZE);

        const activityPeople = new Map<string, string>();
        for (const a of activityFeed) {
          const splitShrs = sharesMap.get(a.id) ?? [];
          for (const sh of splitShrs) {
            const p = activePlayers.find((pl) => pl.id === sh.player_id);
            if (p && p.id !== myPlayer?.id) activityPeople.set(p.id, p.name);
          }
        }

        return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-visible">
          <div className="p-4 pb-3">
            <FilterDropdown
              options={[
                { key: 'mine', label: 'Mine', count: activityFeed.filter((a) => a.paidById === myPlayer?.id || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === myPlayer?.id)).length },
                ...[...activityPeople.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({
                  key: id, label: name, count: activityFeed.filter((a) => a.paidById === id || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === id)).length,
                })),
              ]}
              value={activityFilter === 'all' ? '' : activityFilter}
              onChange={(key) => { setActivityFilter(key || 'all'); setActivityPage(0); }}
              allLabel="All Activity"
              allCount={activityFeed.length}
              brand="cricket"
            />
          </div>
          <div className="px-3 pb-3 space-y-2">
            {pagedActivity.map((a) => {
              const expanded = expandedId === a.id;
              const splitShares = a.type === 'split' ? (sharesMap.get(a.id) ?? []) : [];

              const iAmPayer = myPlayer?.id === a.paidById;
              const myShare = myPlayer ? splitShares.find((sh) => sh.player_id === myPlayer.id) : null;
              const myShareAmt = myShare ? Number(myShare.share_amount) : 0;
              const myRelation = iAmPayer
                ? { label: 'You paid', color: 'var(--cricket)', amount: a.amount }
                : myShare
                  ? { label: 'You owe', color: 'var(--split-owe)', amount: myShareAmt }
                  : null;

              return (
                <div key={a.id} className="rounded-xl overflow-hidden border transition-colors duration-200" style={{ borderColor: expanded ? 'color-mix(in srgb, var(--cricket) 30%, transparent)' : 'var(--border)' }}>
                  <div className="flex items-center" style={{ background: expanded ? 'color-mix(in srgb, var(--cricket) 5%, transparent)' : 'var(--surface)' }}>
                    <button
                      onClick={() => setExpandedId(expanded ? null : a.id)}
                      className="flex-1 flex items-center gap-3 p-3 cursor-pointer transition-all active:scale-[0.98] min-w-0"
                    >
                      <PlayerAvatar name={a.paidByName} photoUrl={a.paidByPhoto} />
                      <div className="flex-1 min-w-0 text-left">
                        <Text size="sm" weight="semibold" truncate className="block">{a.description}</Text>
                        <Text as="p" size="2xs" color="dim">
                          {a.paidByName.split(' ')[0]} paid · {formatDate(a.date)}
                          {a.splitCount > 0 && ` · ${a.splitCount} people`}
                          {a.receiptUrls && a.receiptUrls.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 ml-1 align-middle">
                              <Paperclip size={10} style={{ color: 'var(--muted)' }} />
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{a.receiptUrls.length}</span>
                            </span>
                          )}
                        </Text>
                        {myRelation && (
                          <Text as="p" size="2xs" weight="bold" style={{ color: myRelation.color }}>
                            {myRelation.label} {formatCurrency(myRelation.amount)}
                          </Text>
                        )}
                      </div>
                      <Text size="md" weight="bold" tabular className="flex-shrink-0" style={{ color: 'var(--text)' }}>
                        {formatCurrency(a.amount)}
                      </Text>
                      <ChevronDown size={16} className="flex-shrink-0 text-[var(--dim)] transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
                    </button>

                    {isAdmin && (
                      <div className="pr-2 border-l border-[var(--border)]/30 ml-1">
                        <button
                          ref={openMenu === a.id ? menuBtnRef : null}
                          onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                          className="h-11 w-11 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                        >
                          <EllipsisVertical size={14} />
                        </button>
                        {openMenu === a.id && (
                          <CardMenu
                            anchorRef={menuBtnRef}
                            onClose={() => setOpenMenu(null)}
                            items={[
                              ...(a.type === 'split' ? (() => {
                                const thisShareHolders = new Set(splitShares.map((sh) => sh.player_id));
                                const hasSettlements = seasonSettlements.some((st) => st.to_player === a.paidById && thisShareHolders.has(st.from_player));
                                return [{
                                  label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)',
                                  onClick: hasSettlements
                                    ? () => setEditBlockedSplit({ id: a.id, paidById: a.paidById, desc: a.description })
                                    : () => useSplitsStore.setState({ editingSplitId: a.id, showSplitForm: true }),
                                }];
                              })() : []),
                              { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--split-owe)', onClick: () => setDeletingItem({ id: a.id, type: a.type, desc: a.description, paidBy: a.paidByName, date: a.date, amount: formatCurrency(a.amount) }), dividerBefore: a.type === 'split' },
                            ]}
                          />
                        )}
                      </div>
                    )}
                  </div>

                  {/* Expanded per-person breakdown */}
                  <div className={`expand-collapse ${expanded ? 'expanded' : ''}`}>
                    <div>
                      {a.type === 'split' && (
                      <div className="px-3 pb-3" style={{ background: 'color-mix(in srgb, var(--cricket) 3%, transparent)' }}>
                        <div className="border-t border-[var(--border)]/50 pt-3 space-y-2">
                          {[...splitShares]
                            .sort((x, y) => {
                              if (x.player_id === a.paidById) return -1;
                              if (y.player_id === a.paidById) return 1;
                              return 0;
                            })
                            .map((sh) => {
                            const p = activePlayers.find((pl) => pl.id === sh.player_id);
                            if (!p) return null;
                            const isPayer = sh.player_id === a.paidById;
                            const isMe = sh.player_id === myPlayer?.id;
                            const shareAmt = Number(sh.share_amount);
                            const borderColor = isPayer ? 'var(--cricket)' : 'var(--split-owe)';

                            const stillOwes = !isPayer && (
                              (myPlayer?.id === a.paidById && myDebtsOwedToMe.some((d) => d.id === sh.player_id))
                              || (isMe && myDebtsIOwe.some((d) => d.id === a.paidById))
                            );

                            return (
                              <div key={sh.id}
                                className="flex items-center gap-3 rounded-lg p-2.5"
                                style={{
                                  background: isPayer ? 'color-mix(in srgb, var(--cricket) 6%, var(--surface))' : 'var(--surface)',
                                  borderLeft: `3px solid ${borderColor}`,
                                }}>
                                <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
                                <div className="flex-1 min-w-0">
                                  <Text size="sm" weight="semibold" truncate>
                                    {p.name}{isMe ? ' (You)' : ''}
                                  </Text>
                                  {isPayer ? (
                                    <Text as="p" size="2xs" style={{ color: 'var(--cricket)' }}>Paid {formatCurrency(a.amount)}</Text>
                                  ) : (
                                    <Text as="p" size="2xs" color="dim">Owes {activePlayers.find((pl) => pl.id === a.paidById)?.name?.split(' ')[0]}</Text>
                                  )}
                                </div>
                                <Text size="sm" weight="bold" tabular className="flex-shrink-0"
                                  style={{ color: isPayer ? 'var(--cricket)' : 'var(--split-owe)' }}>
                                  {formatCurrency(shareAmt)}
                                </Text>
                                {stillOwes && myPlayer && (
                                  <button onClick={() => {
                                    if (isMe) openSettleDrawer(myPlayer.id, a.paidById, shareAmt);
                                    else openSettleDrawer(sh.player_id, myPlayer.id, shareAmt);
                                  }}
                                    className="flex-shrink-0 rounded-lg px-3 py-2.5 min-h-[44px] text-[11px] font-bold cursor-pointer transition-all active:scale-95"
                                    style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))', color: 'white' }}>
                                    Settle
                                  </button>
                                )}
                              </div>
                            );
                          })}

                          {/* Receipts */}
                          {a.receiptUrls && a.receiptUrls.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-[var(--border)]/50">
                              <div className="flex items-center gap-1.5 mb-2">
                                <Paperclip size={12} style={{ color: 'var(--muted)' }} />
                                <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider">
                                  Receipts ({a.receiptUrls.length})
                                </Text>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {a.receiptUrls.map((url, i) => {
                                  const pdf = isUrlPdf(url);
                                  return (
                                    <button
                                      key={i}
                                      onClick={() => window.open(url, '_blank')}
                                      className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 cursor-pointer active:scale-[0.98] transition-all hover:bg-[var(--hover-bg)]"
                                      style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                                    >
                                      {pdf
                                        ? <FileText size={12} style={{ color: '#EF4444' }} />
                                        : <Receipt size={12} style={{ color: 'var(--cricket)' }} />}
                                      <Text size="2xs" weight="medium">Receipt {i + 1}{pdf ? '.pdf' : '.jpg'}</Text>
                                      <ExternalLink size={9} className="text-[var(--dim)]" />
                                    </button>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Settle All */}
                          {myPlayer?.id === a.paidById && (() => {
                            const unsettledInSplit = splitShares.filter((sh) =>
                              sh.player_id !== a.paidById && myDebtsOwedToMe.some((d) => d.id === sh.player_id),
                            );
                            if (unsettledInSplit.length < 2) return null;
                            return (
                              <button
                                onClick={() => {
                                  if (!confirm(`Settle all ${unsettledInSplit.length} people at once?`)) return;
                                  if (!user || !selectedSeasonId || !myPlayer) return;
                                  for (const sh of unsettledInSplit) {
                                    const netDebt = myDebtsOwedToMe.find((d) => d.id === sh.player_id);
                                    if (!netDebt) continue;
                                    useSplitsStore.getState().addSplitSettlement(user.id, selectedSeasonId, {
                                      from_player: sh.player_id, to_player: myPlayer.id,
                                      amount: netDebt.amount, settled_date: new Date().toISOString().split('T')[0],
                                    });
                                  }
                                }}
                                className="w-full mt-3 flex items-center justify-center gap-2 rounded-xl py-3 min-h-[48px] text-[13px] font-bold cursor-pointer transition-all active:scale-[0.97] border-2 border-dashed"
                                style={{ borderColor: 'color-mix(in srgb, var(--cricket) 40%, transparent)', color: 'var(--cricket)', background: 'color-mix(in srgb, var(--cricket) 5%, transparent)' }}>
                                <Handshake size={15} />
                                Settle All ({unsettledInSplit.length} people)
                              </button>
                            );
                          })()}
                        </div>
                      </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="px-3 pb-3">
            <Pagination page={activityPage} setPage={setActivityPage} totalItems={filteredActivity.length} pageSize={PAGE_SIZE} />
          </div>
        </div>
        );
      })() : (
        <EmptyState icon={<Receipt size={28} />} title="No activity yet" description="Splits you create will appear here as a timeline." brand="cricket" />
      )}

      </div>}

      {/* ── Settlements tab ── */}
      {subTab === 'settlements' && <div key="settlements" className="tab-enter">
      {seasonSettlements.length > 0 ? (() => {
        const sortedSettlements = [...seasonSettlements].sort((a, b) => b.created_at.localeCompare(a.created_at));
        const filteredSettlements = settlementFilter === 'all' ? sortedSettlements
          : settlementFilter === 'mine' ? sortedSettlements.filter((st) => st.from_player === myPlayer?.id || st.to_player === myPlayer?.id)
          : sortedSettlements.filter((st) => st.from_player === settlementFilter || st.to_player === settlementFilter);
        const pagedSettlements = filteredSettlements.slice(settlementPage * PAGE_SIZE, (settlementPage + 1) * PAGE_SIZE);

        const settlementPeople = new Map<string, string>();
        for (const st of seasonSettlements) {
          const f = activePlayers.find((p) => p.id === st.from_player);
          const t = activePlayers.find((p) => p.id === st.to_player);
          if (f && f.id !== myPlayer?.id) settlementPeople.set(f.id, f.name);
          if (t && t.id !== myPlayer?.id) settlementPeople.set(t.id, t.name);
        }

        return (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-visible">
          <div className="p-4 pb-3">
            <FilterDropdown
              options={[
                { key: 'mine', label: 'Mine', count: sortedSettlements.filter((st) => st.from_player === myPlayer?.id || st.to_player === myPlayer?.id).length },
                ...[...settlementPeople.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({
                  key: id, label: name, count: sortedSettlements.filter((st) => st.from_player === id || st.to_player === id).length,
                })),
              ]}
              value={settlementFilter === 'all' ? '' : settlementFilter}
              onChange={(key) => { setSettlementFilter(key || 'all'); setSettlementPage(0); }}
              allLabel="All Settlements"
              allCount={seasonSettlements.length}
              brand="cricket"
            />
          </div>
          <div className="px-3 pb-3 space-y-2">
            {pagedSettlements.map((st) => {
                const from = activePlayers.find((p) => p.id === st.from_player);
                const to = activePlayers.find((p) => p.id === st.to_player);
                if (!from || !to) return null;
                const isExpanded = expandedSettlementId === st.id;

                const owesSplits = activeSplits.filter((s) =>
                  s.created_at <= st.created_at && s.paid_by === st.to_player && (sharesMap.get(s.id) ?? []).some((sh) => sh.player_id === st.from_player),
                );
                const offsetSplits = activeSplits.filter((s) =>
                  s.created_at <= st.created_at && s.paid_by === st.from_player && (sharesMap.get(s.id) ?? []).some((sh) => sh.player_id === st.to_player),
                );
                const relatedSplits = [...owesSplits, ...offsetSplits];

                return (
                  <div key={st.id} className="rounded-xl overflow-hidden border transition-colors duration-200" style={{ borderColor: isExpanded ? 'var(--split-credit-border)' : 'var(--border)' }}>
                    <div className="flex items-center" style={{ background: isExpanded ? 'var(--split-credit-bg)' : 'var(--surface)' }}>
                      <button
                        onClick={() => setExpandedSettlementId(isExpanded ? null : st.id)}
                        className="flex-1 flex items-center gap-2.5 p-3 cursor-pointer transition-all active:scale-[0.98] min-w-0"
                      >
                        <div className="h-9 w-9 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--split-credit-bg)' }}>
                          <Handshake size={16} style={{ color: 'var(--split-credit)' }} />
                        </div>
                        <div className="flex-1 min-w-0 text-left">
                          <Text size="sm" weight="semibold" truncate className="block">
                            {from.name.split(' ')[0]} paid {to.name.split(' ')[0]}
                          </Text>
                          <Text as="p" size="2xs" color="dim">{formatDate(st.settled_date)}</Text>
                        </div>
                        <Text size="md" weight="bold" tabular style={{ color: 'var(--split-credit)' }}>{formatCurrency(Number(st.amount))}</Text>
                        <ChevronDown size={16} className="flex-shrink-0 text-[var(--dim)] transition-transform duration-200" style={{ transform: isExpanded ? 'rotate(180deg)' : undefined }} />
                      </button>
                      {isAdmin && (
                        <div className="pr-2 border-l border-[var(--border)]/30 ml-1">
                          <button
                            ref={openMenu === st.id ? menuBtnRef : null}
                            onClick={() => setOpenMenu(openMenu === st.id ? null : st.id)}
                            className="h-11 w-11 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors">
                            <EllipsisVertical size={14} />
                          </button>
                          {openMenu === st.id && (
                            <CardMenu anchorRef={menuBtnRef} onClose={() => setOpenMenu(null)} items={[
                              { label: 'Undo Settlement', icon: <Trash2 size={15} />, color: 'var(--split-owe)', onClick: () => setDeletingItem({ id: st.id, type: 'settlement', desc: `${from.name.split(' ')[0]} paid ${to.name.split(' ')[0]}`, paidBy: from.name, date: st.settled_date, amount: formatCurrency(Number(st.amount)) }) },
                            ]} />
                          )}
                        </div>
                      )}
                    </div>

                    <div className={`expand-collapse ${isExpanded ? 'expanded' : ''}`}>
                      <div>
                        <div className="px-3 pb-3">
                          <div className="border-t border-[var(--border)]/50 pt-2">
                            <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-2">Related Splits</Text>
                            {relatedSplits.length > 0 ? (
                              <div className="space-y-1.5">
                                {relatedSplits.map((s) => {
                                  const payer = activePlayers.find((pl) => pl.id === s.paid_by);
                                  const shareCount = (sharesMap.get(s.id) ?? []).length;
                                  const isOwes = s.paid_by === st.to_player;
                                  const relevantShare = (sharesMap.get(s.id) ?? []).find((sh) => sh.player_id === (isOwes ? st.from_player : st.to_player));
                                  const shareAmt = relevantShare ? Number(relevantShare.share_amount) : 0;
                                  return (
                                    <div key={s.id} className="flex items-center gap-2.5 rounded-lg p-2.5" style={{ background: 'var(--surface)', borderLeft: `3px solid ${isOwes ? 'var(--split-owe)' : 'var(--split-credit)'}` }}>
                                      <PlayerAvatar name={payer?.name ?? '?'} photoUrl={payer?.photo_url} size="sm" />
                                      <div className="flex-1 min-w-0">
                                        <Text size="xs" weight="semibold" truncate className="block">{s.description || s.category}</Text>
                                        <Text as="p" size="2xs" color="dim">{payer?.name?.split(' ')[0]} paid {formatCurrency(Number(s.amount))} · {shareCount} people · {formatDate(s.split_date)}</Text>
                                      </div>
                                      <Text size="xs" weight="bold" tabular style={{ color: isOwes ? 'var(--split-owe)' : 'var(--split-credit)' }}>
                                        {isOwes ? '+' : '-'}{formatCurrency(shareAmt)}
                                      </Text>
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <Text as="p" size="xs" color="dim" className="py-2">No related splits found</Text>
                            )}

                            {relatedSplits.length > 0 && (() => {
                              const totalOwes = owesSplits.reduce((sum, s) => {
                                const sh = shares.find((x) => x.split_id === s.id && x.player_id === st.from_player);
                                return sum + (sh ? Number(sh.share_amount) : 0);
                              }, 0);
                              const totalOffset = offsetSplits.reduce((sum, s) => {
                                const sh = shares.find((x) => x.split_id === s.id && x.player_id === st.to_player);
                                return sum + (sh ? Number(sh.share_amount) : 0);
                              }, 0);
                              const netOwed = Math.round((totalOwes - totalOffset) * 100) / 100;
                              const settledAmt = Number(st.amount);
                              const remaining = Math.round((netOwed - settledAmt) * 100) / 100;
                              return (
                                <div className="rounded-xl p-3 mt-3 space-y-1.5" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                                  <div className="flex justify-between">
                                    <Text size="xs" color="muted">Net owed</Text>
                                    <Text size="xs" weight="bold" tabular style={{ color: 'var(--split-owe)' }}>{formatCurrency(Math.max(0, netOwed))}</Text>
                                  </div>
                                  <div className="flex justify-between">
                                    <Text size="xs" color="muted">This settlement</Text>
                                    <Text size="xs" weight="bold" tabular style={{ color: 'var(--split-credit)' }}>-{formatCurrency(settledAmt)}</Text>
                                  </div>
                                  <div className="h-px" style={{ background: 'var(--border)' }} />
                                  <div className="flex justify-between">
                                    <Text size="xs" weight="semibold">Remaining</Text>
                                    <Text size="xs" weight="bold" tabular style={{ color: remaining <= 0 ? 'var(--split-credit)' : 'var(--split-owe)' }}>
                                      {remaining <= 0 ? 'Fully settled' : formatCurrency(remaining)}
                                    </Text>
                                  </div>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>

          <div className="px-3 pb-3">
            <Pagination page={settlementPage} setPage={setSettlementPage} totalItems={filteredSettlements.length} pageSize={PAGE_SIZE} />
          </div>
        </div>
        );
      })() : (
        <EmptyState icon={<Handshake size={28} />} title="No settlements yet" description="When someone pays back a debt, it shows up here." brand="cricket" />
      )}

      </div>}

      {/* ── Deleted tab ── */}
      {subTab === 'deleted' && (
        <div key="deleted" className="tab-enter">
          {deletedSplits.length > 0 ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)]" style={{ overflow: 'visible' }}>
              {/* Header — same hierarchy as Activity card */}
              <div className="px-4 pt-4 pb-2 flex items-center gap-2">
                <div className="h-6 w-6 rounded-full flex items-center justify-center" style={{ background: 'var(--split-owe-bg)' }}>
                  <Trash2 size={13} style={{ color: 'var(--split-owe)' }} />
                </div>
                <Text size="sm" weight="bold">Recently Deleted</Text>
                <Text size="2xs" color="dim" className="ml-auto">{deletedSplits.length} {deletedSplits.length === 1 ? 'split' : 'splits'}</Text>
              </div>

              {/* Activity-style row list — click to expand for per-person breakdown */}
              <div className="px-3 pb-3 space-y-2">
                {deletedSplits.map((s) => {
                  const payer = activePlayers.find((p) => p.id === s.paid_by);
                  const splitShares = sharesMap.get(s.id) ?? [];
                  const participants = splitShares
                    .map((sh) => activePlayers.find((p) => p.id === sh.player_id))
                    .filter((p): p is NonNullable<typeof p> => Boolean(p) && p?.id !== s.paid_by);
                  const expanded = expandedId === s.id;

                  return (
                    <div
                      key={s.id}
                      className="rounded-xl overflow-hidden border transition-colors duration-200"
                      style={{ borderColor: expanded ? 'color-mix(in srgb, var(--cricket) 30%, transparent)' : 'var(--border)' }}
                    >
                      <div className="flex items-center" style={{ background: expanded ? 'color-mix(in srgb, var(--cricket) 5%, transparent)' : 'var(--surface)' }}>
                        <button
                          onClick={() => setExpandedId(expanded ? null : s.id)}
                          className="flex-1 flex items-center gap-3 p-3 cursor-pointer transition-all active:scale-[0.98] min-w-0"
                        >
                          <PlayerAvatar name={payer?.name ?? '?'} photoUrl={payer?.photo_url} size="sm" opacity={0.55} />
                          <div className="flex-1 min-w-0 text-left" style={{ opacity: 0.78 }}>
                            <Text size="sm" weight="semibold" truncate className="line-through decoration-[var(--muted)]/50 block">
                              {s.description || s.category}
                            </Text>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <Text as="span" size="2xs" color="dim">
                                {payer?.name?.split(' ')[0] ?? 'Unknown'} paid · {formatDate(s.split_date)}
                              </Text>
                              {participants.length > 0 && (() => {
                                const NAMES_VISIBLE = 3;
                                const visibleNames = participants.slice(0, NAMES_VISIBLE).map((p) => p.name.split(' ')[0]);
                                const remaining = participants.length - visibleNames.length;
                                const fullList = participants.map((p) => p.name).join(', ');
                                return (
                                  <>
                                    <Text as="span" size="2xs" color="dim">·</Text>
                                    <Text as="span" size="2xs" color="dim" title={fullList}>
                                      with{' '}
                                      <Text as="span" size="2xs" weight="semibold" style={{ color: 'var(--text)' }}>
                                        {visibleNames.join(', ')}
                                      </Text>
                                      {remaining > 0 && <Text as="span" size="2xs" color="dim">{` +${remaining}`}</Text>}
                                    </Text>
                                  </>
                                );
                              })()}
                            </div>
                          </div>
                          <Text size="sm" weight="bold" tabular className="line-through decoration-[var(--muted)]/50 flex-shrink-0" style={{ opacity: 0.6 }}>
                            {formatCurrency(Number(s.amount))}
                          </Text>
                          <ChevronDown size={16} className="flex-shrink-0 text-[var(--dim)] transition-transform duration-200" style={{ transform: expanded ? 'rotate(180deg)' : undefined }} />
                        </button>

                        {/* Action buttons — siblings of the expand-button so taps don't toggle the row */}
                        <div className="pr-2 flex items-center gap-1 flex-shrink-0 border-l border-[var(--border)]/30 pl-2 ml-1">
                          <button
                            onClick={() => useSplitsStore.getState().restoreSplit(s.id)}
                            className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer active:scale-90 transition-all hover:brightness-110"
                            style={{ color: 'var(--split-credit)', background: 'var(--split-credit-bg)', border: '1px solid var(--split-credit-border)' }}
                            aria-label="Restore split"
                            title="Restore"
                          >
                            <RotateCcw size={14} />
                          </button>
                          <button
                            onClick={() => setPermanentDeleting({ id: s.id, desc: s.description || s.category, amount: formatCurrency(Number(s.amount)) })}
                            className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer active:scale-90 transition-all hover:brightness-110"
                            style={{ color: 'var(--split-owe)', background: 'var(--split-owe-bg)', border: '1px solid var(--split-owe-border)' }}
                            aria-label="Delete forever"
                            title="Delete forever"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>

                      {/* Expanded per-person breakdown */}
                      <div className={`expand-collapse ${expanded ? 'expanded' : ''}`}>
                        <div>
                          <div className="px-3 pb-3" style={{ background: 'color-mix(in srgb, var(--cricket) 3%, transparent)' }}>
                            <div className="border-t border-[var(--border)]/50 pt-3 space-y-2">
                              {/* Per-person breakdown — payer at top, others sorted by share */}
                              {[...splitShares]
                                .sort((a, b) => {
                                  if (a.player_id === s.paid_by) return -1;
                                  if (b.player_id === s.paid_by) return 1;
                                  return Number(b.share_amount) - Number(a.share_amount);
                                })
                                .map((sh) => {
                                  const p = activePlayers.find((pl) => pl.id === sh.player_id);
                                  if (!p) return null;
                                  const isPayer = sh.player_id === s.paid_by;
                                  return (
                                    <div
                                      key={sh.id}
                                      className="flex items-center gap-3 rounded-lg p-2.5"
                                      style={{
                                        background: isPayer ? 'color-mix(in srgb, var(--cricket) 6%, var(--surface))' : 'var(--surface)',
                                        borderLeft: `3px solid ${isPayer ? 'var(--cricket)' : 'var(--split-owe)'}`,
                                      }}
                                    >
                                      <PlayerAvatar name={p.name} photoUrl={p.photo_url} size="sm" />
                                      <div className="flex-1 min-w-0">
                                        <Text size="sm" weight="semibold" truncate>{p.name}</Text>
                                        {isPayer ? (
                                          <Text as="p" size="2xs" style={{ color: 'var(--cricket)' }}>Paid {formatCurrency(Number(s.amount))}</Text>
                                        ) : (
                                          <Text as="p" size="2xs" color="dim">Owed {payer?.name?.split(' ')[0] ?? 'Unknown'}</Text>
                                        )}
                                      </div>
                                      <Text size="sm" weight="bold" tabular className="flex-shrink-0"
                                        style={{ color: isPayer ? 'var(--cricket)' : 'var(--split-owe)' }}>
                                        {formatCurrency(Number(sh.share_amount))}
                                      </Text>
                                    </div>
                                  );
                                })}

                              {/* Receipts if attached */}
                              {s.receipt_urls && s.receipt_urls.length > 0 && (
                                <div className="pt-2">
                                  <div className="flex items-center gap-1.5 mb-2">
                                    <Paperclip size={12} style={{ color: 'var(--muted)' }} />
                                    <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider">
                                      Receipts ({s.receipt_urls.length})
                                    </Text>
                                  </div>
                                  <div className="flex flex-wrap gap-1.5">
                                    {s.receipt_urls.map((url, i) => {
                                      const pdf = isUrlPdf(url);
                                      return (
                                        <button
                                          key={i}
                                          onClick={() => window.open(url, '_blank')}
                                          className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 cursor-pointer active:scale-[0.98] transition-all hover:bg-[var(--hover-bg)]"
                                          style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
                                        >
                                          {pdf
                                            ? <FileText size={12} style={{ color: '#EF4444' }} />
                                            : <Receipt size={12} style={{ color: 'var(--cricket)' }} />}
                                          <Text size="2xs" weight="medium">Receipt {i + 1}{pdf ? '.pdf' : '.jpg'}</Text>
                                          <ExternalLink size={9} className="text-[var(--dim)]" />
                                        </button>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* Deletion attribution */}
                              {s.deleted_by && (
                                <div className="pt-2 border-t border-[var(--border)]/40">
                                  <Text as="p" size="2xs" color="dim">
                                    Deleted by <Text as="span" weight="semibold">{s.deleted_by}</Text>
                                    {s.deleted_at && <> on {formatDate(s.deleted_at.split('T')[0])}</>}
                                  </Text>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <EmptyState icon={<Trash2 size={28} />} title="Nothing deleted" description="Deleted splits will live here so you can restore or wipe them." brand="cricket" />
          )}
        </div>
      )}

      {/* FAB */}
      <button onClick={() => useSplitsStore.setState({ showSplitForm: true })}
        aria-label="Add new split"
        className="fixed z-30 flex h-14 w-14 items-center justify-center rounded-full shadow-lg cursor-pointer transition-all active:scale-95 hover:shadow-xl hover:-translate-y-0.5"
        style={{ bottom: 'calc(80px + env(safe-area-inset-bottom, 0px))', right: '16px', background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))', boxShadow: '0 4px 20px var(--cricket-glow), 0 0 0 3px color-mix(in srgb, var(--cricket) 20%, transparent)' }}>
        <Plus size={24} className="text-white" />
      </button>

      {splitFormMounted && <SplitForm />}
      {settleDrawerMounted && <SplitSettleDrawer />}

      {deletingItem && (
        <DeleteConfirm
          description={deletingItem.desc} paidBy={deletingItem.paidBy} date={deletingItem.date}
          amount={deletingItem.amount} type={deletingItem.type}
          onCancel={() => setDeletingItem(null)}
          onConfirm={() => {
            if (deletingItem.type === 'split') handleDeleteSplit(deletingItem.id);
            else useSplitsStore.getState().deleteSplitSettlement(deletingItem.id);
            setDeletingItem(null);
          }}
        />
      )}

      {/* Permanent delete confirm */}
      {permanentDeleting && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
          role="alertdialog" aria-modal="true" aria-label="Permanently delete split"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={() => setPermanentDeleting(null)}>
          <div className="w-full max-w-[360px] rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0" style={{ background: 'var(--split-owe-bg)' }}>
                <Trash2 size={20} style={{ color: 'var(--split-owe)' }} />
              </div>
              <div>
                <Text size="sm" weight="semibold">Permanently delete?</Text>
                <Text as="p" size="xs" color="muted"><b>{permanentDeleting.desc}</b> · {permanentDeleting.amount}</Text>
              </div>
            </div>
            <Text as="p" size="xs" color="dim" className="mb-4">
              This wipes the split, all shares, and any attached receipts from storage. <b>Can&apos;t be undone.</b>
            </Text>
            <div className="flex gap-2 justify-end">
              <button onClick={() => setPermanentDeleting(null)}
                className="px-4 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
                Cancel
              </button>
              <button onClick={() => {
                useSplitsStore.getState().permanentDeleteSplit(permanentDeleting.id);
                setPermanentDeleting(null);
              }}
                className="px-4 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-opacity"
                style={{ background: 'var(--split-owe)' }}>
                Delete forever
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}

      {/* Edit blocked — split has settlements */}
      {editBlockedSplit && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4 animate-fade-in"
          style={{ background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(6px)' }} onClick={() => setEditBlockedSplit(null)}>
          <div className="w-full max-w-[340px] rounded-2xl p-5"
            style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
            onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                style={{ background: 'color-mix(in srgb, var(--cricket) 12%, transparent)' }}>
                <Pencil size={18} style={{ color: 'var(--cricket)' }} />
              </div>
              <div>
                <Text size="sm" weight="semibold">Can&apos;t edit directly</Text>
                <Text as="p" size="xs" color="muted"><b>{editBlockedSplit.desc}</b> has settlements</Text>
              </div>
            </div>
            <Text as="p" size="xs" color="dim" className="mb-4">
              Choose an option to proceed:
            </Text>
            {(() => {
              const splitShareHolders = new Set((sharesMap.get(editBlockedSplit.id) ?? []).map((sh) => sh.player_id));
              const toDelete = seasonSettlements.filter((st) => st.to_player === editBlockedSplit.paidById && splitShareHolders.has(st.from_player));
              const totalUndoAmount = toDelete.reduce((sum, st) => sum + Number(st.amount), 0);
              return (
            <div className="space-y-2">
              <button
                onClick={() => {
                  for (const st of toDelete) {
                    useSplitsStore.getState().deleteSplitSettlement(st.id);
                  }
                  useSplitsStore.setState({ editingSplitId: editBlockedSplit.id, showSplitForm: true });
                  setEditBlockedSplit(null);
                }}
                className="w-full flex items-center gap-3 rounded-xl p-3 cursor-pointer transition-all active:scale-[0.98] border border-[var(--border)] hover:bg-[var(--hover-bg)]"
              >
                <Handshake size={18} style={{ color: '#F59E0B' }} />
                <div className="flex-1 text-left">
                  <Text size="sm" weight="semibold">Undo {toDelete.length} settlement{toDelete.length !== 1 ? 's' : ''} &amp; edit</Text>
                  <Text as="p" size="2xs" color="dim">
                    Reverts {formatCurrency(totalUndoAmount)} across {toDelete.length} settlement{toDelete.length !== 1 ? 's' : ''} between this split&apos;s members and payer
                  </Text>
                </div>
              </button>
              <button
                onClick={() => {
                  setEditBlockedSplit(null);
                  setDeletingItem({ id: editBlockedSplit.id, type: 'split', desc: editBlockedSplit.desc });
                }}
                className="w-full flex items-center gap-3 rounded-xl p-3 cursor-pointer transition-all active:scale-[0.98] border border-[var(--border)] hover:bg-[var(--hover-bg)]"
              >
                <Trash2 size={18} style={{ color: 'var(--split-owe)' }} />
                <div className="flex-1 text-left">
                  <Text size="sm" weight="semibold">Delete &amp; re-add</Text>
                  <Text as="p" size="2xs" color="dim">Remove this split and create a new one</Text>
                </div>
              </button>
            </div>
              );
            })()}
            <button onClick={() => setEditBlockedSplit(null)}
              className="w-full mt-3 py-2.5 min-h-[44px] rounded-xl text-[13px] font-medium text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
