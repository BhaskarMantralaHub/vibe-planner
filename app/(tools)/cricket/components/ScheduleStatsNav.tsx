'use client';

import { useRouter } from 'next/navigation';
import { CalendarDays, CircleCheckBig, BarChart3 } from 'lucide-react';
import {
  InteractiveMenu,
  type InteractiveMenuItem,
} from '@/components/ui/modern-mobile-menu';

type Key = 'upcoming' | 'completed' | 'stats';

interface ScheduleStatsNavProps {
  activeKey: Key;
  upcomingCount?: number;
  completedCount?: number;
  /**
   * Local handler for Upcoming/Completed taps — when provided, no route change happens.
   * Used on the schedule page where these are view-tab toggles. Omit on the stats page;
   * we'll fall back to URL-hash navigation back to /cricket/schedule.
   */
  onScheduleTab?: (tab: 'upcoming' | 'completed') => void;
}

export default function ScheduleStatsNav({
  activeKey,
  upcomingCount = 0,
  completedCount = 0,
  onScheduleTab,
}: ScheduleStatsNavProps) {
  const router = useRouter();

  const items: InteractiveMenuItem[] = [
    { label: 'Upcoming', icon: CalendarDays, count: upcomingCount },
    { label: 'Completed', icon: CircleCheckBig, count: completedCount },
    { label: 'Stats', icon: BarChart3 },
  ];

  const activeIdx = activeKey === 'upcoming' ? 0 : activeKey === 'completed' ? 1 : 2;

  const handleClick = (i: number) => {
    if (i === 2) {
      router.push('/cricket/league-stats');
      return;
    }
    const tab = i === 0 ? 'upcoming' : 'completed';
    if (onScheduleTab) onScheduleTab(tab);
    else router.push(`/cricket/schedule#${tab}`);
  };

  return (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-40"
      style={{ bottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}
    >
      <InteractiveMenu
        items={items}
        accentColor="var(--cricket)"
        activeIndex={activeIdx}
        onItemClick={handleClick}
      />
    </div>
  );
}
