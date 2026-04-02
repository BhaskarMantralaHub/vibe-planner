'use client';

import { cn } from '@/lib/utils';

/* ── Segmented Control — pill-style toggle matching capsule tab design ── */

interface SegmentOption {
  key: string;
  label: string;
}

interface SegmentedControlProps {
  options: SegmentOption[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
  ariaLabel?: string;
}

function SegmentedControl({ options, active, onChange, className, ariaLabel }: SegmentedControlProps) {
  return (
    <div role="tablist" aria-label={ariaLabel} className={cn('flex rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-1.5', className)}>
      {options.map((o) => (
        <button
          key={o.key}
          role="tab"
          aria-selected={active === o.key}
          onClick={() => onChange(o.key)}
          className={`flex-1 py-2.5 rounded-full text-[13px] font-semibold cursor-pointer select-none overflow-hidden transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.92] ${
            active === o.key
              ? 'text-white'
              : 'text-[var(--muted)] hover:text-[var(--text)]'
          }`}
          style={active === o.key ? {
            background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
            boxShadow: '0 0 12px var(--cricket-glow)',
            border: '1.5px solid color-mix(in srgb, var(--cricket) 60%, white)',
          } : {
            border: '1.5px solid transparent',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export { SegmentedControl };
export type { SegmentOption, SegmentedControlProps };
