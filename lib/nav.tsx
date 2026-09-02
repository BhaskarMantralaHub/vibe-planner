import { Brain, IdCard, ShieldCheck, CalendarRange, Images, HandCoins, Trophy, Wallet, Users } from 'lucide-react';
// MdScoreboard + ChartColumnBig retained only for the commented-out Live Scoring
// and Practice Stats entries below; restore the imports when re-enabling.
import UmpireIcon from '@/components/icons/UmpireIcon';

export type Tool = {
  name: string;
  href: string;
  icon: React.ReactNode;
  description: string;
  roles?: string[];
  feature?: string;
  /** Presentation-only grouping for the hamburger drawer — the drawer is the
   *  GLOBAL toolkit (the bottom dock stays primary navigation), so it reads
   *  as sections, not one long list. No routing/permission meaning.
   *  team = roster + competition info · team-management = financial/team
   *  admin · game-day = match-day tools · management = system administration. */
  group: 'personal' | 'team' | 'team-management' | 'game-day' | 'management';
};

export const tools: Tool[] = [
  // DEPRECATED 2026-09-02 — Vibe Planner and ID Tracker are hidden from the
  // menu. The app is a cricket product now; these personal tools were the
  // original toolkit and are no longer maintained. Routes and data are
  // deliberately INTACT (`/vibe-planner`, `/id-tracker` still work by direct
  // URL) so existing notes and documents stay reachable — same treatment as
  // Live Scoring below. Re-enable by uncommenting.
  // {
  //   name: 'Vibe Planner',
  //   group: 'personal',
  //   href: '/vibe-planner',
  //   icon: <Brain size={22} />,
  //   description: 'Capture sparks. Plan actions. Track flow.',
  //   roles: ['toolkit', 'admin'],
  //   feature: 'vibe-planner',
  // },
  // {
  //   name: 'ID Tracker',
  //   group: 'personal',
  //   href: '/id-tracker',
  //   icon: <IdCard size={22} />,
  //   description: 'Track IDs & get expiry reminders.',
  //   roles: ['toolkit', 'admin'],
  //   feature: 'id-tracker',
  // },
  {
    // "Roster", not "Cricket": the destination is the player/team roster.
    // "Cricket" implied matches, scoring and stats too — which have their own
    // entries below. Same label as the bottom dock's first item (key stays
    // 'players' there; this is vocabulary, not routing).
    name: 'Roster',
    group: 'team',
    href: '/cricket',
    icon: <Users size={22} />,
    description: 'Players, roles & team details.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Finances',
    group: 'team-management',
    // Query-param deep-link (NOT a #hash): on client-side navigations the
    // App Router updates the URL without firing hashchange and after the
    // page renders, so hash links silently land on the default tab. The
    // cricket dashboard consumes ?view= via useSearchParams, which is
    // reactive on every navigation. 'expenses' = Finances tab default.
    href: '/cricket?view=expenses',
    // Wallet, not Receipt: this is the whole financial hub (expenses, fees,
    // splits, sponsors) — a receipt reads as expense tracking only.
    icon: <Wallet size={22} />,
    description: 'Expenses, dues, splits & sponsors.',
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
  // League Schedule + League Stats sit adjacently — the council's
  // compromise: keep separate routes (avoids MatchSchedule's bottom-tab-bar
  // collision) but group them visually so users see them as one league hub.
  {
    name: 'League Schedule',
    group: 'team',
    href: '/cricket/schedule',
    icon: <CalendarRange size={22} />,
    description: 'Upcoming matches & fixtures.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'League Stats',
    group: 'team',
    href: '/cricket/league-stats',
    icon: <Trophy size={22} />,
    description: 'Batting, bowling, all-rounders & catches.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Umpiring',
    group: 'game-day',
    href: '/cricket/umpiring',
    icon: <UmpireIcon size={22} />,
    description: 'Claim duties & see who has stood.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Moments',
    group: 'game-day',
    href: '/cricket/moments',
    icon: <Images size={22} />,
    description: 'Team photos & highlights.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Coin Toss',
    group: 'game-day',
    href: '/cricket/toss',
    icon: <HandCoins size={22} />,
    description: 'Fair, cryptographic coin flip.',
    roles: ['cricket', 'admin'],
    feature: 'cricket',
  },
  {
    name: 'Admin',
    group: 'management',
    href: '/admin',
    icon: <ShieldCheck size={22} />,
    description: 'Users, activity & stats.',
    roles: ['admin'],
  },
];
