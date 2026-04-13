'use client';

import { Drawer as VaulDrawer } from 'vaul';
import { useRef, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

/// ── Shared Drawer (vaul wrapper) ──
///
/// iOS Safari keyboard handling is delegated entirely to vaul's built-in system:
/// - `repositionInputs` defaults to `true` — vaul repositions the drawer above
///   the keyboard, prevents Safari scroll, and scrolls inputs into view.
/// - `handleOnly` prevents scroll-to-dismiss conflicts with body content.
///
/// IMPORTANT: Do NOT add a custom keyboard-offset system (useKeyboardHeight,
/// manual bottom/transform). Vaul handles this internally. Running two systems
/// causes the "double-shift" bug where the drawer moves up by 2x keyboard height.
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
      dismissible={dismissible}
    >
      <VaulDrawer.Portal>
        <VaulDrawer.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-md" />
        <VaulDrawer.Content
          className="fixed bottom-0 left-0 right-0 z-50 sm:max-w-md sm:mx-auto rounded-t-2xl outline-none"
          style={{
            background: 'var(--card)',
            border: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
            borderBottom: 'none',
            boxShadow: 'inset 0 1px 0 0 var(--inner-glow), 0 -4px 24px rgba(0,0,0,0.15)',
          }}
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

/* ── Body (scrollable content — max 70dvh) ── */
function DrawerBody({ children, className }: { children: ReactNode; className?: string }) {
  const bodyRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={bodyRef}
      className={cn('px-5 pb-6 pt-4 space-y-4 overflow-y-auto overscroll-contain', className)}
      style={{ maxHeight: '70dvh' }}
    >
      {children}
    </div>
  );
}

/* ── Close (for programmatic close buttons) ── */
const DrawerClose = VaulDrawer.Close;

export { Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody, DrawerClose };
