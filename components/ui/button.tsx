'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from '@radix-ui/react-slot';
import { useCallback } from 'react';
import { cn } from '@/lib/utils';
import { useBrand } from '@/lib/brand';
import { haptic, type HapticPattern } from '@/lib/haptics';

const buttonVariants = cva(
  // Press: small compression + slight dim, returning on the fast token — the
  // tactile "button travels" feel without bounce. 0.97 not 0.9x-something
  // aggressive: these are 40-52px controls.
  'inline-flex items-center justify-center gap-2 whitespace-nowrap font-medium cursor-pointer select-none transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-45 disabled:saturate-50 disabled:shadow-none disabled:cursor-not-allowed active:scale-[0.97] active:brightness-95',
  {
    variants: {
      variant: {
        primary: '',
        // Apple's three filled styles: filled (primary), gray (secondary),
        // tinted. Flat — no borders, no glows; depth belongs to cards.
        secondary: 'bg-[var(--fill)] text-[var(--text)]',
        tinted: '',
        danger: 'bg-[var(--danger-fill)] text-white',
        // Name kept for existing call sites; renders as a red TINTED button.
        'danger-outline': 'bg-[var(--red)]/12 text-[var(--danger-text)]',
        ghost: 'text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] active:bg-[var(--hover-bg)]',
        link: 'text-[var(--toolkit)] underline-offset-4 hover:underline p-0 h-auto',
      },
      size: {
        sm: 'h-8 px-3 text-[12px] rounded-lg',
        md: 'h-10 px-4 text-[14px] rounded-xl font-semibold',
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
      // Primary + cricket = solid brand blue, flat like an iOS filled button.
      // Text is --cricket-on so a future accent can choose its own ink.
      // Disabled (but not loading) goes iOS gray rather than a faded blue —
      // 45% blue with a desaturate filter rendered as muddy slate.
      { variant: 'primary', brand: 'cricket', class: 'bg-[var(--cricket)] text-[var(--cricket-on)] [&:disabled:not([data-loading])]:bg-[var(--fill)] [&:disabled:not([data-loading])]:text-[var(--dim)] [&:disabled:not([data-loading])]:opacity-100 [&:disabled:not([data-loading])]:saturate-100' },
      // Tinted = the accent at low strength, accent text. For secondary
      // actions that should still read as tappable (Share, Add to calendar).
      { variant: 'tinted', brand: 'cricket', class: 'bg-[var(--cricket)]/12 text-[var(--cricket)]' },
      { variant: 'tinted', brand: 'toolkit', class: 'bg-[var(--toolkit)]/12 text-[var(--toolkit)]' },
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
  /**
   * Vibrate on activation. OPT-IN, and deliberately so.
   *
   * The press animation is free and applies to every button (it is in the
   * CVA base string above). Haptics are not free — they are a scarce signal,
   * and a codebase where every Button vibrates is one where none of them
   * mean anything. Making this a prop rather than a variant default also
   * makes the set auditable: `grep -rn 'haptic=' ` lists every control in the
   * app that buzzes.
   *
   * Reach for it on commitments (Save, Confirm, Copy, Share, Mark paid,
   * Generate, Revoke) — not on Cancel, not on a button that only opens a
   * sheet, and not on navigation.
   *
   * A no-op wherever the platform cannot vibrate, iOS included. See
   * `lib/haptics.ts`.
   */
  haptic?: HapticPattern;
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
  haptic: hapticPattern,
  onClick,
  children,
  ref,
  ...props
}: ButtonProps & { ref?: React.Ref<HTMLButtonElement> }) {
  const { brand: contextBrand } = useBrand();
  const brand = brandProp ?? contextBrand;
  const inert = disabled || loading;

  /**
   * Haptics fire on ACTIVATION only — click, which is also what the keyboard
   * (Enter/Space on a real <button>) and assistive tech dispatch. Never on
   * focus, hover or pointerdown, so tabbing through a form is silent and a
   * drag that starts on a button but ends elsewhere does not buzz.
   *
   * The `inert` guard is belt-and-braces: React does not dispatch click on a
   * disabled <button>, and the CVA base adds `disabled:pointer-events-none`.
   * It matters in the asChild case, where the child may be an <a> for which
   * `disabled` is meaningless and therefore is not forwarded.
   */
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      if (inert) return;
      if (hapticPattern) haptic(hapticPattern);
      onClick?.(e);
    },
    [inert, hapticPattern, onClick],
  );
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
        onClick={handleClick}
        {...props}
      >
        {children}
      </Slot>
    );
  }

  return (
    <button
      className={cn(buttonVariants({ variant, size, fullWidth, brand }), className)}
      disabled={inert}
      data-loading={loading || undefined}
      ref={ref}
      onClick={handleClick}
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
