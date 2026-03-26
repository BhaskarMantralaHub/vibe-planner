'use client';

import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';

interface EmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  brand?: 'toolkit' | 'cricket';
  action?: {
    label: string;
    onClick: () => void;
    variant?: ButtonProps['variant'];
  };
}

function EmptyState({ icon, title, description, action, brand, className, ...props }: EmptyStateProps) {
  return (
    <div className={cn('flex flex-col items-center justify-center py-16 px-4 text-center', className)} {...props}>
      {icon && <div className="mb-4 text-4xl">{icon}</div>}
      <h3 className="mb-1 text-[16px] font-semibold text-[var(--text)]">{title}</h3>
      {description && (
        <p className="mb-5 max-w-xs text-[13px] leading-relaxed text-[var(--muted)]">{description}</p>
      )}
      {action && (
        <Button variant={action.variant ?? 'primary'} size="md" brand={brand} onClick={action.onClick}>
          {action.label}
        </Button>
      )}
    </div>
  );
}

export { EmptyState };
export type { EmptyStateProps };
