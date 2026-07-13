'use client';

import { useMemo, useEffect, useState, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useSplitsStore } from '@/stores/splits-store';
import { useAuthStore } from '@/stores/auth-store';
import { formatCurrency, formatDate } from '../lib/utils';
import { nameToGradient } from '@/lib/avatar';
import { Text, CardMenu, FilterDropdown, RefreshButton, Button } from '@/components/ui';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { Plus, Handshake, Trash2, Pencil, ChevronDown, ChevronRight, EllipsisVertical, PartyPopper, CheckCircle2, Receipt, ArrowDownRight, ArrowUpRight, TrendingUp, Paperclip, FileText, ExternalLink, RotateCcw, Info, Search, ArrowLeftRight, ArrowUpDown, SlidersHorizontal, Check } from 'lucide-react';

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

/* ── Summary card (You Owe / You're Owed) — tappable, jumps to Balances ── */
function SummaryCard({ variant, amount, onClick }: { variant: 'owe' | 'owed'; amount: number; onClick: () => void }) {
  const isOwe = variant === 'owe';
  const color = isOwe ? 'var(--split-owe)' : 'var(--split-credit)';
  const bg = isOwe ? 'var(--split-owe-bg)' : 'var(--split-credit-bg)';
  const border = isOwe ? 'var(--split-owe-border)' : 'var(--split-credit-border)';
  const Icon = isOwe ? ArrowDownRight : ArrowUpRight;
  return (
    <button
      onClick={onClick}
      className="group flex items-center gap-3 rounded-xl border p-3.5 min-h-[64px] w-full text-left cursor-pointer transition-all active:scale-[0.99] hover:brightness-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
      style={{ background: bg, borderColor: border }}
      aria-label={isOwe ? `You owe ${formatCurrency(amount)} — view balances` : `You're owed ${formatCurrency(amount)} — view balances`}
    >
      <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--card)', border: `1px solid ${border}` }}>
        <Icon size={16} style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        <Text as="p" size="xs" weight="semibold" color="muted">{isOwe ? 'You Owe' : "You're Owed"}</Text>
        <Text as="p" size="lg" weight="bold" tabular style={{ color }}>{formatCurrency(amount)}</Text>
        <Text as="p" size="2xs" color="dim" className="mt-0.5">{isOwe ? 'Total amount you need to settle' : 'Total amount others owe you'}</Text>
      </div>
      <ChevronRight size={18} className="flex-shrink-0 text-[var(--dim)] transition-opacity sm:opacity-0 sm:group-hover:opacity-100" aria-hidden />
    </button>
  );
}

/* ── Splits primary tabs — icon + title + count, with desktop description ── */
interface SplitsTab { key: string; label: string; desc: string; icon: React.ReactNode; count: number }
function SplitsTabs({ tabs, active, onChange }: { tabs: SplitsTab[]; active: string; onChange: (key: string) => void }) {
  return (
    <div role="tablist" aria-label="Splits views" className="flex gap-1 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-1.5">
      {tabs.map((t) => {
        const isActive = active === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(t.key)}
            className={`flex-1 min-w-0 flex flex-row items-center sm:items-start justify-center sm:justify-start gap-1.5 sm:gap-2.5 px-1.5 sm:px-3.5 py-1.5 sm:py-2.5 rounded-lg sm:rounded-xl cursor-pointer select-none transition-all duration-200 active:scale-[0.97] ${
              isActive ? 'text-white' : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)]'
            }`}
            style={isActive ? { background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))', boxShadow: '0 2px 10px var(--cricket-glow)' } : undefined}
          >
            <span className="flex-shrink-0 sm:mt-px" aria-hidden>{t.icon}</span>
            <span className="min-w-0 flex flex-col items-start leading-tight">
              <span className="flex items-center gap-1 min-w-0">
                <span className="text-[12px] sm:text-[13px] font-semibold truncate">{t.label}</span>
                {t.count > 0 && (
                  <span
                    className="text-[10px] sm:text-[11px] font-bold leading-none px-1.5 py-0.5 rounded-full"
                    style={isActive ? { background: 'rgba(255,255,255,0.22)', color: 'white' } : { background: 'color-mix(in srgb, var(--cricket) 14%, transparent)', color: 'var(--cricket)' }}
                  >
                    {t.count}
                  </span>
                )}
              </span>
              <span className={`hidden sm:block text-[11px] font-medium mt-0.5 ${isActive ? 'text-white/80' : 'text-[var(--dim)]'}`}>{t.desc}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}

/* ── Relationship segmented control (All / I Owe / Owed to Me) ── */
type RelationValue = 'all' | 'iowe' | 'owed';
function RelationChips({ value, onChange, fullWidth = false }: { value: RelationValue; onChange: (v: RelationValue) => void; fullWidth?: boolean }) {
  return (
    <div role="group" aria-label="Filter by relationship" className={`flex items-center gap-1 rounded-xl bg-[var(--surface)] border border-[var(--border)] p-1 ${fullWidth ? 'w-full' : ''}`}>
      {([['all', 'All'], ['iowe', 'I Owe'], ['owed', 'Owed to Me']] as const).map(([key, label]) => {
        const on = value === key;
        return (
          <button
            key={key}
            onClick={() => onChange(key)}
            aria-pressed={on}
            className={`${fullWidth ? 'flex-1' : ''} px-2.5 sm:px-3 py-1.5 min-h-[38px] rounded-lg text-[12px] sm:text-[13px] font-semibold cursor-pointer transition-all active:scale-95 whitespace-nowrap ${on ? '' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
            style={on ? { background: 'color-mix(in srgb, var(--cricket) 14%, transparent)', color: 'var(--cricket)', boxShadow: 'inset 0 0 0 1px color-mix(in srgb, var(--cricket) 30%, transparent)' } : undefined}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/* ── Mobile combined person-filter + sort popover ── */
function MobileActivityMenu({ people, allCount, personValue, onPerson, sort, onSort }: {
  people: { key: string; label: string; count: number }[];
  allCount: number;
  personValue: string; // '' === All Activity
  onPerson: (key: string) => void;
  sort: 'newest' | 'oldest';
  onSort: (s: 'newest' | 'oldest') => void;
}) {
  const [open, setOpen] = useState(false);
  const personActive = personValue !== '';
  const peopleOptions = [{ key: '', label: 'All Activity', count: allCount }, ...people];
  return (
    <div className="relative flex-shrink-0">
      <button
        onClick={() => setOpen(!open)}
        aria-label="Filter and sort activity"
        aria-expanded={open}
        className="relative h-11 w-11 flex items-center justify-center rounded-xl bg-[var(--surface)] border border-[var(--border)] cursor-pointer active:scale-95 transition-transform"
      >
        <SlidersHorizontal size={17} className="text-[var(--cricket)]" />
        {personActive && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-[var(--card)]" style={{ background: 'var(--cricket)' }} />}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-[52px] z-50 w-[240px] max-h-[60vh] overflow-y-auto bg-[var(--card)] border border-[var(--border)] rounded-2xl p-2 shadow-2xl animate-[scaleIn_0.15s]">
            <Text as="p" size="2xs" weight="bold" color="dim" uppercase tracking="wider" className="px-2 pt-1 pb-1.5">Sort</Text>
            {([['newest', 'Newest first'], ['oldest', 'Oldest first']] as const).map(([k, l]) => {
              const on = sort === k;
              return (
                <button
                  key={k}
                  onClick={() => onSort(k)}
                  className={`flex items-center justify-between w-full px-3 py-2.5 min-h-[44px] rounded-xl text-[14px] font-medium cursor-pointer transition-colors ${on ? 'text-[var(--cricket)] bg-[var(--cricket)]/12' : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'}`}
                >
                  <span>{l}</span>
                  {on && <Check size={15} />}
                </button>
              );
            })}
            <div className="h-px my-1.5" style={{ background: 'var(--border)' }} />
            <Text as="p" size="2xs" weight="bold" color="dim" uppercase tracking="wider" className="px-2 pt-1 pb-1.5">Show</Text>
            {peopleOptions.map((opt) => {
              const on = personValue === opt.key;
              return (
                <button
                  key={opt.key || 'all'}
                  onClick={() => { onPerson(opt.key); setOpen(false); }}
                  className={`flex items-center justify-between w-full px-3 py-2.5 min-h-[44px] rounded-xl text-[14px] font-medium cursor-pointer transition-colors ${on ? 'text-[var(--cricket)] bg-[var(--cricket)]/12' : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'}`}
                >
                  <span className="truncate">{opt.label}</span>
                  <span className={`ml-2 text-[12px] font-bold px-1.5 py-0.5 rounded-md flex-shrink-0 ${on ? 'bg-[var(--cricket)]/20 text-[var(--cricket)]' : 'bg-[var(--border)] text-[var(--dim)]'}`}>{opt.count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
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
  const [activitySearch, setActivitySearch] = useState('');
  const [activityRelation, setActivityRelation] = useState<'all' | 'iowe' | 'owed'>('all');
  const [activitySort, setActivitySort] = useState<'newest' | 'oldest'>('newest');
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

  // Tapping a hero summary card jumps to the Balances tab and scrolls the matching section into view.
  const goToBalances = (which: 'owe' | 'owed') => {
    setSubTab('balances');
    setActivityPage(0);
    setSettlementPage(0);
    requestAnimationFrame(() => {
      document.getElementById(which === 'owe' ? 'balances-owe' : 'balances-owed')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
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
          <div className="flex items-center justify-between gap-3 mb-1">
            <div className="flex items-center gap-1.5 min-w-0">
              <Text as="p" size="xs" weight="semibold" color="muted" uppercase tracking="wider">Your Net Balance</Text>
              <button
                type="button"
                title="What you're owed minus what you owe."
                aria-label="What you're owed minus what you owe."
                className="flex-shrink-0 text-[var(--dim)] hover:text-[var(--muted)] cursor-help rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60"
              >
                <Info size={13} />
              </button>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <SummaryCard variant="owe" amount={totalIOwe} onClick={() => goToBalances('owe')} />
              <SummaryCard variant="owed" amount={totalOwedToMe} onClick={() => goToBalances('owed')} />
            </div>
          )}
        </div>
      </div>

      {/* Splits section header */}
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <Text as="h2" size="md" weight="bold" className="leading-tight sm:text-[16px]">Splits</Text>
          <Text as="p" size="xs" color="muted" className="mt-0.5">Track and manage your shared expenses</Text>
        </div>
        {isAdmin && (
          <Button
            onClick={() => useSplitsStore.setState({ showSplitForm: true })}
            variant="primary"
            brand="cricket"
            size="sm"
            className="gap-1 flex-shrink-0 px-2.5 sm:px-3"
          >
            <Plus size={15} />
            Add Split
          </Button>
        )}
      </div>

      {/* Sub-tabs */}
      <SplitsTabs
        tabs={[
          { key: 'activity', label: 'Activity', desc: 'Recent transactions', icon: <Receipt size={15} />, count: activityFeed.length },
          { key: 'balances', label: 'Balances', desc: 'Who owes what', icon: <ArrowLeftRight size={15} />, count: myDebtsIOwe.length + myDebtsOwedToMe.length },
          { key: 'settlements', label: 'Settled', desc: 'Completed splits', icon: <CheckCircle2 size={15} />, count: seasonSettlements.length },
          ...(deletedSplits.length > 0 && isAdmin ? [{ key: 'deleted', label: 'Deleted', desc: 'Recently deleted', icon: <Trash2 size={15} />, count: deletedSplits.length }] : []),
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
            <div id="balances-owe" className="scroll-mt-24 rounded-2xl border bg-[var(--card)] overflow-hidden" style={{ borderColor: 'var(--split-owe-border)' }}>
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
            <div id="balances-owed" className="scroll-mt-24 rounded-2xl border bg-[var(--card)] overflow-hidden" style={{ borderColor: 'var(--split-credit-border)' }}>
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
        // Word-prefix search: every query term must match the start of some word in the
        // description or payer name. Avoids "T" matching the "t" buried inside "Mountain".
        const terms = activitySearch.trim().toLowerCase().split(/\s+/).filter(Boolean);
        const filteredActivity = activityFeed
          .filter((a) => {
            // Person filter (existing FilterDropdown)
            if (activityFilter !== 'all') {
              const matchPerson = activityFilter === 'mine'
                ? (a.paidById === myPlayer?.id || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === myPlayer?.id))
                : (a.paidById === activityFilter || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === activityFilter));
              if (!matchPerson) return false;
            }
            // Relationship filter — derived from split/share data, no business-logic change
            if (activityRelation !== 'all' && myPlayer) {
              const iAmPayer = a.paidById === myPlayer.id;
              const iHaveShare = (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === myPlayer.id);
              if (activityRelation === 'iowe' && !(iHaveShare && !iAmPayer)) return false;
              if (activityRelation === 'owed' && !iAmPayer) return false;
            }
            // Search — description/category + payer name, matched by word prefix
            if (terms.length) {
              const words = `${a.description} ${a.paidByName}`.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
              if (!terms.every((t) => words.some((w) => w.startsWith(t)))) return false;
            }
            return true;
          })
          .sort((a, b) => (activitySort === 'newest' ? b.date.localeCompare(a.date) : a.date.localeCompare(b.date)));
        const pagedActivity = filteredActivity.slice(activityPage * PAGE_SIZE, (activityPage + 1) * PAGE_SIZE);

        const activityPeople = new Map<string, string>();
        for (const a of activityFeed) {
          const splitShrs = sharesMap.get(a.id) ?? [];
          for (const sh of splitShrs) {
            const p = activePlayers.find((pl) => pl.id === sh.player_id);
            if (p && p.id !== myPlayer?.id) activityPeople.set(p.id, p.name);
          }
        }

        const personPeople = [
          { key: 'mine', label: 'Mine', count: activityFeed.filter((a) => a.paidById === myPlayer?.id || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === myPlayer?.id)).length },
          ...[...activityPeople.entries()].sort((a, b) => a[1].localeCompare(b[1])).map(([id, name]) => ({
            key: id, label: name, count: activityFeed.filter((a) => a.paidById === id || (sharesMap.get(a.id) ?? []).some((sh) => sh.player_id === id)).length,
          })),
        ];

        return (
        <div className="overflow-visible sm:rounded-2xl sm:border sm:border-[var(--border)] sm:bg-[var(--card)]">
          {/* Filter / search toolbar */}
          <div className="pb-3 sm:p-4 sm:pb-3 sm:border-b sm:border-[var(--border)]/50">
            <div className="flex flex-col sm:flex-row sm:items-center gap-2.5">
              {/* Row 1: search + (mobile) combined filter menu */}
              <div className="flex items-center gap-2 sm:flex-1 sm:min-w-0">
                <div className="relative flex-1 min-w-0">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--dim)] pointer-events-none" />
                  <input
                    type="text"
                    value={activitySearch}
                    onChange={(e) => { setActivitySearch(e.target.value); setActivityPage(0); }}
                    placeholder="Search activity..."
                    aria-label="Search activity"
                    className="w-full h-11 sm:h-10 pl-9 pr-3 rounded-xl text-[14px] bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] placeholder:text-[var(--dim)] focus:outline-none focus:border-[var(--cricket)]/50 transition-colors"
                  />
                </div>
                {/* Mobile-only combined person-filter + sort */}
                <div className="sm:hidden">
                  <MobileActivityMenu
                    people={personPeople}
                    allCount={activityFeed.length}
                    personValue={activityFilter === 'all' ? '' : activityFilter}
                    onPerson={(key) => { setActivityFilter(key || 'all'); setActivityPage(0); }}
                    sort={activitySort}
                    onSort={(s) => { setActivitySort(s); setActivityPage(0); }}
                  />
                </div>
              </div>

              {/* Desktop-only secondary controls: relationship chips + person filter + sort */}
              <div className="hidden sm:flex items-center gap-2 flex-wrap">
                <RelationChips value={activityRelation} onChange={(v) => { setActivityRelation(v); setActivityPage(0); }} />
                <FilterDropdown
                  options={personPeople}
                  value={activityFilter === 'all' ? '' : activityFilter}
                  onChange={(key) => { setActivityFilter(key || 'all'); setActivityPage(0); }}
                  allLabel="All Activity"
                  allCount={activityFeed.length}
                  brand="cricket"
                />
                <button
                  onClick={() => { setActivitySort((s) => (s === 'newest' ? 'oldest' : 'newest')); setActivityPage(0); }}
                  className="flex items-center gap-1.5 h-10 px-3 rounded-xl text-[13px] font-medium bg-[var(--surface)] border border-[var(--border)] text-[var(--text)] hover:border-[var(--muted)] cursor-pointer transition-colors"
                  title="Toggle sort order"
                  aria-label={activitySort === 'newest' ? 'Sorted newest first — tap for oldest first' : 'Sorted oldest first — tap for newest first'}
                >
                  <ArrowUpDown size={14} className="text-[var(--cricket)]" />
                  <span>{activitySort === 'newest' ? 'Newest first' : 'Oldest first'}</span>
                </button>
              </div>

              {/* Row 2 (mobile only): full-width relationship segmented control */}
              <div className="sm:hidden">
                <RelationChips value={activityRelation} onChange={(v) => { setActivityRelation(v); setActivityPage(0); }} fullWidth />
              </div>
            </div>
          </div>
          <div className="pt-2.5 pb-1 space-y-1.5 sm:px-3 sm:pt-3 sm:pb-3 sm:space-y-2">
            {pagedActivity.length === 0 && (
              <div className="py-8 text-center">
                <Text as="p" size="sm" color="muted">No activity matches your filters.</Text>
              </div>
            )}
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
                      aria-expanded={expanded}
                      className="flex-1 flex items-center gap-2.5 sm:gap-3 p-2.5 sm:p-3 cursor-pointer transition-all active:scale-[0.98] min-w-0"
                    >
                      <PlayerAvatar name={a.paidByName} photoUrl={a.paidByPhoto} />
                      <div className="flex-1 min-w-0 text-left">
                        <Text size="sm" weight="semibold" className="block line-clamp-2 break-words">{a.description}</Text>
                        <div className="flex items-center gap-1 mt-0.5 min-w-0 text-[11px] leading-tight">
                          <span className="text-[var(--dim)] truncate">{a.paidByName.split(' ')[0]} paid</span>
                          <span className="text-[var(--dim)] flex-shrink-0" aria-hidden>·</span>
                          <span className="font-semibold text-[var(--muted)] whitespace-nowrap flex-shrink-0">{formatDate(a.date)}</span>
                          {a.splitCount > 0 && (
                            <>
                              <span className="text-[var(--dim)] flex-shrink-0" aria-hidden>·</span>
                              <span className="text-[var(--dim)] whitespace-nowrap flex-shrink-0">{a.splitCount} people</span>
                            </>
                          )}
                          {a.receiptUrls && a.receiptUrls.length > 0 && (
                            <span className="inline-flex items-center gap-0.5 flex-shrink-0 text-[var(--dim)]">
                              <Paperclip size={10} style={{ color: 'var(--muted)' }} />
                              <span style={{ fontVariantNumeric: 'tabular-nums' }}>{a.receiptUrls.length}</span>
                            </span>
                          )}
                        </div>
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
                      <div className="pr-1 sm:pr-2 flex-shrink-0">
                        <button
                          ref={openMenu === a.id ? menuBtnRef : null}
                          onClick={() => setOpenMenu(openMenu === a.id ? null : a.id)}
                          className="h-11 w-10 sm:w-11 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
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
