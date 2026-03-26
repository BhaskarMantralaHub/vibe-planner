import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const alertVariants = cva(
  'rounded-xl border px-3 py-2.5 text-[14px]',
  {
    variants: {
      variant: {
        error: 'border-[var(--red)]/30 bg-[var(--red)]/10 text-[var(--red)]',
        success: 'border-[var(--green)]/30 bg-[var(--green)]/10 text-[var(--green)]',
        warning: 'border-[var(--orange)]/30 bg-[var(--orange)]/10 text-[var(--orange)]',
        info: 'border-[var(--blue)]/30 bg-[var(--blue)]/10 text-[var(--blue)]',
      },
    },
    defaultVariants: {
      variant: 'error',
    },
  }
);

interface AlertProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof alertVariants> {}

function Alert({ className, variant, children, ...props }: AlertProps) {
  if (!children) return null;
  return (
    <div className={cn(alertVariants({ variant }), className)} role="alert" {...props}>
      {children}
    </div>
  );
}

export { Alert, alertVariants };
export type { AlertProps };
