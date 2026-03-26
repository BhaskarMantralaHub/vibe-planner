'use client';

import { cn } from '@/lib/utils';
import { Button, type ButtonProps } from './button';
import { Text } from './text';

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
      <Text as="h3" size="lg" weight="semibold" className="mb-1">{title}</Text>
      {description && (
        <Text as="p" size="sm" color="muted" className="mb-5 max-w-xs leading-relaxed">{description}</Text>
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
