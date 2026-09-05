'use client';

import { Check, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAsyncAction } from '@/hooks/use-async-action';

type RefreshVariant = 'bordered' | 'glass';

interface RefreshButtonProps {
  onRefresh: () => Promise<void>;
  variant?: RefreshVariant;
  size?: number;
  className?: string;
  title?: string;
}

/**
 * Refresh, with the three states a refresh actually has.
 *
 * The local `refreshing` boolean this used to keep could only say "in flight
 * or not", so a completed refresh looked identical to one that never
 * happened — on a fast connection the spinner flickered and the user had no
 * confirmation. useAsyncAction adds the third state and, importantly, only
 * enters it AFTER the passed promise resolves, so a failed refresh never
 * shows a tick.
 */
function RefreshButton({ onRefresh, variant = 'bordered', size = 18, className, title = 'Refresh' }: RefreshButtonProps) {
  const { run, pending, succeeded } = useAsyncAction(onRefresh, {
    tapHaptic: 'light',
    successHaptic: 'success',
    // Long enough to notice the tick, short enough that the control is back
    // to its normal affordance before anyone wants to tap it again.
    resetAfterMs: 1400,
    // Errors are the caller's to report — every current call site already
    // toasts inside its own loader. Swallowing here only stops an unhandled
    // rejection; `succeeded` staying false is what suppresses the tick.
    onError: () => {},
  });

  return (
    <button
      onClick={() => void run()}
      disabled={pending}
      className={cn(
        'h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer',
        'active:scale-[0.92] transition-all',
        variant === 'bordered' && 'border border-[var(--cricket)]/30 hover:bg-[var(--cricket)]/10',
        variant === 'glass' && 'bg-white/15 hover:bg-white/25',
        pending && 'opacity-50 cursor-not-allowed',
        className,
      )}
      title={title}
      aria-label={title}
      aria-busy={pending}
    >
      {succeeded ? (
        <Check
          size={size}
          className={cn(
            'animate-tactile-check',
            variant === 'bordered' ? 'text-[var(--green)]' : 'text-white',
          )}
        />
      ) : (
        <RefreshCw
          size={size}
          className={cn(
            variant === 'bordered' ? 'text-[var(--cricket)]' : 'text-white',
            pending && 'animate-spin',
          )}
        />
      )}
    </button>
  );
}

export { RefreshButton };
export type { RefreshButtonProps };
