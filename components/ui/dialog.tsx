'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';
import { textVariants } from './text';

const Dialog = DialogPrimitive.Root;
const DialogTrigger = DialogPrimitive.Trigger;
const DialogPortal = DialogPrimitive.Portal;
const DialogClose = DialogPrimitive.Close;

function DialogOverlay({
  className,
  ref,
  ...props
}: DialogPrimitive.DialogOverlayProps & { ref?: React.Ref<HTMLDivElement> }) {
  return (
    <DialogPrimitive.Overlay
      ref={ref}
      className={cn(
        // Dim only, no backdrop blur — see drawer.tsx for the perf rationale.
        'fixed inset-0 z-50 bg-black/50',
        'data-[state=open]:animate-[dialogOverlayIn_200ms_ease-out]',
        'data-[state=closed]:animate-[dialogOverlayOut_150ms_ease-in]',
        className
      )}
      {...props}
    />
  );
}

function DialogContent({
  className,
  children,
  showClose = true,
  closeLabel = 'Close',
  ref,
  ...props
}: DialogPrimitive.DialogContentProps & { showClose?: boolean; closeLabel?: string; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className="fixed inset-0 z-50 flex items-center justify-center px-4"
        {...props}
      >
        {/* Invisible close trigger — clicking the area outside the panel closes the dialog */}
        <DialogPrimitive.Close className="absolute inset-0 cursor-default" aria-label="Close dialog" />
        <div
          className={cn(
            'relative w-full max-w-md',
            'rounded-2xl border border-[var(--border)]/40 bg-[var(--card)] p-6 shadow-2xl',
            'data-[state=open]:animate-[dialogContentIn_200ms_ease-out]',
            'data-[state=closed]:animate-[dialogContentOut_150ms_ease-in]',
            className
          )}
        >
          {children}
          {showClose && (
            // p-3.5 + 16px icon = 44px hit target; right/top-1.5 keeps the
            // visible glyph within 2px of where the old 36px button drew it.
            <DialogPrimitive.Close
              className="absolute right-1.5 top-1.5 rounded-lg p-3.5 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)] transition-colors cursor-pointer"
              aria-label={closeLabel}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </DialogPrimitive.Close>
          )}
        </div>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
}

function DialogHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mb-5', className)} {...props} />;
}

function DialogFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('mt-6 flex justify-end gap-3', className)} {...props} />;
}

function DialogTitle({
  className,
  ref,
  ...props
}: DialogPrimitive.DialogTitleProps & { ref?: React.Ref<HTMLHeadingElement> }) {
  return (
    <DialogPrimitive.Title
      ref={ref}
      className={cn(textVariants({ size: 'lg', weight: 'bold' }), 'text-[18px]', className)}
      {...props}
    />
  );
}

function DialogDescription({
  className,
  ref,
  ...props
}: DialogPrimitive.DialogDescriptionProps & { ref?: React.Ref<HTMLParagraphElement> }) {
  return (
    <DialogPrimitive.Description
      ref={ref}
      className={cn(textVariants({ size: 'md', color: 'muted' }), 'mt-1', className)}
      {...props}
    />
  );
}

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTrigger,
  DialogClose,
  DialogTitle,
  DialogDescription,
};
