export type Tool = {
  name: string;
  href: string;
  icon: string;
  description: string;
  gradient: string;
  badge: 'live' | 'soon';
};

export const tools: Tool[] = [
  {
    name: 'Vibe Planner',
    href: '/vibe-planner',
    icon: '✦',
    description: 'Capture sparks. Plan actions. Track flow.',
    gradient: 'from-indigo-500 to-purple-500',
    badge: 'live',
  },
  {
    name: 'Focus Timer',
    href: '/focus-timer',
    icon: '⏱',
    description: 'Pomodoro sessions with ambient sounds.',
    gradient: 'from-blue-500 to-cyan-500',
    badge: 'soon',
  },
  {
    name: 'Daily Journal',
    href: '/daily-journal',
    icon: '📝',
    description: 'Reflect. Write. Grow.',
    gradient: 'from-orange-500 to-amber-500',
    badge: 'soon',
  },
  {
    name: 'Habit Tracker',
    href: '/habit-tracker',
    icon: '🔄',
    description: 'Build streaks. Break patterns.',
    gradient: 'from-green-500 to-emerald-500',
    badge: 'soon',
  },
];
