'use client';

import { MdSportsCricket } from 'react-icons/md';
import { GiTennisBall } from 'react-icons/gi';
import { Star, Hand } from 'lucide-react';
import type { ComponentType, JSX } from 'react';

export type StickyTabKey = 'batting' | 'bowling' | 'allround' | 'catches';

export type StickyPillTabsProps = {
  active: StickyTabKey;
  onChange: (key: StickyTabKey) => void;
  /** Whether the bar should be sticky-top (defaults true). False useful for tests. */
  sticky?: boolean;
  /** Top offset for sticky positioning when another sticky element sits above. */
  stickyTop?: string;
};

type TabDef = {
  key: StickyTabKey;
  label: string;
  Icon: ComponentType<{ className?: string; size?: number }>;
  color: string;
};

const TABS: ReadonlyArray<TabDef> = [
  { key: 'batting', label: 'Batting', Icon: MdSportsCricket, color: 'var(--stat-batting)' },
  { key: 'bowling', label: 'Bowling', Icon: GiTennisBall, color: 'var(--stat-bowling)' },
  { key: 'allround', label: 'All-Round', Icon: Star, color: 'var(--stat-allround)' },
  { key: 'catches', label: 'Catches', Icon: Hand, color: 'var(--stat-catches)' },
];

export default function StickyPillTabs({
  active,
  onChange,
  sticky = true,
  stickyTop = '0',
}: StickyPillTabsProps): JSX.Element {
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => t.key === active),
  );
  const activeColor = TABS[activeIndex].color;

  return (
    <div
      className={`${sticky ? 'sticky z-30 backdrop-blur-md' : ''} border-b border-[var(--border)]/50`}
      style={sticky ? {
        top: stickyTop,
        // Translucent surface + blur — content scrolling beneath peeks
        // through faintly. Reads as a glass tab bar, not a flat divider.
        background: 'color-mix(in srgb, var(--bg) 78%, transparent)',
      } : undefined}
    >
      <div
        role="tablist"
        aria-label="Player stats categories"
        className="relative flex items-stretch w-full"
      >
        {TABS.map((tab) => {
          const isActive = tab.key === active;
          const { Icon } = tab;
          return (
            <button
              key={tab.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              className="relative flex-1 flex flex-col items-center justify-center gap-1 px-2 py-3 min-h-[56px] text-sm font-semibold transition-all duration-200 rounded-t-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--ring)]"
              style={{
                color: isActive ? tab.color : 'var(--muted)',
                // Active tab reads as a bordered box anchored to the divider —
                // a clear, calm "selected" container (no gradient/glow). Use
                // explicit per-side borders (not the `border` shorthand) so we
                // don't mix shorthand + longhand in one style object.
                background: isActive ? 'var(--card)' : 'transparent',
                borderTop: isActive ? '1px solid var(--border)' : '1px solid transparent',
                borderLeft: isActive ? '1px solid var(--border)' : '1px solid transparent',
                borderRight: isActive ? '1px solid var(--border)' : '1px solid transparent',
                borderBottom: '1px solid transparent',
              }}
            >
              <span
                className="inline-flex shrink-0 transition-transform duration-200"
                style={{
                  transform: isActive ? 'scale(1.05)' : 'none',
                }}
              >
                <Icon size={18} className="shrink-0" />
              </span>
              <span
                className="leading-none transition-all duration-200"
                style={{ fontWeight: isActive ? 700 : 600 }}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
        {/* Sliding underline — solid accent bar, no glow. Sits on the bar's
            bottom divider to anchor the active tab box above it. */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[2px] w-1/4 rounded-full"
          style={{
            transform: `translateX(${activeIndex * 100}%)`,
            backgroundColor: activeColor,
            transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms ease-out',
          }}
        />
      </div>
    </div>
  );
}
