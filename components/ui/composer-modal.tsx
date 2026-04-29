'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Text } from './text';

/**
 * ComposerModal — shared shell for forms with text inputs that must work with the
 * iOS Safari keyboard. Used by GalleryUpload, ExpenseForm, SplitForm, etc.
 *
 * Design: full-screen on mobile (100svh — keyboard-stable), centered modal on
 * desktop. Header / scrollable body / sticky footer. The footer is translated up
 * by the keyboard overlap (measured via `window.visualViewport`) so it sticks
 * just above the keyboard line.
 *
 * WHY NOT VAUL:
 * Vaul's `repositionInputs` is broken for textareas/inputs (issues #294, #298,
 * #312, #514) — it leaves the input pinned to the screen bottom with whitespace
 * above. This component implements the IG/Threads/Twitter mobile composer pattern
 * directly: full-screen layout + svh sizing + visualViewport offset for the footer.
 *
 * USE WHEN:
 * - The form has text inputs (textarea/input) and runs on iOS Safari
 * - You want consistent composer chrome across the app
 *
 * USE VAUL DRAWER WHEN:
 * - Tap-only forms (no text input) where bottom-sheet feel is desired
 * - Confirmation dialogs, action sheets
 *
 * USAGE:
 * ```tsx
 * <ComposerModal
 *   open={open}
 *   onClose={handleClose}
 *   title="Add Expense"
 *   footer={
 *     <Button onClick={handleSubmit} disabled={busy}>
 *       Add Expense
 *     </Button>
 *   }
 * >
 *   <input ... />
 *   <textarea ... />
 * </ComposerModal>
 * ```
 *
 * Place text inputs FIRST in the body — when the keyboard rises it covers the
 * BOTTOM half of the screen, so inputs at the top stay visible. Put media
 * pickers, action chips, and tap-to-select widgets BELOW the inputs.
 */
interface ComposerModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  /** Optional left-side header action. Defaults to "Cancel". */
  leftAction?: { label: string; onClick: () => void; color?: string };
  /** Optional right-side header action (e.g. Share / Save). Use this for the primary
   *  action if you want it in the header rather than the footer. */
  rightAction?: { label: string; onClick: () => void; disabled?: boolean; color?: string; icon?: ReactNode };
  /** Sticky footer — translated up by the keyboard overlap so it stays visible while typing. */
  footer?: ReactNode;
  children: ReactNode;
}

export function ComposerModal({
  open,
  onClose,
  title,
  leftAction,
  rightAction,
  footer,
  children,
}: ComposerModalProps) {
  // Track keyboard overlap so the footer can translate up to stay visible.
  const [kbOffset, setKbOffset] = useState(0);

  useEffect(() => {
    if (!open) return;
    const vv = typeof window !== 'undefined' ? window.visualViewport : null;
    if (!vv) return;
    const update = () => {
      const overlap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      setKbOffset(-overlap);
    };
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    update();
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [open]);

  if (!open || typeof document === 'undefined') return null;

  const left = leftAction ?? { label: 'Cancel', onClick: onClose, color: 'var(--muted)' };

  return createPortal(
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-md"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Composer panel: full-screen on mobile (100svh, keyboard-stable),
          centered modal on desktop. svh NOT dvh — dvh is buggy on iOS Safari
          when the keyboard is up until iOS 17.4+. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={
          'fixed z-50 flex flex-col bg-[var(--card)] outline-none ' +
          'inset-0 h-[100svh] ' +
          'sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2 ' +
          'sm:w-[480px] sm:max-w-[calc(100vw-2rem)] sm:h-auto sm:max-h-[85svh] ' +
          'sm:rounded-2xl sm:border sm:border-[var(--border)] sm:shadow-2xl'
        }
      >
        {/* Header — fixed top */}
        <header className="flex-none flex items-center justify-between gap-3 px-5 py-3 border-b border-[var(--border)]">
          <button
            onClick={left.onClick}
            className="text-[14px] font-medium cursor-pointer min-w-[60px] text-left"
            style={{ color: left.color ?? 'var(--muted)' }}
          >
            {left.label}
          </button>
          <Text as="span" size="md" weight="bold" truncate className="text-center">
            {title}
          </Text>
          {rightAction ? (
            <button
              onClick={rightAction.onClick}
              disabled={rightAction.disabled}
              className="flex items-center gap-1.5 text-[14px] font-semibold cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed min-w-[60px] justify-end"
              style={{ color: rightAction.color ?? 'var(--blue)' }}
            >
              {rightAction.icon}
              {rightAction.label}
            </button>
          ) : (
            <span className="min-w-[60px]" />
          )}
        </header>

        {/* Scrollable body — flex-1 fills available space.
            min-h-0 critical for nested flex scrolling. */}
        <main className="flex-1 min-h-0 overflow-y-auto px-5 py-4 space-y-4">
          {children}
        </main>

        {/* Sticky footer — translated by keyboard overlap so it stays visible while typing */}
        {footer && (
          <footer
            className="flex-none px-5 py-3 border-t border-[var(--border)] bg-[var(--card)] transition-transform duration-150 ease-out"
            style={{ transform: `translateY(${kbOffset}px)` }}
          >
            {footer}
          </footer>
        )}
      </div>
    </>,
    document.body,
  );
}
