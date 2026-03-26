'use client';

import { cn } from '@/lib/utils';
import { useBrand } from '@/lib/brand';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  brand?: 'toolkit' | 'cricket';
}

const brandFocus = {
  toolkit: 'focus:border-[var(--purple)] focus:ring-1 focus:ring-[var(--purple)]/30',
  cricket: 'focus:border-[var(--orange)] focus:ring-1 focus:ring-[var(--orange)]/30',
};

function Input({
  className,
  label,
  error,
  brand: brandProp,
  id,
  ref,
  ...props
}: InputProps & { ref?: React.Ref<HTMLInputElement> }) {
  const { brand: contextBrand } = useBrand();
  const brand = brandProp ?? contextBrand;
  const inputId = id ?? label?.toLowerCase().replace(/\s+/g, '-');

  return (
    <div>
      {label && (
        <label htmlFor={inputId} className="mb-1 block text-[13px] font-medium text-[var(--muted)]">
          {label}
        </label>
      )}
      <input
        id={inputId}
        ref={ref}
        className={cn(
          'w-full rounded-xl border bg-[var(--surface)] px-4 py-3 text-[15px] text-[var(--text)] outline-none placeholder:text-[var(--dim)] transition-all',
          error
            ? 'border-[var(--red)] focus:border-[var(--red)] focus:ring-1 focus:ring-[var(--red)]/30'
            : `border-[var(--border)] ${brandFocus[brand]}`,
          className
        )}
        {...props}
      />
      {error && (
        <p className="mt-1 text-[12px] text-[var(--red)]">{error}</p>
      )}
    </div>
  );
}

export { Input, brandFocus };
export type { InputProps };
