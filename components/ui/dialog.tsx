'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { cn } from '@/lib/utils';

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
        'fixed inset-0 z-50 bg-black/50 backdrop-blur-sm',
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
  ref,
  ...props
}: DialogPrimitive.DialogContentProps & { showClose?: boolean; ref?: React.Ref<HTMLDivElement> }) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          'fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2',
          'rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-2xl',
          'data-[state=open]:animate-[dialogContentIn_200ms_ease-out]',
          'data-[state=closed]:animate-[dialogContentOut_150ms_ease-in]',
          className
        )}
        {...props}
      >
        {children}
        {showClose && (
          <DialogPrimitive.Close
            className="absolute right-4 top-4 rounded-lg p-1.5 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)] transition-colors cursor-pointer"
            aria-label="Close"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </DialogPrimitive.Close>
        )}
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
      className={cn('text-[18px] font-bold text-[var(--text)]', className)}
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
      className={cn('mt-1 text-[14px] text-[var(--muted)]', className)}
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
