'use client';

import { useState, useEffect, useRef } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { EXPENSE_CATEGORIES } from '../lib/constants';
import { Shirt, Trophy, Utensils, Package } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { ComposerModal, Input, Text } from '@/components/ui';
import { cn } from '@/lib/utils';
import { ReceiptAttach, ReceiptThumb } from './ReceiptAttach';
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
  // Must be declared above the early return — Rules of Hooks (React error #310).
  const [pendingRemoveIdx, setPendingRemoveIdx] = useState<number | null>(null);

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

  const removeReceipt = () => {
    if (pendingRemoveIdx === null) return;
    setReceiptFiles((prev) => {
      if (prev[pendingRemoveIdx]?.preview) URL.revokeObjectURL(prev[pendingRemoveIdx].preview);
      return prev.filter((_, i) => i !== pendingRemoveIdx);
    });
    setPendingRemoveIdx(null);
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
    <ComposerModal
      open={showExpenseForm}
      onClose={resetAndClose}
      title="Add Expense"
      footer={
        <div>
          {/* In the footer, not the body: the footer rides above the iOS
              keyboard, so the reason the tap failed is always on screen. */}
          {formError && (
            <Text as="p" size="sm" weight="medium" role="alert" className="mb-2 text-center" style={{ color: 'var(--danger-text)' }}>
              {formError}
            </Text>
          )}
          <Button
            onClick={handleSubmit}
            variant="primary"
            brand="cricket"
            size="lg"
            fullWidth
            disabled={submitting || compressing}
          >
            {compressing ? 'Compressing…' : submitting ? 'Adding…' : 'Add Expense'}
          </Button>
        </div>
      }
    >
        {/* Text inputs first — the keyboard covers the bottom half */}
        <Input
          label="Description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ground booking, balls, etc."
          brand="cricket"
        />

        {/* Two fluid columns; a fixed 140px date column cramped the amount at 375px */}
        <div className="grid grid-cols-2 gap-3">
          <Input
            label="Amount ($)"
            type="text"
            inputMode="decimal"
            value={amount}
            onChange={(e) => { if (/^\d*\.?\d{0,2}$/.test(e.target.value)) setAmount(e.target.value); }}
            placeholder="0.00"
            brand="cricket"
            className="tabular-nums"
          />
          <Input
            label="Date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            brand="cricket"
          />
        </div>

        <div>
          <Text as="p" id="expense-category-label" size="sm" weight="medium" color="muted" className="mb-1">Category</Text>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-2" role="radiogroup" aria-labelledby="expense-category-label">
            {EXPENSE_CATEGORIES.map((c) => {
              const active = category === c.key;
              const Icon = CATEGORY_ICONS[c.iconName];
              return (
                <button
                  key={c.key}
                  role="radio"
                  aria-checked={active}
                  onClick={() => setCategory(c.key)}
                  className={cn(
                    'flex flex-col items-center justify-center gap-1.5 rounded-xl min-h-[68px] px-2 cursor-pointer transition-[background-color,box-shadow,transform] active:scale-95',
                    active
                      ? 'bg-[var(--card)] text-[var(--text)] shadow-[inset_0_0_0_2px_var(--text)]'
                      : 'bg-[var(--fill)] text-[var(--muted)]',
                  )}
                >
                  {Icon && <Icon size={20} />}
                  <span className={cn('text-[12px] leading-tight text-center', active ? 'font-semibold' : 'font-medium')}>
                    {c.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <ReceiptAttach
          inputRef={fileInputRef}
          onChange={handleFileSelect}
          compressing={compressing}
          count={receiptFiles.length}
          pendingLabel={pendingRemoveIdx !== null ? `Receipt ${pendingRemoveIdx + 1}` : null}
          onCancelRemove={() => setPendingRemoveIdx(null)}
          onConfirmRemove={removeReceipt}
        >
          {receiptFiles.map((r, i) => (
            <ReceiptThumb
              key={r.preview || `pdf-${i}`}
              src={isPdf(r.file) ? null : r.preview}
              name={r.file.name}
              busy={!r.compressed}
              onRemove={() => setPendingRemoveIdx(i)}
              removeLabel={`Remove receipt ${i + 1}`}
            />
          ))}
        </ReceiptAttach>
    </ComposerModal>
  );
}
