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
              className="relative flex-1 flex flex-col items-center justify-center gap-1 px-2 py-3 min-h-[56px] text-sm font-semibold transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[var(--ring)]"
              style={{
                color: isActive ? tab.color : 'var(--muted)',
                // Faint category-tinted background on the active tab — gives
                // the tab a sense of "lit up" rather than just colored text.
                background: isActive
                  ? `linear-gradient(180deg, color-mix(in srgb, ${tab.color} 9%, transparent) 0%, transparent 100%)`
                  : 'transparent',
              }}
            >
              <span
                className="inline-flex shrink-0 transition-transform duration-200"
                style={{
                  // Active icon nudges up + scales slightly — feels like
                  // it's "stepping forward" instead of just changing color.
                  transform: isActive ? 'translateY(-1px) scale(1.08)' : 'none',
                  filter: isActive
                    ? `drop-shadow(0 2px 6px color-mix(in srgb, ${tab.color} 45%, transparent))`
                    : 'none',
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
        {/* Sliding underline — smoother spring-out easing curve. Adds a
            soft accent-tinted glow below the bar so the underline feels
            like a stadium spotlight, not a flat divider. */}
        <div
          aria-hidden="true"
          className="absolute bottom-0 left-0 h-[3px] w-1/4 rounded-full"
          style={{
            transform: `translateX(${activeIndex * 100}%)`,
            backgroundColor: activeColor,
            transition: 'transform 320ms cubic-bezier(0.16, 1, 0.3, 1), background-color 200ms ease-out',
            boxShadow: `0 0 12px color-mix(in srgb, ${activeColor} 55%, transparent), 0 0 2px color-mix(in srgb, ${activeColor} 80%, transparent)`,
          }}
        />
      </div>
    </div>
  );
}
