'use client';

import { useRouter } from 'next/navigation';
import type { ComponentType } from 'react';
import {
  InteractiveMenu,
  type InteractiveMenuItem,
} from '@/components/ui/modern-mobile-menu';

type NavIcon = ComponentType<{ size?: number; className?: string }>;

/**
 * One floating-pill nav for every cricket sub-route. Each surface declares
 * its own items config — view-tabs (in-page state toggle) and route-links
 * (cross-section navigation) live side by side. Tapping the already-active
 * item scrolls the page to top (Twitter / Instagram convention).
 */
export type CricketSectionNavItem =
  | {
      kind: 'view';
      key: string;
      label: string;
      icon: NavIcon;
      count?: number;
    }
  | {
      kind: 'route';
      key: string;
      label: string;
      icon: NavIcon;
      href: string;
      count?: number;
    };

interface CricketSectionNavProps {
  items: CricketSectionNavItem[];
  activeKey: string;
  /** Fires when a `view` item is tapped (and isn't already active). */
  onViewChange?: (key: string) => void;
  /** Fires when the already-active item is tapped (just before scroll-to-top).
   *  Useful for cleaning up open menus / drawers in the parent. */
  onActiveTap?: () => void;
}

export default function CricketSectionNav({
  items,
  activeKey,
  onViewChange,
  onActiveTap,
}: CricketSectionNavProps) {
  const router = useRouter();

  const menuItems: InteractiveMenuItem[] = items.map((item) => ({
    label: item.label,
    icon: item.icon,
    count: item.count,
  }));

  const activeIdx = items.findIndex((item) => item.key === activeKey);

  const handleClick = (i: number) => {
    const item = items[i];
    if (i === activeIdx) {
      // Tap-on-active → let parent clean up first, then scroll to top.
      onActiveTap?.();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    if (item.kind === 'view') {
      onViewChange?.(item.key);
    } else {
      router.push(item.href);
    }
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40"
      style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <InteractiveMenu
        items={menuItems}
        accentColor="var(--cricket)"
        activeIndex={activeIdx >= 0 ? activeIdx : 0}
        onItemClick={handleClick}
      />
    </div>
  );
}
