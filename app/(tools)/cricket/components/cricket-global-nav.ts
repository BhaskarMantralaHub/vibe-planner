import { Receipt, CalendarDays, Camera } from 'lucide-react';
import UmpireIcon from '@/components/icons/UmpireIcon';
import CricketPlayerIcon from '@/components/icons/CricketPlayerIcon';
import type { CricketSectionNavItem } from './CricketSectionNav';

/**
 * THE global navigation for the cricket app — one vocabulary, every page.
 *
 * Before this existed, each page shipped its own bottom-bar item set
 * (Matches had Upcoming/Completed/Stats/Moments/Home, Umpiring had another
 * five, Moments a third), so the dock changed meaning under the user's thumb
 * as they moved around. The dock now always answers "where am I in the app";
 * a section's internal views (Upcoming/Completed/Stats on Matches) are
 * CONTEXTUAL navigation and belong at the top of that section's content,
 * not in the dock.
 *
 * The dashboard page (/cricket) keeps its own view-kind items for Players
 * and Finances — same five destinations, but two of them are in-page views
 * there rather than routes. Everything else passes this constant with the
 * page's own `activeKey` ('matches' | 'umpiring' | 'moments'; league-stats
 * is part of the Matches section and uses 'matches').
 */
export const CRICKET_GLOBAL_NAV: CricketSectionNavItem[] = [
  { kind: 'route', key: 'players', label: 'Players', icon: CricketPlayerIcon, href: '/cricket#players' },
  { kind: 'route', key: 'finances', label: 'Finances', icon: Receipt, href: '/cricket#expenses' },
  { kind: 'route', key: 'matches', label: 'Matches', icon: CalendarDays, href: '/cricket/schedule' },
  { kind: 'route', key: 'umpiring', label: 'Umpiring', icon: UmpireIcon, href: '/cricket/umpiring' },
  { kind: 'route', key: 'moments', label: 'Moments', icon: Camera, href: '/cricket/moments' },
];
