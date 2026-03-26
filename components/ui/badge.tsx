import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const badgeVariants = cva(
  'inline-flex items-center rounded-md font-bold',
  {
    variants: {
      variant: {
        purple: 'bg-[var(--purple)]/15 text-[var(--purple)]',
        orange: 'bg-[var(--orange)]/15 text-[var(--orange)]',
        red: 'bg-[var(--red)]/15 text-[var(--red)]',
        green: 'bg-[var(--green)]/15 text-[var(--green)]',
        blue: 'bg-[var(--blue)]/15 text-[var(--blue)]',
        muted: 'bg-[var(--surface)] text-[var(--dim)] border border-[var(--border)]',
      },
      size: {
        sm: 'text-[10px] px-1.5 py-0.5',
        md: 'text-[12px] px-2.5 py-0.5',
      },
    },
    defaultVariants: {
      variant: 'purple',
      size: 'md',
    },
  }
);

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, size, children, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant, size }), className)} {...props}>
      {children}
    </span>
  );
}

export { Badge, badgeVariants };
export type { BadgeProps };
