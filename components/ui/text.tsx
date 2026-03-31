'use client';

import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

const textVariants = cva('', {
  variants: {
    size: {
      '2xs': 'text-[11px] leading-[0.875rem]',    // badges, timestamps, fine print
      'xs':  'text-[12px] leading-[1rem]',         // captions, metadata
      'sm':  'text-[13px] leading-[1.125rem]',     // secondary labels, card subtitles
      'md':  'text-[14px] leading-[1.25rem]',      // body text (DEFAULT)
      'lg':  'text-[16px] leading-[1.375rem]',     // emphasized body, section titles
      'xl':  'text-[20px] leading-[1.625rem]',     // page headings
      '2xl': 'text-[24px] leading-[1.75rem]',      // hero headings
      '3xl': 'text-[32px] leading-[2.25rem]',      // display / score numbers
      '4xl': 'text-[40px] leading-[2.75rem]',      // hero score numbers
    },
    weight: {
      light:    'font-light',       // timestamps, metadata, fine print
      normal:   'font-normal',      // body text, descriptions
      medium:   'font-medium',      // labels, nav items, secondary headings
      semibold: 'font-semibold',    // primary headings, card titles, important values
      bold:     'font-bold',        // rare: hero numbers, alerts
    },
    color: {
      default: 'text-[var(--text)]',
      muted:   'text-[var(--muted)]',
      dim:     'text-[var(--dim)]',
      accent:  'text-[var(--toolkit)]',
      cricket: 'text-[var(--cricket)]',
      danger:  'text-[var(--red)]',
      success: 'text-[var(--green)]',
      white:   'text-white',
    },
    tracking: {
      tight:  'tracking-tight',        // headings 20px+
      normal: 'tracking-normal',       // default
      wide:   'tracking-wide',         // uppercase labels
      wider:  'tracking-wider',        // uppercase small labels
    },
    align: {
      left:   'text-left',
      center: 'text-center',
      right:  'text-right',
    },
    uppercase: {
      true: 'uppercase',
    },
    truncate: {
      true: 'truncate',
    },
    tabular: {
      true: 'tabular-nums',
    },
  },
  compoundVariants: [
    { uppercase: true, size: '2xs', class: 'tracking-wider' },
    { uppercase: true, size: 'xs', class: 'tracking-wider' },
    { uppercase: true, size: 'sm', class: 'tracking-wide' },
    { uppercase: true, size: 'md', class: 'tracking-wide' },
  ],
  defaultVariants: {
    size: 'md',
    weight: 'normal',
    color: 'default',
    tracking: 'normal',
    align: 'left',
  },
});

type TextVariantProps = VariantProps<typeof textVariants>;

type TextElement = 'p' | 'span' | 'h1' | 'h2' | 'h3' | 'h4' | 'label' | 'div';

interface TextProps extends Omit<React.HTMLAttributes<HTMLElement>, 'color'>, TextVariantProps {
  as?: TextElement;
  htmlFor?: string;
}

function Text({
  as: Tag = 'span',
  size,
  weight,
  color,
  tracking,
  align,
  uppercase,
  truncate,
  tabular,
  className,
  children,
  htmlFor,
  ...props
}: TextProps) {
  const extraProps: Record<string, unknown> = {};
  if (htmlFor && Tag === 'label') extraProps.htmlFor = htmlFor;

  return (
    <Tag
      className={cn(textVariants({ size, weight, color, tracking, align, uppercase, truncate, tabular }), className)}
      {...extraProps}
      {...(props as React.HTMLAttributes<HTMLElement>)}
    >
      {children}
    </Tag>
  );
}

export { Text, textVariants };
export type { TextProps };
