'use client';

import { cn } from '@/lib/utils';

/* ── Capsule Tab Bar — active tab expands with icon+text, inactive shows icon only ── */

interface CapsuleTab {
  key: string;
  label: string;
  icon: React.ReactNode;
  badge?: number;
}

interface CapsuleTabsProps {
  tabs: CapsuleTab[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}

function CapsuleTabs({ tabs, active, onChange, className }: CapsuleTabsProps) {
  return (
    <div className={cn('flex items-center gap-1.5 rounded-2xl bg-[var(--surface)] border border-[var(--border)] p-1.5', className)}>
      {tabs.map((t) => {
        const isActive = active === t.key;
        const badge = t.badge ?? 0;
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`relative flex items-center justify-center rounded-full overflow-hidden select-none cursor-pointer transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] active:scale-[0.92] ${
              isActive
                ? 'gap-2 px-4 py-2.5 max-w-[160px] text-white'
                : 'w-11 max-w-[44px] py-2.5 text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--hover-bg)]'
            }`}
            style={isActive ? {
              background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
              boxShadow: '0 0 16px var(--cricket-glow)',
              border: '1.5px solid color-mix(in srgb, var(--cricket) 60%, white)',
            } : {
              background: 'transparent',
              boxShadow: '0 0 0px transparent',
              border: '1.5px solid transparent',
            }}
          >
            <span className="flex-shrink-0 w-5 flex items-center justify-center transition-transform duration-300">{t.icon}</span>
            <span className={`whitespace-nowrap text-[12px] font-bold transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] ${
              isActive
                ? 'opacity-100 translate-x-0 delay-75'
                : 'opacity-0 -translate-x-2 absolute pointer-events-none'
            }`}>{t.label}</span>
            {badge > 0 && isActive && (
              <span
                className="flex-shrink-0 flex items-center justify-center rounded-full text-[9px] font-extrabold leading-none h-5 min-w-[20px] px-1 text-white transition-all duration-300 delay-75"
                style={{ background: 'rgba(255,255,255,0.25)' }}
              >
                {badge}
              </span>
            )}
            {badge > 0 && !isActive && (
              <span
                className="absolute top-1 right-1 h-[6px] w-[6px] rounded-full transition-all duration-300"
                style={{ background: 'var(--cricket)' }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

export { CapsuleTabs };
export type { CapsuleTab, CapsuleTabsProps };
