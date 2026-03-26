'use client';

import { Drawer as VaulDrawer } from 'vaul';
import { useCallback, useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { useKeyboardHeight } from '@/hooks/use-keyboard-height';

/// ── Shared Drawer (vaul wrapper with iOS Safari keyboard fixes) ──
///
/// All iOS Safari issues are handled automatically:
/// - `repositionInputs={false}` prevents vaul's double-shift bug (GitHub #619, #294)
/// - `handleOnly` prevents scroll-to-dismiss conflicts
/// - `useKeyboardHeight` dynamically shrinks content when keyboard opens
/// - Inputs inside auto-scroll into view on focus (300ms delay for keyboard animation)
///
/// Usage:
/// ```tsx
/// <Drawer open={open} onOpenChange={setOpen}>
///   <DrawerHandle />
///   <DrawerHeader>Title</DrawerHeader>
///   <DrawerBody>
///     <input /> {/* iOS keyboard handling is automatic */}
///   </DrawerBody>
/// </Drawer>
/// ```

/* ── Root ── */
interface DrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
  dismissible?: boolean;
}

function Drawer({ open, onOpenChange, children, dismissible = true }: DrawerProps) {
  return (
    <VaulDrawer.Root
      open={open}
      onOpenChange={onOpenChange}
      direction="bottom"
      handleOnly
      repositionInputs={false}
      dismissible={dismissible}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm" />
        <VaulDrawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 sm:max-w-md sm:mx-auto rounded-t-2xl outline-none"
          style={{ background: 'var(--card)', border: '1px solid var(--border)', borderBottom: 'none' }}
          aria-describedby={undefined}
        >
          {children}
        </VaulDrawer.Content>
      </VaulDrawer.Portal>
    </VaulDrawer.Root>
  );
}

/* ── Handle (drag bar) ── */
function DrawerHandle() {
  return (
    <VaulDrawer.Handle className="mt-3 mb-1" style={{ background: 'var(--border)' }} />
  );
}

/* ── Title (accessible, hidden by default) ── */
function DrawerTitle({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <VaulDrawer.Title className={cn('sr-only', className)}>
      {children}
    </VaulDrawer.Title>
  );
}

/* ── Header (sticky above scroll) ── */
function DrawerHeader({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <>
      <div className={cn('px-5 py-3', className)}>
        {children}
      </div>
      <div className="h-px" style={{ background: 'var(--border)' }} />
    </>
  );
}

/* ── Body (scrollable content with keyboard-aware height) ── */
function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  const keyboardHeight = useKeyboardHeight();
  const bodyRef = useRef<HTMLDivElement>(null);

  // Auto-scroll focused input into view when keyboard opens (iOS Safari)
  const handleFocusCapture = useCallback((e: React.FocusEvent) => {
    const target = e.target;
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLInputElement) {
      setTimeout(() => {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 300); // iOS keyboard animation takes ~250ms
    }
  }, []);

  return (
    <div
      ref={bodyRef}
      className={cn('px-5 pb-6 pt-4 space-y-4 overflow-y-auto overscroll-contain', className)}
      style={{
        maxHeight: keyboardHeight > 0
          ? `calc(70dvh - ${keyboardHeight}px)`
          : '70dvh',
      }}
      onFocusCapture={handleFocusCapture}
    >
      {children}
    </div>
  );
}

/* ── Close (for programmatic close buttons) ── */
const DrawerClose = VaulDrawer.Close;

export { Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody, DrawerClose };
