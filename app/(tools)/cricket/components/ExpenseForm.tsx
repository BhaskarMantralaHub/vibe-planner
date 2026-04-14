'use client';

import { useState, useEffect, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES, getCategoryConfig } from '../lib/constants';
import { Shirt, Trophy, Utensils, Package, Camera, X, FileText } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Alert } from '@/components/ui/alert';
import { Spinner, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody } from '@/components/ui';
import { Text } from '@/components/ui';
import { toast } from 'sonner';
import { compressReceiptImage } from '../lib/image';

const CATEGORY_ICONS: Record<string, React.ComponentType<{ size?: number; className?: string; style?: React.CSSProperties }>> = {
  FaTshirt: Shirt, MdSportsCricket, FaTrophy: Trophy, FaUtensils: Utensils, FaBox: Package,
};

const EXPENSE_FORM_KEY = 'cricket_expense_form_draft';

export default function ExpenseForm() {
  const { user } = useAuthStore();
  const { selectedSeasonId, addExpense, showExpenseForm, setShowExpenseForm } = useCricketStore();

  const getSavedForm = () => {
    try {
      const saved = sessionStorage.getItem(EXPENSE_FORM_KEY);
      return saved ? JSON.parse(saved) : null;
    } catch { return null; }
  };

  const draft = getSavedForm();
  const [category, setCategory] = useState(draft?.category ?? 'ground');
  const [description, setDescription] = useState(draft?.description ?? '');
  const [amount, setAmount] = useState(draft?.amount ?? '');
  const [date, setDate] = useState(draft?.date ?? new Date().toISOString().split('T')[0]);

  // Receipt state
  const [receiptFiles, setReceiptFiles] = useState<{ file: File; preview: string; compressed: Blob | null }[]>([]);
  const [compressingCount, setCompressingCount] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const MAX_RECEIPTS = 10;

  // Restore modal open state after iOS Safari reload
  useEffect(() => {
    if (draft && (draft.description || draft.amount)) {
      setShowExpenseForm(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist form state to sessionStorage for iOS Safari survival
  useEffect(() => {
    if (showExpenseForm && (description || amount)) {
      sessionStorage.setItem(EXPENSE_FORM_KEY, JSON.stringify({ category, description, amount, date }));
    }
  }, [category, description, amount, date, showExpenseForm]);

  // Revoke preview URLs on unmount
  useEffect(() => {
    return () => { receiptFiles.forEach((r) => URL.revokeObjectURL(r.preview)); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [formError, setFormError] = useState('');

  if (!showExpenseForm) return null;

  const isPdf = (file: File) => file.type === 'application/pdf';
  const isValidType = (file: File) => file.type === 'application/pdf' || file.type.startsWith('image/');
  const compressing = compressingCount > 0;

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files?.length) return;

    const remaining = MAX_RECEIPTS - receiptFiles.length;
    const selected = Array.from(files).slice(0, remaining);
    if (files.length > remaining) {
      toast.error(`Max ${MAX_RECEIPTS} receipts. Only adding ${remaining} more.`);
    }

    for (const file of selected) {
      if (!isValidType(file)) {
        toast.error(`${file.name}: only images and PDFs are supported.`);
        continue;
      }

      const preview = isPdf(file) ? '' : URL.createObjectURL(file);
      if (isPdf(file)) {
        setReceiptFiles((prev) => [...prev, { file, preview, compressed: file }]);
      } else {
        setReceiptFiles((prev) => [...prev, { file, preview, compressed: null }]);
        setCompressingCount((c) => c + 1);
        try {
          const compressed = await compressReceiptImage(file);
          setReceiptFiles((prev) => prev.map((r) => r.preview === preview ? { ...r, compressed } : r));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : `Failed to compress ${file.name}`);
          setReceiptFiles((prev) => {
            if (preview) URL.revokeObjectURL(preview);
            return prev.filter((r) => r.preview !== preview);
          });
        } finally {
          setCompressingCount((c) => c - 1);
        }
      }
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeReceipt = (index: number) => {
    setReceiptFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const resetAndClose = () => {
    setCategory('ground');
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setFormError('');
    receiptFiles.forEach((r) => URL.revokeObjectURL(r.preview));
    setReceiptFiles([]);
    setSubmitting(false);
    setShowExpenseForm(false);
    sessionStorage.removeItem(EXPENSE_FORM_KEY);
  };

  const handleSubmit = () => {
    if (!user || !selectedSeasonId || submitting) return;

    const parsed = parseFloat(amount);
    if (!amount || isNaN(parsed) || parsed <= 0) {
      setFormError('Enter an amount greater than $0.');
      return;
    }
    if (!category) {
      setFormError('Pick a category before adding.');
      return;
    }
    setFormError('');
    setSubmitting(true);

    const userName = (user.user_metadata?.full_name as string) || user.email || '';
    const compressedBlobs = receiptFiles.map((r) => r.compressed).filter(Boolean) as Blob[];
    addExpense(user.id, selectedSeasonId, {
      category,
      description: description.trim(),
      amount: parsed,
      expense_date: date,
    }, userName, compressedBlobs.length > 0 ? compressedBlobs : undefined);

    resetAndClose();
  };

  return (
    <Drawer open={showExpenseForm} onOpenChange={(open) => { if (!open) resetAndClose(); }}>
      <DrawerHandle />
      <DrawerTitle>Add Expense</DrawerTitle>
      <DrawerHeader>
        <Text as="h3" size="lg" weight="bold">Add Expense</Text>
      </DrawerHeader>
      <DrawerBody>
        {/* Category */}
        <div>
          <Label uppercase className="mb-2 block">Category</Label>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup" aria-label="Expense category">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = category === c.key;
              const Icon = CATEGORY_ICONS[c.iconName];
              return (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(c.key)}
                  className="flex flex-col items-center gap-1.5 rounded-xl py-3 px-2 cursor-pointer transition-all border-2 active:scale-95"
                  style={{
                    backgroundColor: active ? `${c.color}15` : 'var(--surface)',
                    borderColor: active ? c.color : 'var(--border)',
                    boxShadow: active ? `0 2px 12px ${c.color}20` : 'none',
                  }}
                >
                  {Icon && <Icon size={20} style={{ color: active ? c.color : 'var(--muted)' }} />}
                  <span className="text-[11px] font-bold" style={{ color: active ? c.color : 'var(--muted)' }}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Description */}
        <div>
          <Label uppercase className="mb-1.5 block">Description</Label>
          <input
            value={description} onChange={(e) => setDescription(e.target.value)}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
            placeholder="Ground booking, balls, etc."
          />
        </div>

        {/* Amount + Date */}
        <div className="grid grid-cols-[1fr_140px] gap-3">
          <div>
            <Label uppercase className="mb-1.5 block">Amount ($)</Label>
            <input
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
              placeholder="0.00"
            />
          </div>
          <div>
            <Label uppercase className="mb-1.5 block">Date</Label>
            <input
              type="date" value={date} onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[14px] text-[var(--text)] outline-none focus:border-[var(--cricket)] transition-colors"
            />
          </div>
        </div>

        {/* Receipt upload */}
        <div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            multiple
            className="hidden"
            aria-label="Select receipt images or PDFs"
            onChange={handleFileSelect}
          />

          {/* Thumbnail previews */}
          {receiptFiles.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-2">
              {receiptFiles.map((r, i) => (
                <div key={r.preview || `pdf-${i}`} className="relative animate-fade-in" style={{ animationDelay: `${i * 80}ms` }}>
                  {isPdf(r.file) ? (
                    <div className="h-20 w-20 rounded-xl border border-[var(--border)] bg-[var(--surface)] flex flex-col items-center justify-center gap-1">
                      <FileText size={24} className="text-red-500" />
                      <span className="text-[9px] font-bold text-[var(--muted)] uppercase tracking-wide">PDF</span>
                    </div>
                  ) : (
                    <img
                      src={r.preview}
                      alt={`Receipt: ${r.file.name}`}
                      className="h-20 w-20 rounded-xl object-cover border border-[var(--border)]"
                    />
                  )}
                  <button
                    onClick={() => removeReceipt(i)}
                    aria-label={`Remove receipt ${i + 1}`}
                    className="absolute -top-2 -right-2 h-8 w-8 flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
                  >
                    <span className="h-6 w-6 rounded-full bg-black/70 flex items-center justify-center">
                      <X size={12} className="text-white" />
                    </span>
                  </button>
                  {!r.compressed && (
                    <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
                      <Spinner size="sm" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Add receipt button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={compressing}
            className="w-full flex items-center justify-center gap-2 rounded-xl py-3 min-h-[48px] border-2 border-dashed cursor-pointer active:scale-[0.98] transition-all hover:border-[var(--cricket)] hover:bg-[var(--hover-bg)]"
            style={{ borderColor: 'color-mix(in srgb, var(--cricket) 40%, var(--border))', background: 'color-mix(in srgb, var(--cricket) 4%, transparent)' }}
          >
            {compressing ? (
              <>
                <Spinner size="sm" />
                <span className="text-[13px] font-medium text-[var(--muted)]">Compressing...</span>
              </>
            ) : (
              <>
                <Camera size={18} className="text-[var(--muted)]" />
                <span className="text-[13px] font-medium text-[var(--muted)]">
                  {receiptFiles.length > 0 ? 'Add more receipts' : 'Attach receipts or invoices'}
                </span>
              </>
            )}
          </button>
        </div>

        {/* Validation error */}
        {formError && <Alert variant="error" className="text-[13px]">{formError}</Alert>}

        {/* Submit */}
        <Button
          onClick={handleSubmit}
          variant="primary"
          brand="cricket"
          size="lg"
          fullWidth
          disabled={submitting || compressing}
        >
          {submitting ? 'Adding...' : 'Add Expense'}
        </Button>
      </DrawerBody>
    </Drawer>
  );
}
