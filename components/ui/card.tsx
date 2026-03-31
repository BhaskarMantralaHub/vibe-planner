import { cn } from '@/lib/utils';
import { cva, type VariantProps } from 'class-variance-authority';

const cardVariants = cva(
  'rounded-2xl border border-[var(--border)] bg-[var(--card)]',
  {
    variants: {
      padding: {
        none: '',
        sm: 'p-4',
        md: 'p-6',
        lg: 'p-8',
      },
      shadow: {
        none: '',
        default: 'shadow-xl',
        hover: 'shadow-xl hover:shadow-2xl transition-shadow',
      },
      surface: {
        solid: '',
        gradient: 'bg-gradient-to-br from-[var(--card)] to-[var(--card-end)] border-[var(--border)]/60',
        glass: 'backdrop-blur-xl bg-[var(--glass)] border-[var(--border)]/40 shadow-[inset_0_1px_0_0_var(--inner-glow)]',
        elevated: 'bg-[var(--elevated)] shadow-[inset_0_1px_0_0_var(--inner-glow)]',
      },
      animate: {
        true: 'animate-slide-in',
      },
    },
    defaultVariants: {
      padding: 'lg',
      shadow: 'default',
      surface: 'solid',
    },
  }
);

interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

function Card({ className, padding, shadow, surface, animate, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ padding, shadow, surface, animate }), className)} {...props}>
      {children}
    </div>
  );
}

export { Card, cardVariants };
export type { CardProps };
