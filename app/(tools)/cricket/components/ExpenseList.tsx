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
import { EmptyState, Text, CardMenu, Spinner, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody } from '@/components/ui';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EllipsisVertical, Pencil, Trash2, ChevronDown, Camera, X, Receipt, ExternalLink, FileText, Info, TrendingUp, Heart, ArrowDownRight, Wallet } from 'lucide-react';
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

/* ── Edit Expense Drawer ── */
function EditExpenseDrawer({ expense, onSave, onClose }: {
  expense: import('@/types/cricket').CricketExpense;
  onSave: (updates: { category: string; description: string; amount: number; expense_date: string; receipt_urls?: string[] | null }, newReceiptFiles?: Blob[]) => void;
  onClose: () => void;
}) {
  const [cat, setCat] = useState<string>(expense.category);
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

  const handleSubmit = () => {
    const blobs = newFiles.map((f) => f.compressed).filter(Boolean) as Blob[];
    onSave(
      { category: cat, description: desc, amount: parseFloat(amt), expense_date: date, receipt_urls: existingUrls.length > 0 ? existingUrls : null },
      blobs.length > 0 ? blobs : undefined,
    );
  };

  return (
    <Drawer open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DrawerHandle />
      <DrawerTitle>Edit Expense</DrawerTitle>
      <DrawerHeader>
        <Text as="h3" size="lg" weight="bold">Edit Expense</Text>
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
                    <div className="h-20 w-20 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col items-center justify-center gap-1">
                      <FileText size={24} className="text-red-500" />
                      <span className="text-[9px] font-bold text-[var(--muted)] uppercase">PDF</span>
                    </div>
                  ) : (
                    <img src={url} alt={`Receipt ${i + 1}`} className="h-20 w-20 rounded-xl object-cover border border-[var(--border)]"
                      onError={(ev) => { ev.currentTarget.style.opacity = '0.3'; }} />
                  )}
                  <button onClick={() => removeExisting(i)} aria-label={`Remove receipt ${i + 1}`}
                    className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90">
                    <span className="h-6 w-6 rounded-full bg-black/70 flex items-center justify-center"><X size={12} className="text-white" /></span>
                  </button>
                </div>
              ))}
              {newFiles.map((f, i) => (
                <div key={`new-${i}`} className="relative animate-fade-in">
                  {f.isPdf ? (
                    <div className="h-20 w-20 rounded-xl border-2 border-dashed border-[var(--cricket)] bg-[var(--surface)] flex flex-col items-center justify-center gap-1">
                      <FileText size={24} className="text-red-500" />
                      <span className="text-[9px] font-bold text-[var(--muted)] uppercase">PDF</span>
                    </div>
                  ) : (
                    <img src={f.preview} alt={`New receipt ${i + 1}`} className="h-20 w-20 rounded-xl object-cover border-2 border-dashed border-[var(--cricket)]" />
                  )}
                  <button onClick={() => removeNew(i)} aria-label={`Remove new receipt ${i + 1}`}
                    className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90">
                    <span className="h-6 w-6 rounded-full bg-black/70 flex items-center justify-center"><X size={12} className="text-white" /></span>
                  </button>
                  {!f.compressed && (
                    <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center"><Spinner size="sm" /></div>
                  )}
                </div>
              ))}
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

export default function ExpenseList() {
  const { userAccess, user } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const { expenses, fees, sponsorships, players, selectedSeasonId, deleteExpense, permanentDeleteExpense, restoreExpense, updateExpense, setShowExpenseForm } = useCricketStore();

  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [deletingExpense, setDeletingExpense] = useState<{ id: string; desc: string; permanent?: boolean } | null>(null);
  const [editingExpense, setEditingExpense] = useState<typeof seasonExpenses[0] | null>(null);
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
  const spentPct = totalCollected > 0 ? Math.min((totalSpent / totalCollected) * 100, 100) : 0;
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
            const { data: { publicUrl } } = supabase.storage.from('expense-receipts').getPublicUrl(path);
            uploadedUrls.push(publicUrl);
          } else {
            console.error('[cricket] receipt upload:', error);
          }
        }
        updates.receipt_urls = uploadedUrls.length > 0 ? uploadedUrls : null;
      }
    }

    updateExpense(expenseId, updates as Partial<import('@/types/cricket').CricketExpense>, currentUserName);
  };

  const balanceColor = isLow ? '#EF4444' : poolBalance > 0 ? '#059669' : 'var(--muted)';

  return (
    <div className="space-y-4">
      {/* Expenses section — pool balance embedded in header */}
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-5 overflow-hidden min-w-0">

        {/* Section header */}
        <Text as="h3" size="lg" weight="bold" className="sm:text-[18px] mb-3">
          Expenses <Text color="muted" weight="normal" size="sm">({seasonExpenses.length})</Text>
        </Text>

        {/* Pool fund summary — stat cards with icons */}
        {totalCollected > 0 && (
          <div className={`grid gap-2 mb-4 ${totalSponsorship > 0 ? 'grid-cols-2' : 'grid-cols-3'}`}>
            <div className="rounded-xl p-2.5 flex items-center gap-2.5" style={{ background: '#05966908' }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#05966915' }}>
                <TrendingUp size={14} style={{ color: '#059669' }} />
              </div>
              <div>
                <Text as="p" size="sm" weight="bold" tabular style={{ color: '#059669' }}>{formatCurrency(totalFees)}</Text>
                <Text as="p" size="2xs" color="muted" weight="medium">Fees</Text>
              </div>
            </div>
            {totalSponsorship > 0 && (
              <div className="rounded-xl p-2.5 flex items-center gap-2.5" style={{ background: 'color-mix(in srgb, var(--cricket) 5%, transparent)' }}>
                <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'color-mix(in srgb, var(--cricket) 12%, transparent)' }}>
                  <Heart size={14} style={{ color: 'var(--cricket-accent)' }} />
                </div>
                <div>
                  <Text as="p" size="sm" weight="bold" tabular style={{ color: 'var(--cricket-accent)' }}>{formatCurrency(totalSponsorship)}</Text>
                  <Text as="p" size="2xs" color="muted" weight="medium">Sponsors</Text>
                </div>
              </div>
            )}
            <div className="rounded-xl p-2.5 flex items-center gap-2.5" style={{ background: '#EF444408' }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: '#EF444412' }}>
                <ArrowDownRight size={14} style={{ color: '#EF4444' }} />
              </div>
              <div>
                <Text as="p" size="sm" weight="bold" tabular style={{ color: '#EF4444' }}>{formatCurrency(totalSpent)}</Text>
                <Text as="p" size="2xs" color="muted" weight="medium">Spent</Text>
              </div>
            </div>
            <div className="rounded-xl p-2.5 flex items-center gap-2.5" style={{ background: `${balanceColor}08` }}>
              <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${balanceColor}12` }}>
                <Wallet size={14} style={{ color: balanceColor }} />
              </div>
              <div>
                <Text as="p" size="sm" weight="bold" tabular style={{ color: balanceColor }}>
                  {isLow ? '-' : ''}{formatCurrency(Math.abs(poolBalance))}
                </Text>
                <Text as="p" size="2xs" color="muted" weight="medium">{isLow ? 'Short' : 'Remaining'}</Text>
              </div>
            </div>
          </div>
        )}

        {/* Shortfall alert — only when pool is negative */}
        {isLow && activePlayers.length > 0 && (
          <div className="mb-4 rounded-xl px-3 py-2 flex items-center gap-2"
            style={{ background: '#EF44440A', border: '1px solid #EF444420' }}>
            <div className="h-2 w-2 rounded-full flex-shrink-0 animate-pulse" style={{ background: '#EF4444' }} />
            <Text size="2xs" color="muted">
              Collect <Text weight="bold" style={{ color: 'var(--cricket-accent)' }}>{formatCurrency(perPerson)}</Text>/player to cover the shortfall
            </Text>
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
          <div className="space-y-1.5">
            {(categoryFilter ? seasonExpenses.filter((e) => e.category === categoryFilter) : seasonExpenses).map((e) => {
              const cfg = getCategoryConfig(e.category);
              const hasReceipts = e.receipt_urls && e.receipt_urls.length > 0;
              const isExpanded = expandedExpense === e.id;
              const pctOfTotal = totalSpent > 0 ? (Number(e.amount) / totalSpent) * 100 : 0;

              return (
                <div key={e.id} className="relative rounded-xl bg-[var(--surface)] overflow-hidden"
                  style={{ borderLeft: `3px solid ${cfg.color}` }}>

                  {/* Proportional spend indicator — subtle background fill */}
                  <div className="absolute inset-0 pointer-events-none" style={{
                    background: `linear-gradient(90deg, ${cfg.color}06 0%, ${cfg.color}06 ${Math.min(pctOfTotal, 100)}%, transparent ${Math.min(pctOfTotal, 100)}%)`,
                  }} />

                  {/* Three-dot menu */}
                  {isAdmin && (
                    <>
                      <button
                        ref={openMenu === e.id ? menuBtnRef : null}
                        onClick={() => setOpenMenu(openMenu === e.id ? null : e.id)}
                        className="absolute top-1.5 right-1.5 h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors z-10">
                        <EllipsisVertical size={12} />
                      </button>

                      {openMenu === e.id && (
                        <CardMenu
                          anchorRef={menuBtnRef}
                          onClose={() => setOpenMenu(null)}
                          items={[
                            { label: 'Edit', icon: <Pencil size={15} />, color: 'var(--text)', onClick: () => setEditingExpense(e) },
                            { label: 'Details', icon: <Info size={15} />, color: 'var(--muted)', onClick: () => {
                              const parts: string[] = [];
                              if (e.created_by) parts.push(`Added by ${e.created_by} on ${formatDate(e.created_at?.split('T')[0] || e.expense_date)}`);
                              if (e.updated_by && e.updated_at !== e.created_at) parts.push(`Updated by ${e.updated_by} on ${formatDate(e.updated_at.split('T')[0])}`);
                              toast(parts.join('\n') || 'No details', { duration: 4000 });
                            }},
                            { label: 'Delete', icon: <Trash2 size={15} />, color: 'var(--red)', onClick: () => setDeletingExpense({ id: e.id, desc: e.description || cfg.label }), dividerBefore: true },
                          ]}
                        />
                      )}
                    </>
                  )}

                  <div className="relative p-2.5 sm:p-3">
                        {/* Main row: description + amount */}
                        <div className="flex items-baseline justify-between gap-2 pr-7">
                          <Text as="p" size="sm" weight="semibold" truncate className="sm:text-[14px] flex-1 min-w-0">
                            {e.description || cfg.label}
                          </Text>
                          <div className="flex-shrink-0 text-right">
                            <Text size="md" weight="bold" tabular className="sm:text-[15px]">
                              {formatCurrency(Number(e.amount))}
                            </Text>
                            {pctOfTotal >= 15 && (
                              <Text as="p" size="2xs" color="muted" tabular className="mt-px">{Math.round(pctOfTotal)}%</Text>
                            )}
                          </div>
                        </div>

                        {/* Secondary row: category badge + date + receipt indicator */}
                        <div className="flex items-center gap-1.5 mt-1">
                          <span className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold"
                            style={{ background: `${cfg.color}12`, color: cfg.color }}>
                            {cfg.label}
                          </span>
                          <Text size="2xs" color="muted">·</Text>
                          <Text size="2xs" color="muted">{formatDate(e.expense_date)}</Text>
                          {hasReceipts && (
                            <button
                              onClick={() => setExpandedExpense(isExpanded ? null : e.id)}
                              aria-expanded={isExpanded}
                              className="flex items-center gap-1 cursor-pointer active:scale-95 transition-transform"
                            >
                              <Text size="2xs" weight="semibold" style={{ color: 'var(--cricket)' }}>
                                · {e.receipt_urls!.length} receipt{e.receipt_urls!.length > 1 ? 's' : ''}
                              </Text>
                              <ChevronDown size={10} style={{ color: 'var(--cricket)', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
                            </button>
                          )}
                        </div>

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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Recently Deleted */}
      {isAdmin && deletedExpenses.length > 0 && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden min-w-0">
          <button
            onClick={() => setShowDeleted(!showDeleted)}
            className="w-full flex items-center justify-between p-3 sm:p-4 cursor-pointer hover:bg-[var(--hover-bg)] transition-colors"
          >
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded-lg flex items-center justify-center" style={{ background: '#EF444412' }}>
                <Trash2 size={12} style={{ color: '#EF4444' }} />
              </div>
              <Text size="sm" weight="semibold" color="muted">
                Deleted <Text weight="bold" color="danger">({deletedExpenses.length})</Text>
              </Text>
            </div>
            <ChevronDown size={14} className="text-[var(--muted)]" style={{ transform: showDeleted ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 0.2s' }} />
          </button>

          {showDeleted && (
            <div className="px-3 sm:px-4 pb-3 sm:pb-4 space-y-2">
              {deletedExpenses.map((e) => {
                const cfg = getCategoryConfig(e.category);
                return (
                  <div key={e.id} className="rounded-xl bg-[var(--surface)] p-3 opacity-70" style={{ borderLeft: `3px solid ${cfg.color}` }}>
                    {/* Top row: description + amount */}
                    <div className="flex items-baseline justify-between gap-2 mb-1">
                      <Text as="p" size="sm" weight="semibold" truncate className="flex-1 min-w-0 line-through decoration-[var(--muted)]/40">
                        {e.description || cfg.label}
                      </Text>
                      <Text size="sm" weight="bold" tabular className="flex-shrink-0 line-through decoration-[var(--muted)]/40">
                        {formatCurrency(Number(e.amount))}
                      </Text>
                    </div>
                    {/* Meta row */}
                    <Text as="p" size="2xs" color="muted" className="mb-2.5">
                      {formatDate(e.expense_date)}
                      {e.deleted_by && <> · deleted by <Text weight="semibold">{e.deleted_by}</Text></>}
                    </Text>
                    {/* Action row */}
                    <div className="flex gap-2">
                      <button
                        onClick={() => restoreExpense(e.id)}
                        className="flex-1 rounded-lg py-2 text-[12px] font-semibold cursor-pointer active:scale-[0.98] transition-all text-center"
                        style={{ background: '#05966910', color: '#059669', border: '1px solid #05966925' }}
                      >
                        Restore
                      </button>
                      <button
                        onClick={() => setDeletingExpense({ id: e.id, desc: e.description || cfg.label, permanent: true })}
                        className="rounded-lg px-4 py-2 text-[12px] font-semibold cursor-pointer active:scale-[0.98] transition-all"
                        style={{ background: '#EF444410', color: '#EF4444', border: '1px solid #EF444425' }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Edit drawer */}
      {editingExpense && (
        <EditExpenseDrawer
          expense={editingExpense}
          onSave={(updates, newFiles) => {
            handleEditSave(editingExpense.id, updates, newFiles);
            setEditingExpense(null);
          }}
          onClose={() => setEditingExpense(null)}
        />
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
