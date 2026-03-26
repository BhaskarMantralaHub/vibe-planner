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
      animate: {
        true: 'animate-slide-in',
      },
    },
    defaultVariants: {
      padding: 'lg',
      shadow: 'default',
    },
  }
);

interface CardProps extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

function Card({ className, padding, shadow, animate, children, ...props }: CardProps) {
  return (
    <div className={cn(cardVariants({ padding, shadow, animate }), className)} {...props}>
      {children}
    </div>
  );
}

export { Card, cardVariants };
export type { CardProps };
