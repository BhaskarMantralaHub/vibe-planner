'use client';

import type { ReactNode, RefObject, ChangeEvent } from 'react';
import { Camera, FileText, X } from 'lucide-react';
import { Button, Spinner, Text } from '@/components/ui';

/**
 * Receipt picker shared by ExpenseForm and SplitForm: thumbnails, an inline
 * remove confirmation, and one gray "Attach" button. Each form keeps its own
 * file state (Split also carries already-uploaded URLs); this owns only the look.
 */
export function ReceiptAttach({
  inputRef, onChange, compressing, count, pendingLabel, onCancelRemove, onConfirmRemove, children,
}: {
  inputRef: RefObject<HTMLInputElement | null>;
  onChange: (e: ChangeEvent<HTMLInputElement>) => void;
  compressing: boolean;
  count: number;
  /** "Receipt 2" while a remove is awaiting confirmation, else null. */
  pendingLabel: string | null;
  onCancelRemove: () => void;
  onConfirmRemove: () => void;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 flex items-baseline justify-between">
        <Text as="p" size="sm" weight="medium" color="muted">Receipts</Text>
        <Text size="xs" color="dim">Optional</Text>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        aria-label="Select receipt images or PDFs"
        onChange={onChange}
      />

      {count > 0 && <div className="flex flex-wrap gap-2 pt-2 mb-3">{children}</div>}

      {pendingLabel && (
        <div className="mb-3 rounded-xl bg-[var(--surface)] p-3" role="alertdialog" aria-label={`Remove ${pendingLabel}?`}>
          <Text as="p" size="md" weight="medium" className="mb-2.5">Remove {pendingLabel}?</Text>
          <div className="flex gap-2">
            <Button variant="secondary" size="md" fullWidth onClick={onCancelRemove}>Cancel</Button>
            <Button variant="danger" size="md" fullWidth onClick={onConfirmRemove}>Remove</Button>
          </div>
        </div>
      )}

      <Button
        variant="secondary"
        size="lg"
        fullWidth
        onClick={() => inputRef.current?.click()}
        loading={compressing}
        className="gap-2"
      >
        {!compressing && <Camera size={18} />}
        {compressing ? 'Compressing…' : count > 0 ? 'Add more receipts' : 'Attach receipts or invoices'}
      </Button>
    </div>
  );
}

/** One 80px receipt tile. `src` null = PDF (no preview). */
export function ReceiptThumb({ src, name, busy = false, onRemove, removeLabel }: {
  src: string | null;
  name: string;
  busy?: boolean;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <div className="relative animate-fade-in">
      {src ? (
        <img
          src={src}
          alt={name}
          className="h-20 w-20 rounded-xl object-cover bg-[var(--fill)]"
          onError={(ev) => { ev.currentTarget.style.opacity = '0.3'; }}
        />
      ) : (
        <div className="h-20 w-20 rounded-xl bg-[var(--fill)] flex flex-col items-center justify-center gap-1 px-1.5">
          <FileText size={22} className="text-[var(--muted)]" />
          <span className="w-full truncate text-center text-[10px] font-medium text-[var(--muted)]">{name}</span>
        </div>
      )}
      <button
        onClick={onRemove}
        aria-label={removeLabel}
        className="absolute -top-2.5 -right-2.5 h-9 w-9 flex items-center justify-center cursor-pointer active:scale-90 transition-transform"
      >
        <span className="h-6 w-6 rounded-full bg-[var(--text)] flex items-center justify-center shadow-[0_1px_3px_rgba(0,0,0,0.2)]">
          <X size={13} strokeWidth={2.5} className="text-[var(--card)]" />
        </span>
      </button>
      {busy && (
        <div className="absolute inset-0 rounded-xl bg-black/40 flex items-center justify-center">
          <Spinner size="sm" />
        </div>
      )}
    </div>
  );
}
