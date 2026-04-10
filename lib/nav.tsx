import { Brain, IdCard, Wallet, ShieldCheck, CalendarRange, Images, ChartColumnBig, HandCoins } from 'lucide-react';
import { MdScoreboard } from 'react-icons/md';

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
    icon: <Brain size={22} />,
    description: 'Capture sparks. Plan actions. Track flow.',
    roles: ['toolkit', 'admin'],
    feature: 'vibe-planner',
  },
  {
    name: 'ID Tracker',
    href: '/id-tracker',
    icon: <IdCard size={22} />,
    description: 'Track IDs & get expiry reminders.',
    roles: ['toolkit', 'admin'],
    feature: 'id-tracker',
  },
  {
    name: 'Cricket',
    href: '/cricket',
    icon: <Wallet size={22} />,
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
    icon: <ChartColumnBig size={22} />,
    description: 'Batting, bowling & fielding leaderboards.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Moments',
    href: '/cricket/moments',
    icon: <Images size={22} />,
    description: 'Team photos & highlights.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'League Schedule',
    href: '/cricket/schedule',
    icon: <CalendarRange size={22} />,
    description: 'Upcoming matches & fixtures.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Coin Toss',
    href: '/cricket/toss',
    icon: <HandCoins size={22} />,
    description: 'Fair, cryptographic coin flip.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: <ShieldCheck size={22} />,
    description: 'Users, activity & stats.',
    roles: ['admin'],
  },
];
