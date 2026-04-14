'use client';

import { useState, useEffect, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';
import { Shirt, Trophy, Utensils, Package } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  FaTshirt: Shirt, MdSportsCricket, FaTrophy: Trophy, FaUtensils: Utensils, FaBox: Package,
};
import { formatCurrency, formatDate } from '../lib/utils';
import { EmptyState, FilterDropdown, Text, CardMenu, Spinner } from '@/components/ui';
import { TriangleAlert, CircleCheck, Wallet, EllipsisVertical, Pencil, Trash2, ChevronDown, Camera, X, Receipt, ExternalLink, FileText } from 'lucide-react';
import { createPortal } from 'react-dom';
import { getSupabaseClient, isCloudMode } from '@/lib/supabase/client';
import { compressReceiptImage } from '../lib/image';
import { toast } from 'sonner';

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

/* ── Inline Edit Form with Receipt Upload ── */
function InlineEditForm({ expense, onSave, onCancel }: {
  expense: { id: string; category: string; description: string; amount: number; expense_date: string; receipt_urls: string[] | null };
  onSave: (updates: { category: string; description: string; amount: number; expense_date: string; receipt_urls?: string[] | null }, newReceiptFiles?: Blob[]) => void;
  onCancel: () => void;
}) {
  const [cat, setCat] = useState(expense.category);
  const [desc, setDesc] = useState(expense.description);
  const [amt, setAmt] = useState(String(expense.amount));
  const [date, setDate] = useState(expense.expense_date);
  const [existingUrls, setExistingUrls] = useState<string[]>(expense.receipt_urls ?? []);
  const [newFiles, setNewFiles] = useState<{ preview: string; compressed: Blob | null; isPdf: boolean }[]>([]);
  const [compressing, setCompressing] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
        setNewFiles((prev) => [...prev, { preview, compressed: file, isPdf: true }]);
      } else {
        setNewFiles((prev) => [...prev, { preview, compressed: null, isPdf: false }]);
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

  const removeExisting = (index: number) => setExistingUrls((prev) => prev.filter((_, i) => i !== index));
  const removeNew = (index: number) => {
    setNewFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  useEffect(() => {
    return () => { newFiles.forEach((f) => URL.revokeObjectURL(f.preview)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-3">
      {/* Category chips */}
      <div className="flex flex-wrap gap-1.5">
        {EXPENSE_CATEGORIES.map((c) => {
          const active = cat === c.key;
          const Icon = CATEGORY_ICONS[c.iconName];
          return (
            <button key={c.key} onClick={() => setCat(c.key)}
              className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[11px] font-bold cursor-pointer border transition-all"
              style={{
                backgroundColor: active ? `${c.color}15` : 'transparent',
                borderColor: active ? c.color : 'var(--border)',
                color: active ? c.color : 'var(--muted)',
              }}>
              {Icon && <Icon size={12} />} {c.label}
            </button>
          );
        })}
      </div>
      <input value={desc} onChange={(e) => setDesc(e.target.value)}
        className="w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
        placeholder="Description" />
      <div className="flex gap-2">
        <input type="number" step="0.01" value={amt} onChange={(e) => setAmt(e.target.value)}
          className="flex-1 rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
          placeholder="Amount" />
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
          className="rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors" />
      </div>

      {/* Receipt management */}
      <div>
        <input ref={fileRef} type="file" accept="image/*,application/pdf" multiple className="hidden" aria-label="Select receipt images or PDFs" onChange={handleFiles} />

        {(existingUrls.length > 0 || newFiles.length > 0) && (
          <div className="flex flex-wrap gap-2 mb-2">
            {existingUrls.map((url, i) => (
              <div key={`existing-${i}`} className="relative">
                {isUrlPdf(url) ? (
                  <div className="h-16 w-16 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex flex-col items-center justify-center gap-0.5">
                    <FileText size={20} className="text-red-500" />
                    <span className="text-[8px] font-bold text-[var(--muted)] uppercase">PDF</span>
                  </div>
                ) : (
                  <img src={url} alt={`Receipt ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border border-[var(--border)]"
                    onError={(ev) => { ev.currentTarget.style.display = 'none'; }} />
                )}
                <button onClick={() => removeExisting(i)}
                  aria-label={`Remove receipt ${i + 1}`}
                  className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90">
                  <span className="h-5 w-5 rounded-full bg-black/70 flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </span>
                </button>
              </div>
            ))}
            {newFiles.map((f, i) => (
              <div key={`new-${i}`} className="relative">
                {f.isPdf ? (
                  <div className="h-16 w-16 rounded-lg border-2 border-dashed border-[var(--cricket)] bg-[var(--surface)] flex flex-col items-center justify-center gap-0.5">
                    <FileText size={20} className="text-red-500" />
                    <span className="text-[8px] font-bold text-[var(--muted)] uppercase">PDF</span>
                  </div>
                ) : (
                  <img src={f.preview} alt={`New receipt ${i + 1}`} className="h-16 w-16 rounded-lg object-cover border-2 border-dashed border-[var(--cricket)]" />
                )}
                <button onClick={() => removeNew(i)}
                  aria-label={`Remove new receipt ${i + 1}`}
                  className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90">
                  <span className="h-5 w-5 rounded-full bg-black/70 flex items-center justify-center">
                    <X size={10} className="text-white" />
                  </span>
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => fileRef.current?.click()} disabled={compressing}
          className="w-full flex items-center justify-center gap-2 rounded-lg py-2.5 min-h-[44px] border-2 border-dashed cursor-pointer active:scale-[0.98] transition-all"
          style={{ borderColor: 'color-mix(in srgb, var(--cricket) 40%, var(--border))', background: 'color-mix(in srgb, var(--cricket) 4%, transparent)' }}>
          {compressing ? (
            <>
              <Spinner size="sm" />
              <span className="text-[12px] font-medium text-[var(--muted)]">Compressing...</span>
            </>
          ) : (
            <>
              <Camera size={16} style={{ color: 'var(--cricket)' }} />
              <span className="text-[12px] font-semibold" style={{ color: 'var(--cricket)' }}>
                {existingUrls.length + newFiles.length > 0 ? 'Add more receipts' : 'Attach receipts or invoices'}
              </span>
            </>
          )}
        </button>
      </div>

      <div className="flex gap-2 justify-end">
        <button onClick={onCancel}
          className="rounded-lg px-3 py-1.5 text-[12px] font-medium text-[var(--muted)] border border-[var(--border)] cursor-pointer hover:bg-[var(--hover-bg)]">
          Cancel
        </button>
        <button onClick={() => {
          const blobs = newFiles.map((f) => f.compressed).filter(Boolean) as Blob[];
          onSave(
            { category: cat, description: desc, amount: parseFloat(amt), expense_date: date, receipt_urls: existingUrls.length > 0 ? existingUrls : null },
            blobs.length > 0 ? blobs : undefined,
          );
        }}
          disabled={!amt || compressing}
          className="rounded-lg px-3 py-1.5 text-[12px] font-bold text-white cursor-pointer disabled:opacity-40"
          style={{ background: 'linear-gradient(135deg, var(--cricket-accent), var(--cricket))' }}>
          {compressing ? 'Compressing...' : 'Save'}
        </button>
      </div>
    </div>
  );
}

export default function ExpenseList() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { expenses, fees, sponsorships, players, selectedSeasonId, deleteExpense, permanentDeleteExpense, restoreExpense, updateExpense, setShowExpenseForm } = useCricketStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; desc: string; permanent?: boolean } | null>(null);
  const [editingExpense, setEditingExpense] = useState<string | null>(null);
  const [expandedExpense, setExpandedExpense] = useState<string | null>(null);
  const [categoryFilter, setCategoryFilter] = useState('');
  const menuBtnRef = useRef<HTMLButtonElement>(null);

  const allSeasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const seasonExpenses = allSeasonExpenses.filter((e) => !e.deleted_at);
  const deletedExpenses = allSeasonExpenses.filter((e) => e.deleted_at);
  const [showDeleted, setShowDeleted] = useState(false);
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
        const startIndex = existingUrls.length;
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

    updateExpense(expenseId, updates as Partial<import('@/types/cricket').CricketExpense>, currentUserName);
    setEditingExpense(null);
  };

  return (
    <div className="space-y-4">
      {/* Pool Fund Balance */}
      {(() => {
        const balanceColor = isLow ? '#EF4444' : poolBalance > 0 ? '#059669' : 'var(--muted)';
        const spentPct = totalCollected > 0 ? Math.min((totalSpent / totalCollected) * 100, 100) : 0;
        const feesPct = totalCollected > 0 ? (totalFees / totalCollected) * 100 : 0;

        return (
          <div className="rounded-2xl border bg-[var(--card)] p-3 sm:p-5 min-w-0 overflow-hidden"
            style={{ borderColor: `${balanceColor}40` }}>

            {/* Hero: Balance */}
            <div className="flex items-start justify-between gap-3 mb-4">
              <div>
                <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="mb-1">Pool Balance</Text>
                <Text as="p" size="2xl" weight="bold" tabular tracking="tight" className="sm:text-[40px] leading-none" style={{ color: balanceColor }}>
                  {isLow ? '-' : ''}{formatCurrency(Math.abs(poolBalance))}
                </Text>
              </div>
              <div className="flex-shrink-0 h-12 w-12 rounded-2xl flex items-center justify-center"
                style={{ backgroundColor: `${balanceColor}12`, border: `2px solid ${balanceColor}25` }}>
                <Wallet size={20} style={{ color: balanceColor }} />
              </div>
            </div>

            {/* Money in / out breakdown */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
              <div className="rounded-xl p-2.5 sm:p-3" style={{ background: '#05966910' }}>
                <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px] mb-0.5">Fees</Text>
                <Text as="p" size="lg" weight="bold" tabular className="sm:text-[18px]" style={{ color: '#059669' }}>{formatCurrency(totalFees)}</Text>
              </div>
              {totalSponsorship > 0 ? (
                <div className="rounded-xl p-2.5 sm:p-3" style={{ background: 'color-mix(in srgb, var(--cricket) 6%, transparent)' }}>
                  <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px] mb-0.5">Sponsors</Text>
                  <Text as="p" size="lg" weight="bold" tabular className="sm:text-[18px]" style={{ color: 'var(--cricket-accent)' }}>{formatCurrency(totalSponsorship)}</Text>
                </div>
              ) : (
                <div className="rounded-xl p-2.5 sm:p-3" style={{ background: '#3B82F610' }}>
                  <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px] mb-0.5">Collected</Text>
                  <Text as="p" size="lg" weight="bold" tabular className="sm:text-[18px]" style={{ color: '#3B82F6' }}>{formatCurrency(totalCollected)}</Text>
                </div>
              )}
              <div className="rounded-xl p-2.5 sm:p-3" style={{ background: '#EF444410' }}>
                <Text as="p" size="2xs" weight="bold" color="muted" uppercase tracking="wider" className="text-[10px] mb-0.5">Spent</Text>
                <Text as="p" size="lg" weight="bold" tabular className="sm:text-[18px]" style={{ color: '#EF4444' }}>{formatCurrency(totalSpent)}</Text>
              </div>
            </div>

            {/* Ratio bar: collected vs spent */}
            {totalCollected > 0 && (
              <div className="mb-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted)]">
                    {totalSponsorship > 0 ? 'Fees + Sponsors' : 'Collected'} vs Spent
                  </span>
                  <span className="text-[11px] font-extrabold tabular-nums" style={{ color: balanceColor }}>
                    {Math.round(spentPct)}% used
                  </span>
                </div>
                <div className="relative h-3 rounded-full overflow-hidden flex" style={{ background: 'var(--border)' }}>
                  <div className="h-full transition-all duration-700" style={{ width: `${feesPct}%`, background: 'linear-gradient(90deg, #059669, #10B981)' }} />
                  {totalSponsorship > 0 && (
                    <div className="h-full transition-all duration-700" style={{ width: `${100 - feesPct}%`, background: 'linear-gradient(90deg, var(--cricket-accent), var(--cricket))' }} />
                  )}
                  <div className="absolute inset-y-0 left-0 rounded-full transition-all duration-700 pointer-events-none"
                    style={{
                      width: `${spentPct}%`,
                      background: 'repeating-linear-gradient(135deg, transparent, transparent 3px, rgba(0,0,0,0.08) 3px, rgba(0,0,0,0.08) 6px)',
                    }} />
                </div>
              </div>
            )}

            {/* Alert */}
            {isLow && activePlayers.length > 0 && (
              <div className="p-3 rounded-xl flex items-start gap-2.5"
                style={{ background: '#EF44440A', border: '1.5px solid #EF444425' }}>
                <TriangleAlert size={15} className="flex-shrink-0 mt-0.5" style={{ color: '#EF4444' }} />
                <p className="text-[13px] leading-relaxed text-[var(--text)]">
                  Short <span className="font-extrabold" style={{ color: '#EF4444' }}>{formatCurrency(Math.abs(poolBalance))}</span> — collect <span className="font-extrabold" style={{ color: 'var(--cricket-accent)' }}>{formatCurrency(perPerson)}</span>/player to cover it.
                </p>
              </div>
            )}

            {!isLow && totalCollected > 0 && poolBalance > 0 && (
              <div className="p-3 rounded-xl flex items-center gap-2.5"
                style={{ background: 'color-mix(in srgb, var(--cricket) 10%, transparent)', border: '1px solid color-mix(in srgb, var(--cricket) 20%, transparent)' }}>
                <CircleCheck size={14} className="flex-shrink-0" style={{ color: 'var(--cricket)' }} />
                <p className="text-[13px] text-[var(--text)]">
                  <span className="font-bold" style={{ color: 'var(--cricket)' }}>{formatCurrency(poolBalance)}</span>{' '}in the pool — any surplus rolls over to next season.
                </p>
              </div>
            )}
          </div>
        );
      })()}

      {/* Expense list */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 overflow-hidden min-w-0">
        <div className="mb-4 flex items-center justify-between">
          <Text as="h3" size="lg" weight="bold" className="sm:text-[18px]">
            Expenses <Text color="muted" weight="normal" size="md">({seasonExpenses.length})</Text>
          </Text>
          {seasonExpenses.length > 0 && (
            <Text size="md" weight="bold" color="danger" className="text-[15px]">-{formatCurrency(totalSpent)}</Text>
          )}
        </div>

        {/* Category filter */}
        {seasonExpenses.length > 0 && (
          <div className="mb-4">
            <FilterDropdown
              options={EXPENSE_CATEGORIES.map((c) => ({
                key: c.key,
                label: c.label,
                count: seasonExpenses.filter((e) => e.category === c.key).length,
              }))}
              value={categoryFilter}
              onChange={setCategoryFilter}
              allLabel="All Expenses"
              allCount={seasonExpenses.length}
              brand="cricket"
            />
          </div>
        )}

        {seasonExpenses.length === 0 ? (
          <EmptyState
            icon="💸"
            title="No expenses yet"
            description="Track team spending by adding your first expense"
            brand="cricket"
            action={isAdmin ? { label: '+ Add Expense', onClick: () => setShowExpenseForm(true) } : undefined}
          />
        ) : (
          <div className="space-y-2">
            {(categoryFilter ? seasonExpenses.filter((e) => e.category === categoryFilter) : seasonExpenses).map((e) => {
              const cfg = getCategoryConfig(e.category);
              const hasReceipts = e.receipt_urls && e.receipt_urls.length > 0;
              const isExpanded = expandedExpense === e.id;

              return (
                <div key={e.id} className="relative rounded-xl border border-[var(--border)] bg-[var(--surface)] overflow-hidden"
                  style={{ borderLeftWidth: '4px', borderLeftColor: cfg.color }}>

                  {/* Three-dot menu */}
                  {isAdmin && (
                    <>
                      <button
                        ref={openMenu === e.id ? menuBtnRef : null}
                        onClick={() => setOpenMenu(openMenu === e.id ? null : e.id)}
                        className="absolute top-2 right-2 h-9 w-9 sm:h-7 sm:w-7 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors z-10">
                        <EllipsisVertical size={12} />
                      </button>

                      {openMenu === e.id && (
                        <CardMenu
                          anchorRef={menuBtnRef}
                          onClose={() => setOpenMenu(null)}
                          items={[
                            { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => setEditingExpense(e.id) },
                            { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => setDeletingExpense({ id: e.id, desc: e.description || cfg.label }), dividerBefore: true },
                          ]}
                        />
                      )}
                    </>
                  )}

                  <div className="p-3">
                    {editingExpense === e.id ? (
                      <InlineEditForm
                        expense={e}
                        onSave={(updates, newFiles) => handleEditSave(e.id, updates, newFiles)}
                        onCancel={() => setEditingExpense(null)}
                      />
                    ) : (
                      <>
                        {/* Card content — tappable to expand if receipts exist */}
                        <div
                          className={hasReceipts ? 'cursor-pointer' : ''}
                          onClick={() => hasReceipts && setExpandedExpense(isExpanded ? null : e.id)}
                        >
                          <div className="flex items-start gap-3 pr-8">
                            {/* Category icon */}
                            <div className="flex-shrink-0">
                              {(() => {
                                const Icon = CATEGORY_ICONS[cfg.iconName];
                                return (
                                  <div className="h-10 w-10 rounded-xl flex items-center justify-center"
                                    style={{ backgroundColor: `${cfg.color}15`, border: `1.5px solid ${cfg.color}30` }}>
                                    {Icon && <Icon size={18} style={{ color: cfg.color }} />}
                                  </div>
                                );
                              })()}
                            </div>

                            {/* Info */}
                            <div className="flex-1 min-w-0">
                              <Text as="p" size="md" weight="semibold" truncate className="sm:text-[15px]">
                                {e.description || cfg.label}
                              </Text>
                              <Text as="p" size="xs" color="muted" className="mt-0.5">
                                {formatDate(e.expense_date)}
                              </Text>
                            </div>

                            {/* Amount */}
                            <div className="flex-shrink-0 text-right">
                              <Text as="p" size="lg" weight="bold" className="sm:text-[18px]">
                                {formatCurrency(Number(e.amount))}
                              </Text>
                            </div>
                          </div>
                        </div>

                        {/* Receipt badge + expand indicator */}
                        {hasReceipts && (
                          <button
                            onClick={() => setExpandedExpense(isExpanded ? null : e.id)}
                            aria-expanded={isExpanded}
                            className="mt-2 py-1.5 flex items-center gap-1.5 min-h-[44px] cursor-pointer active:scale-95 transition-transform"
                          >
                            <Receipt size={12} style={{ color: 'var(--cricket)' }} />
                            <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: 'var(--cricket)' }}>
                              {e.receipt_urls!.length} Receipt{e.receipt_urls!.length > 1 ? 's' : ''}
                            </span>
                            <ChevronDown
                              size={12}
                              style={{ color: 'var(--cricket)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }}
                            />
                          </button>
                        )}

                        {/* Expanded receipts */}
                        {isExpanded && hasReceipts && (
                          <div className="mt-2 pt-2 border-t border-[var(--border)]/30">
                            <div className="flex flex-wrap gap-2">
                              {e.receipt_urls!.map((url, i) => (
                                <button
                                  key={i}
                                  onClick={() => window.open(url, '_blank')}
                                  aria-label={`Open receipt ${i + 1}${isUrlPdf(url) ? ' (PDF)' : ''}`}
                                  className="relative group cursor-pointer active:scale-95 transition-transform"
                                >
                                  {isUrlPdf(url) ? (
                                    <div className="h-20 w-20 rounded-lg border border-[var(--border)] bg-[var(--surface)] flex flex-col items-center justify-center gap-1">
                                      <FileText size={28} className="text-red-500" />
                                      <span className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-wide">PDF</span>
                                    </div>
                                  ) : (
                                    <img
                                      src={url}
                                      alt={`Receipt ${i + 1}`}
                                      className="h-20 w-20 rounded-lg object-cover border border-[var(--border)]"
                                      onError={(ev) => { ev.currentTarget.style.opacity = '0.3'; }}
                                    />
                                  )}
                                  <div className="absolute inset-0 rounded-lg bg-black/10 sm:bg-black/0 sm:group-hover:bg-black/20 transition-colors flex items-center justify-center">
                                    <ExternalLink size={16} className="text-white opacity-70 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity drop-shadow-lg" />
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* Footer */}
                        <div className="mt-2.5 pt-2 border-t border-[var(--border)]/30 space-y-1 text-[11px]">
                          <div className="flex items-center gap-2">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                              style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                              Added
                            </span>
                            <span className="text-[var(--text)] font-bold">{formatDate(e.created_at?.split('T')[0] || e.expense_date)}</span>
                            {e.created_by && <span className="text-[var(--muted)] font-medium">by <span className="text-[var(--text)] font-bold">{e.created_by}</span></span>}
                          </div>
                          {e.updated_at && e.updated_at !== e.created_at && (
                            <div className="flex items-center gap-2">
                              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide"
                                style={{ background: 'var(--surface)', color: 'var(--muted)', border: '1px solid var(--border)' }}>
                                Updated
                              </span>
                              <span className="text-[var(--text)] font-bold">{formatDate(e.updated_at.split('T')[0])}</span>
                              {e.updated_by && <span className="text-[var(--muted)] font-medium">by <span className="text-[var(--text)] font-bold">{e.updated_by}</span></span>}
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently Deleted */}
      {isAdmin && deletedExpenses.length > 0 && (
        <div className="rounded-2xl border border-[var(--red)]/20 bg-[var(--card)] overflow-hidden min-w-0">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          >
            <Text size="md" weight="semibold" color="danger">
              Recently Deleted ({deletedExpenses.length})
            </Text>
            <Text size="xs" color="muted">{showDeleted ? '▲' : '▼'}</Text>
          </button>

          {showDeleted && (
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
              {deletedExpenses.map((e) => {
                const cfg = getCategoryConfig(e.category);
                const Icon = CATEGORY_ICONS[cfg.iconName];
                return (
                  <div key={e.id} className="flex items-center gap-3 rounded-xl border bg-[var(--surface)] p-2.5"
                    style={{ borderColor: 'color-mix(in srgb, var(--red) 25%, var(--border))' }}>
                    <div className="flex-shrink-0 h-9 w-9 rounded-lg flex items-center justify-center"
                      style={{ backgroundColor: `${cfg.color}20` }}>
                      {Icon && <Icon size={16} style={{ color: cfg.color }} />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <Text as="p" size="sm" weight="semibold" truncate>{e.description || cfg.label}</Text>
                      <Text as="p" size="2xs" color="muted">
                        <Text weight="semibold">{formatDate(e.expense_date)}</Text>
                        {e.deleted_by && <> &middot; Deleted by <Text weight="bold">{e.deleted_by}</Text></>}
                      </Text>
                    </div>
                    <Text size="md" weight="bold" className="flex-shrink-0">{formatCurrency(Number(e.amount))}</Text>
                    <div className="flex-shrink-0 flex gap-1.5">
                      <button
                        onClick={() => restoreExpense(e.id)}
                        className="rounded-lg px-3 py-1.5 text-[11px] font-semibold cursor-pointer active:scale-95 transition-all"
                        style={{ background: 'var(--surface)', color: 'var(--green)', border: '1.5px solid var(--border)' }}
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setDeletingExpense({ id: e.id, desc: e.description || cfg.label, permanent: true })}
                        className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold cursor-pointer active:scale-95 transition-all"
                        style={{ background: 'var(--surface)', color: 'var(--red)', border: '1.5px solid color-mix(in srgb, var(--red) 30%, var(--border))' }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Delete confirmation */}
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
