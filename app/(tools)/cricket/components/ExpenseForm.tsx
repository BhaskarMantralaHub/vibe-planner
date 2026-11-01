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
import { useReceiptUploads } from '../lib/use-receipt-uploads';
import { useSeasonEditable } from '../lib/use-season-editable';

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

  // Receipts upload as soon as they're attached; submit waits for all of them
  const MAX_RECEIPTS = 10;
  const seasonEditable = useSeasonEditable();
  const receipts = useReceiptUploads('expense-receipts', MAX_RECEIPTS);
  const [submitting, setSubmitting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore modal open state after iOS Safari reload
  useEffect(() => {
    if (seasonEditable && draft && (draft.description || draft.amount)) {
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

  const [formError, setFormError] = useState('');
  // Must be declared above the early return — Rules of Hooks (React error #310).
  const [pendingRemoveIdx, setPendingRemoveIdx] = useState<number | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    receipts.addFiles(e.target.files);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeReceipt = () => {
    if (pendingRemoveIdx === null) return;
    const target = receipts.items[pendingRemoveIdx];
    if (target) receipts.remove(target.id);
    setPendingRemoveIdx(null);
  };

  const closeWithoutSaving = () => {
    receipts.discard();
    resetAndClose();
  };

  const resetAndClose = () => {
    setCategory('ground');
    setDescription('');
    setAmount('');
    setDate(new Date().toISOString().split('T')[0]);
    setFormError('');
    receipts.reset();
    setSubmitting(false);
    setShowExpenseForm(false);
    sessionStorage.removeItem(EXPENSE_FORM_KEY);
  };

  const handleSubmit = () => {
    if (!user || !selectedSeasonId || submitting || receipts.busy || receipts.failedCount > 0) return;

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
    addExpense(user.id, selectedSeasonId, {
      category,
      description: description.trim(),
      amount: parsed,
      expense_date: date,
      receipt_urls: receipts.urls,
    }, userName);

    resetAndClose();
  };

  return (
    <ComposerModal
      open={showExpenseForm}
      onClose={closeWithoutSaving}
      title="Add Expense"
      footer={
        <div>
          {/* In the footer, not the body: the footer rides above the iOS
              keyboard, so the reason the tap failed is always on screen. */}
          {!formError && receipts.statusText && (
            <Text as="p" size="sm" weight="medium" role="status" color="muted" className="mb-2 text-center">
              {receipts.statusText}
            </Text>
          )}
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
            disabled={submitting || receipts.busy || receipts.failedCount > 0}
          >
            {receipts.busy ? 'Uploading receipts…' : submitting ? 'Adding…' : 'Add Expense'}
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
        <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-3">
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
            className="min-w-0 max-w-full appearance-none"
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
          compressing={receipts.busy}
          busyLabel="Uploading…"
          count={receipts.items.length}
          pendingLabel={pendingRemoveIdx !== null ? `Receipt ${pendingRemoveIdx + 1}` : null}
          onCancelRemove={() => setPendingRemoveIdx(null)}
          onConfirmRemove={removeReceipt}
        >
          {receipts.items.map((r, i) => (
            <ReceiptThumb
              key={r.id}
              src={r.isPdf ? null : r.preview}
              name={r.name}
              busy={r.status === 'compressing' || r.status === 'uploading'}
              failed={r.status === 'error'}
              onRetry={() => receipts.retry(r.id)}
              onRemove={() => setPendingRemoveIdx(i)}
              removeLabel={`Remove receipt ${i + 1}`}
            />
          ))}
        </ReceiptAttach>
    </ComposerModal>
  );
}
