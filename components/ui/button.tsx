'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { useBrand } from '@/lib/brand';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium cursor-pointer select-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.96] active:brightness-95',
  {
    variants: {
      variant: {
        primary: '',
        secondary: 'bg-[var(--surface)] text-[var(--text)] border border-[var(--border)] hover:bg-[var(--hover-bg)] hover:border-[var(--muted)]/30',
        danger: 'bg-[var(--red)] text-white hover:brightness-110 hover:-translate-y-[1px] shadow-md hover:shadow-lg',
        'danger-outline': 'border border-[var(--red)]/30 text-[var(--red)] hover:bg-[var(--red)]/10 hover:border-[var(--red)]/50',
        ghost: 'text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)]',
        link: 'text-[var(--purple)] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-[12px] rounded-lg',
        md: 'h-10 px-4 text-[14px] rounded-xl',
        lg: 'h-12 px-5 text-[15px] rounded-xl font-semibold',
        xl: 'h-[52px] px-6 text-[16px] rounded-xl font-semibold',
        icon: 'h-10 w-10 rounded-lg',
        'icon-sm': 'h-8 w-8 rounded-lg',
      },
      fullWidth: {
        true: 'w-full',
      },
      brand: {
        toolkit: '',
        cricket: '',
      },
    },
    compoundVariants: [
      // Primary + toolkit = purple gradient
      { variant: 'primary', brand: 'toolkit', class: 'bg-gradient-to-r from-[var(--purple)] to-[var(--indigo)] text-white shadow-lg hover:shadow-xl hover:-translate-y-[1px] hover:brightness-110' },
      // Primary + cricket = orange gradient
      { variant: 'primary', brand: 'cricket', class: 'bg-gradient-to-r from-[var(--cricket)] to-[var(--cricket-accent)] text-white shadow-lg hover:shadow-xl hover:-translate-y-[1px] hover:brightness-110' },
      // Link + cricket = orange
      { variant: 'link', brand: 'cricket', class: 'text-[var(--cricket)]' },
      // Ghost + icon = round
      { variant: 'ghost', size: 'icon', class: 'rounded-full' },
      { variant: 'ghost', size: 'icon-sm', class: 'rounded-full' },
    ],
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      brand: 'toolkit',
    },
  }
);

type ButtonVariantProps = VariantProps<typeof buttonVariants>;

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, Omit<ButtonVariantProps, 'brand'> {
  asChild?: boolean;
  loading?: boolean;
  brand?: 'toolkit' | 'cricket';
}

function Button({
  className,
  variant,
  size,
  fullWidth,
  brand: brandProp,
  asChild = false,
  loading = false,
  disabled,
  children,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const { brand: contextBrand } = useBrand();
  const brand = brandProp ?? contextBrand;
  const Comp = asChild ? Slot : 'button';

  return (
    <Comp
      className={cn(buttonVariants({ variant, size, fullWidth, brand }), className)}
      disabled={disabled || loading}
      ref={ref}
      {...props}
    >
      {loading && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </Comp>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
