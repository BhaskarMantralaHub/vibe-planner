'use client';

import { useState } from 'react';
import { Filter, X } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FilterOption {
  key: string;
  label: string;
  count: number;
}

interface FilterDropdownProps {
  options: FilterOption[];
  value: string;
  onChange: (key: string) => void;
  allLabel?: string;
  allCount?: number;
  brand?: 'toolkit' | 'cricket';
  className?: string;
}

const brandColors = {
  toolkit: {
    icon: 'text-[var(--toolkit)]',
    badge: 'bg-[var(--toolkit)]/15 text-[var(--toolkit)]',
    badgeActive: 'bg-[var(--toolkit)]/20 text-[var(--toolkit)]',
    active: 'bg-[var(--toolkit)]/15 text-[var(--toolkit)]',
  },
  cricket: {
    icon: 'text-[var(--cricket)]',
    badge: 'bg-[var(--cricket)]/15 text-[var(--cricket)]',
    badgeActive: 'bg-[var(--cricket)]/20 text-[var(--cricket)]',
    active: 'bg-[var(--cricket)]/15 text-[var(--cricket)]',
  },
};

export function FilterDropdown({
  options,
  value,
  onChange,
  allLabel = 'All',
  allCount,
  brand = 'toolkit',
  className,
}: FilterDropdownProps) {
  const [open, setOpen] = useState(false);
  const colors = brandColors[brand];

  const allOption: FilterOption = {
    key: '',
    label: allLabel,
    count: allCount ?? options.reduce((sum, o) => sum + o.count, 0),
  };
  const allOptions = [allOption, ...options];

  const activeOption = allOptions.find((o) => o.key === value) ?? allOption;

  return (
    <div className={cn('relative', className)}>
      {/* Trigger */}
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted)] text-[var(--text)]"
      >
        <Filter size={15} className={colors.icon} />
        <span>{activeOption.label}</span>
        <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-md ${colors.badge}`}>
          {activeOption.count}
        </span>
        {value && (
          <span
            onClick={(e) => { e.stopPropagation(); onChange(''); setOpen(false); }}
            className="ml-1 w-5 h-5 flex items-center justify-center rounded-full hover:bg-[var(--hover-bg)] text-[var(--dim)] hover:text-[var(--text)]"
          >
            <X size={12} />
          </span>
        )}
      </button>

      {/* Dropdown */}
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute left-0 top-12 z-50 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-2 shadow-2xl min-w-[200px] animate-[scaleIn_0.15s]">
            {allOptions.map((opt) => {
              const isActive = value === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={() => { onChange(isActive && opt.key ? '' : opt.key); setOpen(false); }}
                  className={`flex items-center justify-between w-full px-3 py-2.5 rounded-xl text-[14px] font-medium transition-all cursor-pointer ${
                    isActive ? colors.active : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                  }`}
                >
                  <span>{opt.label}</span>
                  <span className={`text-[12px] font-bold px-1.5 py-0.5 rounded-md ${
                    isActive ? colors.badgeActive : 'bg-[var(--border)] text-[var(--dim)]'
                  }`}>{opt.count}</span>
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
