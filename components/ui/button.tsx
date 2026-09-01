'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { cn } from '@/lib/utils';
import { useBrand } from '@/lib/brand';

const buttonVariants = cva(
  // Press: small compression + slight dim, returning on the fast token — the
  // tactile "button travels" feel without bounce. 0.97 not 0.9x-something
  // aggressive: these are 40-52px controls.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium cursor-pointer select-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 disabled:shadow-none disabled:cursor-not-allowed active:scale-[0.97] active:brightness-95',
  {
    variants: {
      variant: {
        primary: '',
        secondary: 'bg-[var(--card)] text-[var(--text)] border border-[var(--border)]/70 shadow-[0_1px_2px_rgba(16,24,40,0.05)] hover:bg-[var(--hover-bg)] active:bg-[var(--hover-bg)]',
        danger: 'bg-[var(--red)] text-white hover:brightness-110 shadow-[0_1px_2px_rgba(0,0,0,0.1),0_4px_12px_rgba(239,68,68,0.25)] active:shadow-[0_1px_3px_rgba(239,68,68,0.2)]',
        'danger-outline': 'border border-[var(--red)]/30 text-[var(--red)] hover:bg-[var(--red)]/10 hover:border-[var(--red)]/50',
        ghost: 'text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] active:bg-[var(--hover-bg)]',
        link: 'text-[var(--toolkit)] underline-offset-4 hover:underline p-0 h-auto',
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
      // Primary + toolkit = brand-blue gradient
      { variant: 'primary', brand: 'toolkit', class: 'bg-gradient-to-br from-[var(--toolkit)] to-[var(--toolkit-accent)] text-white shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_14px_var(--toolkit-glow)] active:shadow-[0_1px_4px_var(--toolkit-glow)] hover:brightness-110' },
      // Primary + cricket = SOLID Sunrisers orange — a confident single fill,
      // not a gradient-for-gradient's-sake. Text is --cricket-on, NOT white:
      // dark mode uses a luminous orange fill that needs dark text for contrast.
      // The shadow drops on press — the button visually settles into the page.
      { variant: 'primary', brand: 'cricket', class: 'bg-[var(--cricket)] text-[var(--cricket-on)] shadow-[0_1px_2px_rgba(0,0,0,0.08),0_4px_14px_var(--cricket-glow)] active:shadow-[0_1px_4px_var(--cricket-glow)] hover:brightness-110' },
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
  // Radix Slot requires EXACTLY ONE child (React.Children.only). Rendering the
  // spinner as a sibling made `children` an array, so `asChild` threw
  // "React.Children.only expected to receive a single React element child"
  // every time — even with loading=false, because [false, <child/>] is still an
  // array. asChild was therefore unusable; this branch makes it work.
  //
  // A slotted child also cannot show the spinner (there is nowhere to put it
  // without breaking Children.only), and `disabled` is meaningless on an <a>,
  // so neither is forwarded here.
  if (asChild) {
    return (
      <Slot
        className={cn(buttonVariants({ variant, size, fullWidth, brand }), className)}
        ref={ref}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth, brand }), className)}
      disabled={disabled || loading}
      ref={ref}
      {...props}
    >
      {loading && (
        <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      )}
      {children}
    </button>
  );
}

export { Button, buttonVariants };
export type { ButtonProps };
