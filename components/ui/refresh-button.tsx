'use client';

import { useState } from 'react';
import { MdRefresh } from 'react-icons/md';
import { cn } from '@/lib/utils';

type RefreshVariant = 'bordered' | 'glass';

interface RefreshButtonProps {
  onRefresh: () => Promise<void>;
  variant?: RefreshVariant;
  size?: number;
  className?: string;
  title?: string;
}

function RefreshButton({ onRefresh, variant = 'bordered', size = 18, className, title = 'Refresh' }: RefreshButtonProps) {
  const [refreshing, setRefreshing] = useState(false);

  const handleClick = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <button
      onClick={handleClick}
      disabled={refreshing}
      className={cn(
        'h-8 w-8 flex items-center justify-center rounded-lg cursor-pointer',
        'active:scale-[0.92] transition-all',
        variant === 'bordered' && 'border border-[var(--cricket)]/30 hover:bg-[var(--cricket)]/10',
        variant === 'glass' && 'bg-white/15 hover:bg-white/25',
        refreshing && 'opacity-50 cursor-not-allowed',
        className,
      )}
      title={title}
    >
      <MdRefresh
        size={size}
        className={cn(
          variant === 'bordered' ? 'text-[var(--cricket)]' : 'text-white',
          refreshing && 'animate-spin',
        )}
      />
    </button>
  );
}

export { RefreshButton };
export type { RefreshButtonProps };
