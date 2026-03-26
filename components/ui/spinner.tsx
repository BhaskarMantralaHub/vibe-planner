'use client';

import { cn } from '@/lib/utils';
import { useBrand } from '@/lib/brand';

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  brand?: 'toolkit' | 'cricket';
  color?: string;
}

const sizes = {
  sm: 'h-4 w-4 border-2',
  md: 'h-6 w-6 border-2',
  lg: 'h-8 w-8 border-2',
};

const brandColors = {
  toolkit: 'border-[var(--purple)]',
  cricket: 'border-[var(--orange)]',
};

function Spinner({ size = 'md', brand: brandProp, color, className, ...props }: SpinnerProps) {
  const { brand: contextBrand } = useBrand();
  const brand = brandProp ?? contextBrand;

  return (
    <div
      className={cn(
        'animate-spin rounded-full border-t-transparent',
        sizes[size],
        color ? '' : brandColors[brand],
        className
      )}
      style={color ? { borderColor: color, borderTopColor: 'transparent' } : undefined}
      role="status"
      aria-label="Loading"
      {...props}
    />
  );
}

export { Spinner };
export type { SpinnerProps };
