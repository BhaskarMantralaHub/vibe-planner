import { MdDashboard, MdBadge, MdAccountBalanceWallet, MdAdminPanelSettings, MdScoreboard, MdLeaderboard, MdSportsCricket, MdDateRange } from 'react-icons/md';

export type Tool = {
  name: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  roles?: string[];
  feature?: string;
};

export const tools: Tool[] = [
  {
    name: 'Vibe Planner',
    href: '/vibe-planner',
    icon: <MdDashboard size={22} />,
    description: 'Capture sparks. Plan actions. Track flow.',
    roles: ['toolkit', 'admin'],
    feature: 'vibe-planner',
  },
  {
    name: 'ID Tracker',
    href: '/id-tracker',
    icon: <MdBadge size={22} />,
    description: 'Track IDs & get expiry reminders.',
    roles: ['toolkit', 'admin'],
    feature: 'id-tracker',
  },
  {
    name: 'Cricket',
    href: '/cricket',
    icon: <MdAccountBalanceWallet size={22} />,
    description: 'Team expenses & dues.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Live Scoring',
    href: '/cricket/scoring',
    icon: <MdScoreboard size={22} />,
    description: 'Score matches ball-by-ball.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Practice Stats',
    href: '/cricket/scoring/leaderboard',
    icon: <MdLeaderboard size={22} />,
    description: 'Batting, bowling & fielding leaderboards.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'League Schedule',
    href: '/cricket/schedule',
    icon: <MdDateRange size={22} />,
    description: 'Upcoming matches & fixtures.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Coin Toss',
    href: '/cricket/toss',
    icon: <MdSportsCricket size={22} />,
    description: 'Fair, cryptographic coin flip.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: <MdAdminPanelSettings size={22} />,
    description: 'Users, activity & stats.',
    roles: ['admin'],
  },
];
