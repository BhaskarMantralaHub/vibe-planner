import { cn } from '@/lib/utils';

interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  uppercase?: boolean;
}

function Label({ className, uppercase, children, ...props }: LabelProps) {
  return (
    <label
      className={cn(
        uppercase
          ? 'text-[11px] font-semibold uppercase tracking-wider text-[var(--dim)]'
          : 'text-[13px] font-medium text-[var(--muted)]',
        className
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export { Label };
export type { LabelProps };
