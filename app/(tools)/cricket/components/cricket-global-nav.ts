import { Wallet, CalendarDays, Camera, Users } from 'lucide-react';
import UmpireIcon from '@/components/icons/UmpireIcon';
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
  // Label "Roster", key stays 'players' — one product vocabulary with the
  // hamburger's Roster entry (same precedent as the Fielding tab keeping the
  // 'catches' key). Renaming the key would touch routing/state for a label.
  // Icon matches the hamburger's Roster entry (Users), not the old batsman.
  { kind: 'route', key: 'players', label: 'Roster', icon: Users, href: '/cricket#players' },
  // Wallet = the whole financial hub, not just expense receipts
  { kind: 'route', key: 'finances', label: 'Finances', icon: Wallet, href: '/cricket#expenses' },
  { kind: 'route', key: 'matches', label: 'Matches', icon: CalendarDays, href: '/cricket/schedule' },
  { kind: 'route', key: 'umpiring', label: 'Umpiring', icon: UmpireIcon, href: '/cricket/umpiring' },
  { kind: 'route', key: 'moments', label: 'Moments', icon: Camera, href: '/cricket/moments' },
];
