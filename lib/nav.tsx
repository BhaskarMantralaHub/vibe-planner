import { MdDashboard, MdBadge, MdAccountBalanceWallet, MdAdminPanelSettings, MdScoreboard, MdLeaderboard } from 'react-icons/md';

export type Tool = {
  name: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  roles?: string[];
};

export const tools: Tool[] = [
  {
    name: 'Vibe Planner',
    href: '/vibe-planner',
    icon: <MdDashboard size={22} />,
    description: 'Capture sparks. Plan actions. Track flow.',
    roles: ['toolkit', 'admin'],
  },
  {
    name: 'ID Tracker',
    href: '/id-tracker',
    icon: <MdBadge size={22} />,
    description: 'Track IDs & get expiry reminders.',
    roles: ['toolkit', 'admin'],
  },
  {
    name: 'Cricket',
    href: '/cricket',
    icon: <MdAccountBalanceWallet size={22} />,
    description: 'Team expenses & dues.',
    roles: ['cricket', 'admin'],
  },
  {
    name: 'Live Scoring',
    href: '/cricket/scoring',
    icon: <MdScoreboard size={22} />,
    description: 'Score matches ball-by-ball.',
    roles: ['cricket', 'admin'],
  },
  {
    name: 'Practice Stats',
    href: '/cricket/scoring/leaderboard',
    icon: <MdLeaderboard size={22} />,
    description: 'Batting, bowling & fielding leaderboards.',
    roles: ['cricket', 'admin'],
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: <MdAdminPanelSettings size={22} />,
    description: 'Users, activity & stats.',
    roles: ['admin'],
  },
];
