import { Brain, IdCard, ShieldCheck, CalendarRange, Images, HandCoins } from 'lucide-react';
// MdScoreboard + ChartColumnBig retained only for the commented-out Live Scoring
// and Practice Stats entries below; restore the imports when re-enabling.
import CricketIcon from '@/components/icons/CricketIcon';

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
    icon: <CricketIcon size={22} />,
    description: 'Team expenses & dues.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  // Hidden 2026-05-04 — kept the routes intact so direct URLs still work,
  // but removed from the hamburger menu pending real usage. Re-enable by
  // uncommenting both blocks below.
  // {
  //   name: 'Live Scoring',
  //   href: '/cricket/scoring',
  //   icon: <MdScoreboard size={22} />,
  //   description: 'Score matches ball-by-ball.',
  //   roles: ['cricket', 'admin'],
  //   feature: 'cricket',
  // },
  // {
  //   name: 'Practice Stats',
  //   href: '/cricket/scoring/leaderboard',
  //   icon: <ChartColumnBig size={22} />,
  //   description: 'Batting, bowling & fielding leaderboards.',
  //   roles: ['cricket', 'admin'],
  //   feature: 'cricket',
  // },
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
