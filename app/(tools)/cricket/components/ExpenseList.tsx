'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';
import { Shirt, Trophy, Utensils, Package } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  FaTshirt: Shirt, MdSportsCricket, FaTrophy: Trophy, FaUtensils: Utensils, FaBox: Package,
};
import { formatCurrency, formatDate } from '../lib/utils';
import { EmptyState, Text, CardMenu, Badge, Spinner, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Pencil, Trash2, ChevronDown, Camera, X, Receipt, ExternalLink, FileText, Info, TrendingUp, Heart, ArrowDownRight, Wallet, Paperclip, ReceiptText, Plus } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { compressReceiptImage } from '../lib/image';
import { toast } from 'sonner';
import type { CricketExpense } from '@/types/cricket';
import type { CategoryConfig } from '../lib/constants';

const isUrlPdf = (url: string) => url.split('?')[0].toLowerCase().endsWith('.pdf');

/* ── Delete Confirm ── */
function DeleteConfirm({ description, permanent, onConfirm, onCancel }: { description: string; permanent?: boolean; onConfirm: () => void; onCancel: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
      style={{ background: 'rgba(0,0,0,0.4)', backdropFilter: 'blur(4px)' }} onClick={onCancel}>
      <div className="w-[340px] rounded-2xl p-5"
        style={{ background: 'var(--surface)', border: '1px solid var(--border)', boxShadow: '0 25px 50px rgba(0,0,0,0.3)' }}
        onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(248,113,113,0.1)' }}>
            <Trash2 size={20} style={{ color: 'var(--red)' }} />
          </div>
          <div>
            <p className="text-[15px] font-semibold text-[var(--text)]">{permanent ? 'Delete Permanently' : 'Delete Expense'}</p>
            <p className="text-[13px] text-[var(--muted)]">
              {permanent ? <>Permanently delete <b>{description}</b>? This cannot be undone.</> : <>Remove <b>{description}</b>?</>}
            </p>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={onCancel}
            className="px-4 py-2 rounded-xl text-[13px] font-medium border border-[var(--border)] text-[var(--muted)] cursor-pointer hover:bg-[var(--hover-bg)]">
            Cancel
          </button>
          <button onClick={onConfirm}
            className="px-4 py-2 rounded-xl text-[13px] font-medium bg-[var(--red)] text-white cursor-pointer hover:opacity-90">
            {permanent ? 'Delete Forever' : 'Delete'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/* ── Category Icon Avatar ── */
function CategoryAvatar({ config, size = 'md' }: { config: CategoryConfig; size?: 'sm' | 'md' }) {
  const Icon = CATEGORY_ICONS[config.iconName];
  const dim = size === 'sm' ? 'h-8 w-8' : 'h-10 w-10';
  const iconSize = size === 'sm' ? 14 : 17;
  return (
    <div
      className={`${dim} flex-shrink-0 rounded-xl flex items-center justify-center`}
      style={{ background: `${config.color}18`, border: `1px solid ${config.color}25` }}
    >
      {Icon && <Icon size={iconSize} style={{ color: config.color }} />}
    </div>
  );
}

/* ── Radial Gauge (SVG ring) ── */
function SpendingGauge({ pct, isLow }: { pct: number; isLow: boolean }) {
  const r = 28;
  const circ = 2 * Math.PI * r;
  const filled = (Math.min(pct, 100) / 100) * circ;
  const strokeColor = pct > 90
    ? '#EF4444'
    : pct > 70 ? '#F59E0B' : isLow ? '#FCA5A5' : '#4DBBEB';

  return (
    <div className="relative flex-shrink-0" style={{ width: 68, height: 68 }}>
      <svg width="68" height="68" viewBox="0 0 68 68" className="block">
        <circle cx="34" cy="34" r={r} fill="none" stroke="var(--border)" strokeWidth="5" />
        <circle cx="34" cy="34" r={r} fill="none" stroke={strokeColor}
          strokeWidth="5" strokeLinecap="round"
          strokeDasharray={`${filled} ${circ - filled}`}
          strokeDashoffset={circ * 0.25}
          style={{ transition: 'stroke-dasharray 0.8s cubic-bezier(.4,0,.2,1)', filter: `drop-shadow(0 0 6px ${strokeColor}60)` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[15px] font-bold leading-none" style={{ color: strokeColor }}>{Math.round(pct)}%</span>
        <span className="text-[9px] font-semibold leading-none mt-0.5" style={{ color: 'var(--muted)' }}>spent</span>
      </div>
    </div>
  );
}

/* ── Pool Health Badge ── */
function PoolHealthBadge({ pct, isLow }: { pct: number; isLow: boolean }) {
  const label = isLow ? 'Shortfall' : pct > 90 ? 'Critical' : pct > 70 ? 'Caution' : 'Healthy';
  const color = isLow || pct > 90 ? '#EF4444' : pct > 70 ? '#F59E0B' : '#34D399';
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
      style={{ background: `${color}18`, border: `1px solid ${color}30` }}>
      <span className="h-1.5 w-1.5 rounded-full" style={{ background: color, boxShadow: `0 0 4px ${color}` }} />
      <span className="text-[10px] font-bold tracking-wide uppercase" style={{ color }}>{label}</span>
    </span>
  );
}

/* ── Pool Fund Hero — refined: one focal number + integrated bar + stat strip ── */
function PoolFundHero({
  totalFees, totalSponsorship, totalSpent, poolBalance, isLow, perPerson, hasPlayers,
}: {
  totalFees: number; totalSponsorship: number; totalSpent: number;
  poolBalance: number; isLow: boolean; perPerson: number; hasPlayers: boolean;
}) {
  const totalCollected = totalFees + totalSponsorship;
  const spentPct = totalCollected > 0 ? Math.min((totalSpent / totalCollected) * 100, 100) : 0;
  const remaining = totalCollected - totalSpent;
  const status = isLow
    ? { label: 'Shortfall', color: 'var(--split-owe)', bg: 'var(--split-owe-bg)' }
    : spentPct > 85
      ? { label: 'Caution', color: '#EA580C', bg: 'rgba(234,88,12,0.10)' }
      : spentPct > 60
        ? { label: 'Healthy', color: '#0891B2', bg: 'rgba(8,145,178,0.10)' }
        : { label: 'Strong', color: 'var(--split-credit)', bg: 'var(--split-credit-bg)' };

  return (
    <div className="relative rounded-3xl overflow-hidden"
      style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
      {/* Atmospheric gradient mesh */}
      <div className="absolute inset-0 pointer-events-none" aria-hidden
        style={{
          background: isLow
            ? 'radial-gradient(ellipse at 0% 0%, rgba(239,68,68,0.08), transparent 55%), radial-gradient(ellipse at 100% 100%, rgba(239,68,68,0.05), transparent 50%)'
            : 'radial-gradient(ellipse at 0% 0%, color-mix(in srgb, var(--cricket) 10%, transparent), transparent 55%), radial-gradient(ellipse at 100% 100%, color-mix(in srgb, var(--cricket) 5%, transparent), transparent 50%)',
        }} />

      <div className="relative p-5 sm:p-7">
        {/* Status pill — small, inline, pulses softly when alarming */}
        <div className="flex items-center gap-2 mb-3">
          <Text as="span" size="2xs" weight="bold" color="muted" uppercase tracking="wider">
            {isLow ? 'Pool Shortfall' : 'Pool Balance'}
          </Text>
          <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5"
            style={{ background: status.bg, border: `1px solid ${status.color}30` }}>
            <span className="h-1.5 w-1.5 rounded-full" style={{
              background: status.color,
              boxShadow: `0 0 6px ${status.color}`,
              animation: isLow || spentPct > 85 ? 'pulse 1.6s ease-in-out infinite' : 'none',
            }} />
            <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: status.color }}>
              {status.label}
            </span>
          </span>
        </div>

        {/* The focal point — one big confident number */}
        <div className="flex items-baseline gap-2.5 mb-1">
          <span className="font-bold leading-[0.95] tracking-tight tabular-nums"
            style={{
              fontSize: 'clamp(40px, 7vw, 56px)',
              color: isLow ? 'var(--split-owe)' : 'var(--text)',
              fontFeatureSettings: '"tnum"',
            }}>
            {isLow ? '−' : ''}{formatCurrency(Math.abs(poolBalance))}
          </span>
        </div>
        {totalCollected > 0 && (
          <Text as="p" size="xs" color="muted" className="mb-5">
            <Text as="span" weight="semibold" tabular>{formatCurrency(remaining)}</Text>
            {' '}of{' '}
            <Text as="span" tabular>{formatCurrency(totalCollected)}</Text>
            {' '}collected
          </Text>
        )}

        {/* Integrated bar — replaces the standalone gauge entirely */}
        {totalCollected > 0 && (
          <div className="mb-5">
            <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'var(--surface)' }}>
              <div className="absolute inset-y-0 left-0 rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${spentPct}%`,
                  background: spentPct > 90
                    ? 'linear-gradient(90deg, #F97316, #DC2626)'
                    : spentPct > 70
                      ? 'linear-gradient(90deg, var(--cricket), #F59E0B)'
                      : 'linear-gradient(90deg, var(--cricket), var(--cricket-accent))',
                  boxShadow: `0 0 10px ${spentPct > 90 ? 'rgba(239,68,68,0.5)' : 'color-mix(in srgb, var(--cricket) 50%, transparent)'}`,
                }} />
            </div>
            <div className="flex items-center justify-between mt-1.5">
              <Text size="2xs" color="dim" tabular>{Math.round(spentPct)}% spent</Text>
              <Text size="2xs" color="dim">·</Text>
              <Text size="2xs" color="dim" tabular>{formatCurrency(remaining)} left</Text>
            </div>
          </div>
        )}

        {/* Stat strip — internal dividers, no individual cards */}
        <div className="grid grid-cols-3 rounded-xl overflow-hidden"
          style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
          {([
            { icon: TrendingUp, label: 'Fees', value: totalFees, color: 'var(--split-credit)' },
            { icon: Heart, label: 'Sponsors', value: totalSponsorship, color: '#2563EB' },
            { icon: ArrowDownRight, label: 'Spent', value: totalSpent, color: 'var(--cricket)' },
          ] as const).map(({ icon: Icon, label, value, color }, i) => (
            <div key={label}
              className="px-3 py-3 sm:py-3.5"
              style={{ borderLeft: i > 0 ? '1px solid var(--border)' : 'none' }}>
              <div className="flex items-center gap-1.5 mb-1">
                <Icon size={11} style={{ color }} />
                <Text size="2xs" weight="bold" uppercase tracking="wider" style={{ color }}>{label}</Text>
              </div>
              <Text size="md" weight="bold" tabular className="leading-none">
                {formatCurrency(value)}
              </Text>
            </div>
          ))}
        </div>

        {/* Shortfall alert — only when truly negative */}
        {isLow && hasPlayers && (
          <div className="mt-4 rounded-xl px-3.5 py-3 flex items-center gap-3"
            style={{ background: 'var(--split-owe-bg)', border: '1px solid var(--split-owe-border)' }}>
            <div className="h-8 w-8 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'var(--split-owe)', boxShadow: '0 0 12px var(--split-owe)' }}>
              <ArrowDownRight size={15} className="text-white" />
            </div>
            <div className="min-w-0">
              <Text as="p" size="xs" weight="semibold">
                Collect <Text as="span" weight="bold" style={{ color: 'var(--split-owe)' }}>{formatCurrency(perPerson)}</Text> per player
              </Text>
              <Text as="p" size="2xs" color="muted">to cover the shortfall</Text>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Category Filter Chips ── */
function CategoryFilters({ active, onChange, expenses }: {
  active: string; onChange: (key: string) => void; expenses: CricketExpense[];
}) {
  const counts = new Map<string, number>();
  for (const e of expenses) counts.set(e.category, (counts.get(e.category) || 0) + 1);

  return (
    <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
      <button
        onClick={() => onChange('')}
        className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-all active:scale-95"
        style={{
          background: !active ? 'color-mix(in srgb, var(--cricket) 15%, transparent)' : 'transparent',
          color: !active ? 'var(--cricket)' : 'var(--muted)',
          border: `1px solid ${!active ? 'color-mix(in srgb, var(--cricket) 30%, transparent)' : 'var(--border)'}`,
        }}
      >
        All <Text size="2xs" weight="bold" tabular className="opacity-60">{expenses.length}</Text>
      </button>
      {EXPENSE_CATEGORIES.map((cat) => {
        const count = counts.get(cat.key) || 0;
        if (count === 0) return null;
        const isActive = active === cat.key;
        const Icon = CATEGORY_ICONS[cat.iconName];
        return (
          <button
            key={cat.key}
            onClick={() => onChange(isActive ? '' : cat.key)}
            className="flex-shrink-0 flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12px] font-semibold cursor-pointer transition-all active:scale-95"
            style={{
              background: isActive ? `${cat.color}18` : 'transparent',
              color: isActive ? cat.color : 'var(--muted)',
              border: `1px solid ${isActive ? `${cat.color}35` : 'var(--border)'}`,
            }}
          >
            {Icon && <Icon size={13} style={{ color: isActive ? cat.color : 'var(--dim)' }} />}
            {cat.label}
            <Text size="2xs" weight="bold" tabular className="opacity-60">{count}</Text>
          </button>
        );
      })}
    </div>
  );
}

/* ── Transaction Row — denser, category icon avatar, inline receipt chips ── */
function ExpenseRow({
  expense, config, totalSpent, isAdmin, isLast,
  onEdit, onDetails, onDelete,
}: {
  expense: CricketExpense; config: CategoryConfig; totalSpent: number; isAdmin: boolean; isLast: boolean;
  onEdit: () => void; onDetails: () => void; onDelete: () => void;
}) {
  const [openMenu, setOpenMenu] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const hasReceipts = expense.receipt_urls && expense.receipt_urls.length > 0;
  const pctOfTotal = totalSpent > 0 ? (Number(expense.amount) / totalSpent) * 100 : 0;
  const Icon = CATEGORY_ICONS[config.iconName];

  return (
    <div>
      <div className="group relative flex items-start sm:items-center gap-3 px-3 sm:px-4 py-3 transition-colors hover:bg-[var(--hover-bg)]">
        {/* Category icon — colored badge instead of dot */}
        <div className="h-10 w-10 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5 sm:mt-0"
          style={{ background: `${config.color}15`, border: `1px solid ${config.color}25` }}
          title={config.label}
        >
          {Icon && <Icon size={18} style={{ color: config.color }} />}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-3 mb-0.5">
            <Text as="p" size="sm" weight="semibold" truncate className="flex-1 min-w-0 leading-snug">
              {expense.description || config.label}
            </Text>
            <Text size="md" weight="bold" tabular className="flex-shrink-0 leading-snug">
              {formatCurrency(Number(expense.amount))}
            </Text>
          </div>

          {/* Metadata row — category, date, percentage, receipts ALL inline */}
          <div className="flex items-center gap-1.5 flex-wrap">
            <Text size="2xs" weight="semibold" style={{ color: config.color }}>
              {config.label}
            </Text>
            <Text size="2xs" color="dim">·</Text>
            <Text size="2xs" color="muted">{formatDate(expense.expense_date)}</Text>

            {pctOfTotal >= 10 && (
              <>
                <Text size="2xs" color="dim">·</Text>
                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
                  style={{
                    background: pctOfTotal >= 25 ? `${config.color}15` : 'transparent',
                    color: pctOfTotal >= 25 ? config.color : 'var(--dim)',
                  }}
                  title={`${Math.round(pctOfTotal)}% of total spend`}
                >
                  {Math.round(pctOfTotal)}%
                </span>
              </>
            )}

            {hasReceipts && expense.receipt_urls!.map((url, i) => {
              const pdf = isUrlPdf(url);
              return (
                <button
                  key={i}
                  onClick={(e) => { e.stopPropagation(); window.open(url, '_blank', 'noopener,noreferrer'); }}
                  className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 cursor-pointer hover:bg-[var(--surface)] transition-colors"
                  style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}
                  title={`Receipt ${i + 1}${pdf ? '.pdf' : '.jpg'}`}
                >
                  {pdf
                    ? <FileText size={10} style={{ color: '#EF4444' }} />
                    : <Receipt size={10} style={{ color: 'var(--cricket)' }} />}
                  <Text size="2xs" weight="medium" className="leading-none">
                    {expense.receipt_urls!.length > 1 ? `${i + 1}` : 'Receipt'}
                  </Text>
                  <ExternalLink size={8} className="text-[var(--dim)]" />
                </button>
              );
            })}
          </div>
        </div>

        {/* Menu — h-9 w-9 hit area */}
        {isAdmin && (
          <div className="flex-shrink-0 self-center">
            <button
              ref={openMenu ? menuBtnRef : null}
              onClick={() => setOpenMenu(!openMenu)}
              className="h-9 w-9 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--surface)] hover:text-[var(--text)] transition-colors"
              aria-label="Expense actions"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <circle cx="12" cy="5" r="1" /><circle cx="12" cy="12" r="1" /><circle cx="12" cy="19" r="1" />
              </svg>
            </button>
            {openMenu && (
              <CardMenu
                anchorRef={menuBtnRef}
                onClose={() => setOpenMenu(false)}
                items={[
                  { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: onEdit },
                  { label: 'Details', icon: <Info size={15} />, color: 'var(--muted)', onClick: onDetails },
                  { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: onDelete, dividerBefore: true },
                ]}
              />
            )}
          </div>
        )}
      </div>
      {!isLast && <div className="mx-3 sm:mx-4" style={{ height: '1px', background: 'color-mix(in srgb, var(--border) 50%, transparent)' }} />}
    </div>
  );
}

/* ── Deleted Expense Row ── */
function DeletedExpenseRow({
  expense, config, onRestore, onPermanentDelete,
}: {
  expense: CricketExpense; config: CategoryConfig;
  onRestore: () => void; onPermanentDelete: () => void;
}) {
  return (
    <div className="rounded-xl p-3 opacity-70" style={{ background: 'var(--surface)', borderLeft: `3px solid ${config.color}` }}>
      <div className="flex items-baseline justify-between gap-2 mb-1">
        <Text as="p" size="sm" weight="semibold" truncate className="flex-1 min-w-0 line-through decoration-[var(--muted)]/40">
          {expense.description || config.label}
        </Text>
        <Text size="sm" weight="bold" tabular className="flex-shrink-0 line-through decoration-[var(--muted)]/40">
          {formatCurrency(Number(expense.amount))}
        </Text>
      </div>
      <Text as="p" size="2xs" color="muted" className="mb-2.5">
        {formatDate(expense.expense_date)}
        {expense.deleted_by && <> · deleted by <Text weight="semibold">{expense.deleted_by}</Text></>}
      </Text>
      <div className="flex gap-2">
        <button
          onClick={onRestore}
          className="flex-1 rounded-lg py-2 text-[12px] font-semibold cursor-pointer active:scale-[0.98] transition-all text-center"
          style={{ background: '#05966910', color: '#059669', border: '1px solid #05966925' }}
        >
          Restore
        </button>
        <button
          onClick={onPermanentDelete}
          className="rounded-lg px-4 py-2 text-[12px] font-semibold cursor-pointer active:scale-[0.98] transition-all flex items-center justify-center"
          style={{ background: '#EF444410', color: '#EF4444', border: '1px solid #EF444425' }}
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ── Edit Expense Drawer ── */
function EditExpenseDrawer({ expense, open, onSave, onClose }: {
  expense: CricketExpense | null;
  open: boolean;
  onSave: (updates: { category: string; description: string; amount: number; expense_date: string; receipt_urls?: string[] | null }, newReceiptFiles?: Blob[]) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<string>('ground');
  const [desc, setDesc] = useState('');
  const [amt, setAmt] = useState('');
  const [date, setDate] = useState('');
  const [existingUrls, setExistingUrls] = useState<string[]>([]);
  const [newFiles, setNewFiles] = useState<{ preview: string; compressed: Blob | null; isPdf: boolean; fileName: string }[]>([]);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Sync form state when expense changes (drawer opens with new expense)
  useEffect(() => {
    if (expense) {
      setCat(expense.category);
      setDesc(expense.description);
      setAmt(String(expense.amount));
      setDate(expense.expense_date);
      setExistingUrls(expense.receipt_urls ?? []);
      setNewFiles([]);
    }
  }, [expense]);

  const handleFiles = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && file.type !== 'application/pdf') {
        toast.error(`${file.name}: only images and PDFs are supported.`);
        continue;
      }
      const filePdf = file.type === 'application/pdf';
      const preview = filePdf ? '' : URL.createObjectURL(file);
      if (filePdf) {
        setNewFiles((prev) => [...prev, { preview, compressed: file, isPdf: true, fileName: file.name }]);
      } else {
        setNewFiles((prev) => [...prev, { preview, compressed: null, isPdf: false, fileName: file.name }]);
        setCompressing(true);
        try {
          const compressed = await compressReceiptImage(file);
          setNewFiles((prev) => prev.map((f) => f.preview === preview ? { ...f, compressed } : f));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to compress ${file.name}`);
          setNewFiles((prev) => prev.filter((f) => f.preview !== preview));
        } finally {
          setCompressing(false);
        }
      }
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const [pendingRemove, setPendingRemove] = useState<{ type: 'existing' | 'new'; index: number } | null>(null);

  const confirmRemove = () => {
    if (!pendingRemove) return;
    if (pendingRemove.type === 'existing') {
      setExistingUrls((prev) => prev.filter((_, i) => i !== pendingRemove.index));
    } else {
      URL.revokeObjectURL(newFiles[pendingRemove.index].preview);
      setNewFiles((prev) => prev.filter((_, i) => i !== pendingRemove.index));
    }
    setPendingRemove(null);
  };

  const handleSubmit = () => {
    const blobs = newFiles.map((f) => f.compressed).filter(Boolean) as Blob[];
    onSave(
      { category: cat, description: desc, amount: parseFloat(amt), expense_date: date, receipt_urls: existingUrls.length > 0 ? existingUrls : null },
      blobs.length > 0 ? blobs : undefined,
    );
  };

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerHandle />
      <DrawerTitle>Edit Expense</DrawerTitle>
      <DrawerHeader>
        <div className="flex items-center gap-3">
          <CategoryAvatar config={getCategoryConfig(cat)} />
          <div>
            <Text as="p" size="lg" weight="bold">Edit Expense</Text>
            <Text as="p" size="2xs" color="muted">Update details and receipts</Text>
          </div>
        </div>
      </DrawerHeader>
      <DrawerBody>
        {/* Category */}
        <div>
          <Label uppercase className="mb-2 block">Category</Label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = cat === c.key;
              const Icon = CATEGORY_ICONS[c.iconName];
              return (
                <button key={c.key} onClick={() => setCat(c.key)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 cursor-pointer transition-all border-2 active:scale-95"
                  style={{
                    backgroundColor: active ? `${c.color}15` : 'var(--surface)',
                    borderColor: active ? c.color : 'var(--border)',
                    boxShadow: active ? `0 2px 12px ${c.color}20` : 'none',
                  }}>
                  {Icon && <Icon size={20} style={{ color: active ? c.color : 'var(--muted)' }} />}
                  <span className="text-[11px] font-bold" style={{ color: active ? c.color : 'var(--muted)' }}>{c.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <Label uppercase className="mb-1.5 block">Description</Label>
          <input value={desc} onChange={(e) => setDesc(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
            placeholder="Ground booking, balls, etc." />
        </div>

        {/* Amount + Date */}
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div>
            <Label uppercase className="mb-1.5 block">Amount ($)</Label>
            <input type="text" inputMode="decimal" pattern="[0-9]*\.?[0-9]*" value={amt} onChange={(e) => setAmt(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
              placeholder="0.00" />
          </div>
          <div>
            <Label uppercase className="mb-1.5 block">Date</Label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors" />
          </div>
        </div>

        {/* Receipts */}
        <div>
          <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" aria-label="Select receipt images or PDFs" onChange={handleFiles} />

          {(existingUrls.length > 0 || newFiles.length > 0) && (
            <div className="flex flex-wrap gap-2 mb-2">
              {existingUrls.map((url, i) => (
                <div key={`existing-${i}`} className="relative">
                  {isUrlPdf(url) ? (
                    <div className="h-20 w-20 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col items-center justify-center gap-1 px-1">
                      <FileText size={22} className="text-red-500" />
                      <span className="text-[9px] font-bold text-[var(--muted)] text-center leading-tight">Receipt {i + 1}.pdf</span>
                    </div>
                  ) : (
                    <img src={url} alt={`Receipt ${i + 1}`} className="h-20 w-20 rounded-xl object-cover border border-[var(--border)]"
                      onError={(ev) => { ev.currentTarget.style.opacity = '0.3'; }} />
                  )}
                  <button onClick={() => setPendingRemove({ type: 'existing', index: i })}
                    aria-label={`Remove receipt ${i + 1}`}
                    className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90">
                    <span className="h-6 w-6 rounded-full bg-black/70 flex items-center justify-center">
                      <X size={12} className="text-white" />
                    </span>
                  </button>
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={`new-${i}`} className="relative animate-fade-in">
                  {f.isPdf ? (
                    <div className="h-20 w-20 rounded-xl border-2 border-dashed border-[var(--cricket)] bg-[var(--surface)] flex flex-col items-center justify-center gap-1 px-1">
                      <FileText size={22} className="text-red-500" />
                      <span className="text-[9px] font-bold text-[var(--muted)] text-center leading-tight truncate w-full">
                        {f.fileName.length > 14 ? f.fileName.slice(0, 12) + '…' : f.fileName}
                      </span>
                    </div>
                  ) : (
                    <img src={f.preview} alt={`New receipt ${i + 1}`} className="h-20 w-20 rounded-xl object-cover border-2 border-dashed border-[var(--cricket)]" />
                  )}
                  <button onClick={() => setPendingRemove({ type: 'new', index: i })}
                    aria-label={`Remove new receipt ${i + 1}`}
                    className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90">
                    <span className="h-6 w-6 rounded-full bg-black/70 flex items-center justify-center">
                      <X size={12} className="text-white" />
                    </span>
                  </button>
                  {!f.compressed && (
                    <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center"><Spinner size="sm" /></div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Inline remove confirmation */}
          {pendingRemove && (
            <div className="rounded-xl p-3 mb-2 space-y-2.5"
              style={{ background: '#EF44440A', border: '1px solid #EF444425' }}>
              <div className="flex items-center gap-2">
                <div className="h-7 w-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#EF444415' }}>
                  <Trash2 size={14} style={{ color: '#EF4444' }} />
                </div>
                <Text size="sm" weight="medium">Remove <Text weight="bold">Receipt {pendingRemove.index + 1}</Text>?</Text>
              </div>
              <div className="flex gap-2">
                <button onClick={() => setPendingRemove(null)}
                  className="flex-1 rounded-lg py-2 text-[12px] font-medium text-[var(--muted)] border border-[var(--border)] cursor-pointer active:scale-95">
                  Cancel
                </button>
                <button onClick={confirmRemove}
                  className="flex-1 rounded-lg py-2 text-[12px] font-bold text-white cursor-pointer active:scale-95"
                  style={{ background: '#EF4444' }}>
                  Remove
                </button>
              </div>
            </div>
          )}

          <button onClick={() => fileRef.current?.click()} disabled={compressing}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 min-h-[48px] border-2 border-dashed cursor-pointer active:scale-[0.98] transition-all hover:border-[var(--cricket)] hover:bg-[var(--hover-bg)]"
            style={{ borderColor: 'color-mix(in srgb, var(--cricket) 40%, var(--border))', background: 'color-mix(in srgb, var(--cricket) 4%, transparent)' }}>
            {compressing ? (
              <><Spinner size="sm" /><span className="text-[13px] font-medium text-[var(--muted)]">Compressing...</span></>
            ) : (
              <><Camera size={18} style={{ color: 'var(--cricket)' }} /><span className="text-[13px] font-semibold" style={{ color: 'var(--cricket)' }}>{existingUrls.length + newFiles.length > 0 ? 'Add more receipts' : 'Attach receipts or invoices'}</span></>
            )}
          </button>
        </div>

        {/* Save */}
        <Button onClick={handleSubmit} variant="primary" brand="cricket" size="lg" fullWidth disabled={!amt || compressing}>
          {compressing ? 'Compressing...' : 'Save Changes'}
        </Button>
      </DrawerBody>
    </Drawer>
  );
}

/* ═══════════════════════════════════════════════════
   Main Expense List
   ═══════════════════════════════════════════════════ */
export default function ExpenseList() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { expenses, fees, sponsorships, players, selectedSeasonId, deleteExpense, permanentDeleteExpense, restoreExpense, updateExpense, setShowExpenseForm } = useCricketStore();

  const [deletingExpense, setDeletingExpense] = useState<{ id: string; desc: string; permanent?: boolean } | null>(null);
  const [editingExpense, setEditingExpense] = useState<CricketExpense | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const [showDeleted, setShowDeleted] = useState(false);

  const allSeasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const seasonExpenses = allSeasonExpenses.filter((e) => !e.deleted_at);
  const deletedExpenses = allSeasonExpenses.filter((e) => e.deleted_at);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const activePlayers = players.filter((p) => p.is_active && !p.is_guest);

  const seasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId && !s.deleted_at);
  const totalFees = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0);
  const totalSponsorship = seasonSponsors.reduce((sum, s) => sum + Number(s.amount), 0);
  const totalCollected = totalFees + totalSponsorship;
  const totalSpent = seasonExpenses.reduce((sum, e) => sum + Number(e.amount), 0);
  const poolBalance = totalCollected - totalSpent;
  const isLow = poolBalance < 0;
  const perPerson = activePlayers.length > 0 ? Math.ceil(Math.abs(poolBalance) / activePlayers.length) : 0;

  const currentUserName = (user?.user_metadata?.full_name as string) || user?.email || '';

  const filteredExpenses = categoryFilter
    ? seasonExpenses.filter((e) => e.category === categoryFilter)
    : seasonExpenses;

  // Group filtered expenses by month — newest first within each group
  const groupedExpenses = useMemo(() => {
    const groups: { key: string; label: string; total: number; expenses: typeof filteredExpenses }[] = [];
    const sorted = [...filteredExpenses].sort((a, b) => b.expense_date.localeCompare(a.expense_date));
    for (const e of sorted) {
      const date = new Date(e.expense_date);
      const key = `${date.getFullYear()}-${String(date.getMonth()).padStart(2, '0')}`;
      const label = date.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      let group = groups.find((g) => g.key === key);
      if (!group) { group = { key, label, total: 0, expenses: [] }; groups.push(group); }
      group.expenses.push(e);
      group.total += Number(e.amount);
    }
    return groups;
  }, [filteredExpenses]);

  const handleEditSave = async (
    expenseId: string,
    updates: { category: string; description: string; amount: number; expense_date: string; receipt_urls?: string[] | null },
    newReceiptFiles?: Blob[],
  ) => {
    const teamId = useAuthStore.getState().currentTeamId;

    if (newReceiptFiles?.length && isCloudMode() && teamId) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const existingUrls = updates.receipt_urls ?? [];
        const uploadedUrls: string[] = [...existingUrls];

        for (let i = 0; i < newReceiptFiles.length; i++) {
          const blob = newReceiptFiles[i];
          const blobIsPdf = blob.type === 'application/pdf';
          const ext = blobIsPdf ? 'pdf' : 'jpg';
          const contentType = blobIsPdf ? 'application/pdf' : 'image/jpeg';
          const fileId = crypto.randomUUID().slice(0, 8);
          const path = `${teamId}/${expenseId}_${fileId}.${ext}`;
          const { error } = await supabase.storage.from('expense-receipts').upload(path, blob, { upsert: true, contentType });
          if (!error) {
            uploadedUrls.push(`/storage/expense-receipts/${path}`);
          } else {
            console.error('[cricket] receipt upload:', error);
          }
        }
        updates.receipt_urls = uploadedUrls.length > 0 ? uploadedUrls : null;
      }
    }

    updateExpense(expenseId, updates as Partial<CricketExpense>, currentUserName);
  };

  return (
    <div className="space-y-4">
      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div
            className="h-8 w-8 rounded-lg flex items-center justify-center"
            style={{ background: 'color-mix(in srgb, var(--cricket) 15%, transparent)' }}
          >
            <ReceiptText size={16} style={{ color: 'var(--cricket)' }} />
          </div>
          <Text as="h3" size="lg" weight="bold">Expenses</Text>
          <Text size="sm" color="muted" weight="normal">({seasonExpenses.length})</Text>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            {activePlayers.length === 0 && (
              <Text size="2xs" color="muted">Add players first</Text>
            )}
            <Button
              onClick={() => setShowExpenseForm(true)}
              disabled={activePlayers.length === 0}
              variant="primary"
              brand="cricket"
              size="sm"
              className="gap-1.5"
            >
              <Plus size={15} />
              Add Expense
            </Button>
          </div>
        )}
      </div>

      {/* ── Hero + List: side-by-side at lg, stacked below ── */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:gap-6 lg:items-start lg:space-y-0 space-y-4">
        {/* LEFT: Hero (sticky on desktop) */}
        {totalCollected > 0 && (
          <div className="lg:sticky lg:top-20">
            <PoolFundHero
              totalFees={totalFees}
              totalSponsorship={totalSponsorship}
              totalSpent={totalSpent}
              poolBalance={poolBalance}
              isLow={isLow}
              perPerson={perPerson}
              hasPlayers={activePlayers.length > 0}
            />
          </div>
        )}

        {/* RIGHT: Filters + grouped expense list */}
        <div className="space-y-4">
          {seasonExpenses.length > 1 && (
            <CategoryFilters
              active={categoryFilter}
              onChange={setCategoryFilter}
              expenses={seasonExpenses}
            />
          )}

          {seasonExpenses.length === 0 ? (
            <EmptyState
              icon={<ReceiptText size={36} style={{ color: 'var(--cricket)' }} />}
              title="No expenses yet"
              description="Track team spending by adding your first expense"
              brand="cricket"
              action={isAdmin ? { label: 'Add Expense', onClick: () => setShowExpenseForm(true) } : undefined}
            />
          ) : (
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'var(--card)',
                border: '1px solid var(--border)',
                boxShadow: 'inset 0 1px 0 0 var(--inner-glow)',
              }}
            >
              {groupedExpenses.map((group, gIdx) => (
                <div key={group.key}>
                  {/* Month header — subtotal on the right */}
                  <div className="flex items-center gap-2 px-3 sm:px-4 py-2.5"
                    style={{
                      background: 'color-mix(in srgb, var(--surface) 60%, transparent)',
                      borderTop: gIdx > 0 ? '1px solid var(--border)' : 'none',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
                    }}>
                    <Text size="2xs" weight="bold" color="muted" uppercase tracking="wider">{group.label}</Text>
                    <Text size="2xs" color="dim">·</Text>
                    <Text size="2xs" color="dim">{group.expenses.length} {group.expenses.length === 1 ? 'expense' : 'expenses'}</Text>
                    <Text size="2xs" weight="bold" tabular color="muted" className="ml-auto">
                      {formatCurrency(group.total)}
                    </Text>
                  </div>
                  {group.expenses.map((e, i) => {
                    const cfg = getCategoryConfig(e.category);
                    return (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        config={cfg}
                        totalSpent={totalSpent}
                        isAdmin={isAdmin}
                        isLast={i === group.expenses.length - 1}
                        onEdit={() => setEditingExpense(e)}
                        onDetails={() => {
                          const parts: string[] = [];
                          if (e.created_by) parts.push(`Added by ${e.created_by} on ${formatDate(e.created_at?.split('T')[0] || e.expense_date)}`);
                          if (e.updated_by && e.updated_at !== e.created_at) parts.push(`Updated by ${e.updated_by} on ${formatDate(e.updated_at.split('T')[0])}`);
                          toast(parts.join('\n') || 'No details', { duration: 4000 });
                        }}
                        onDelete={() => setDeletingExpense({ id: e.id, desc: e.description || cfg.label })}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ── Recently Deleted ── */}
      {isAdmin && deletedExpenses.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--red) 20%, var(--border))' }}>
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <Text size="sm" weight="semibold" color="danger">Deleted</Text>
              <Badge variant="red" size="sm">{deletedExpenses.length}</Badge>
            </div>
            <ChevronDown
              size={16}
              className="transition-transform duration-200"
              style={{ color: 'var(--muted)', transform: showDeleted ? 'rotate(180deg)' : 'rotate(0deg)' }}
            />
          </button>
          {showDeleted && (
            <div className="px-3 pb-3 space-y-2">
              {deletedExpenses.map((e) => {
                const cfg = getCategoryConfig(e.category);
                return (
                  <DeletedExpenseRow
                    key={e.id}
                    expense={e}
                    config={cfg}
                    onRestore={() => restoreExpense(e.id)}
                    onPermanentDelete={() => setDeletingExpense({ id: e.id, desc: e.description || cfg.label, permanent: true })}
                  />
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ── Edit drawer ── */}
      <EditExpenseDrawer
        expense={editingExpense}
        open={!!editingExpense}
        onSave={(updates, newFiles) => {
          if (editingExpense) handleEditSave(editingExpense.id, updates, newFiles);
          setEditingExpense(null);
        }}
        onClose={() => setEditingExpense(null)}
      />

      {/* ── Delete confirmation ── */}
      {deletingExpense && (
        <DeleteConfirm
          description={deletingExpense.desc}
          permanent={deletingExpense.permanent}
          onConfirm={() => {
            if (deletingExpense.permanent) {
              permanentDeleteExpense(deletingExpense.id);
            } else {
              deleteExpense(deletingExpense.id, currentUserName);
            }
            setDeletingExpense(null);
          }}
          onCancel={() => setDeletingExpense(null)}
        />
      )}
    </div>
  );
}
