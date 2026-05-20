'use client';

import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { CalendarDays, CircleCheckBig, BarChart3, LayoutGrid, Camera } from 'lucide-react';
import LeagueStatsView from './components/LeagueStatsView';
import CricketSectionNav, { type CricketSectionNavItem } from '../components/CricketSectionNav';

const NAV_ITEMS: CricketSectionNavItem[] = [
  { kind: 'route', key: 'upcoming', label: 'Upcoming', icon: CalendarDays, href: '/cricket/schedule#upcoming' },
  { kind: 'route', key: 'completed', label: 'Completed', icon: CircleCheckBig, href: '/cricket/schedule#completed' },
  { kind: 'route', key: 'stats', label: 'Stats', icon: BarChart3, href: '/cricket/league-stats' },
  { kind: 'route', key: 'moments', label: 'Moments', icon: Camera, href: '/cricket/moments' },
  { kind: 'route', key: 'home', label: 'Home', icon: LayoutGrid, href: '/cricket' },
];

// Hero is now owned by LeagueStatsView (its CompactHero) so it can be sticky
// and reflect tab-specific theming. page.tsx is just the wrapper + auth gate +
// bottom nav now.
export default function LeagueStatsPage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <div className="px-4 pt-2 pb-32 space-y-3">
          <LeagueStatsView />
          <CricketSectionNav items={NAV_ITEMS} activeKey="stats" />
        </div>
      </RoleGate>
    </AuthGate>
  );
}
