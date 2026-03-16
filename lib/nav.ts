export type Tool = {
  name: string;
  href: string;
  icon: string;
  description: string;
  adminOnly?: boolean;
};

export const tools: Tool[] = [
  {
    name: 'Vibe Planner',
    href: '/vibe-planner',
    icon: '✦',
    description: 'Capture sparks. Plan actions. Track flow.',
  },
  {
    name: 'Sports',
    href: '/sports/toss',
    icon: '🏏',
    description: 'Cricket toss. Fair coin. ICC standard.',
  },
  {
    name: 'ID Tracker',
    href: '/id-tracker',
    icon: '🪪',
    description: 'Track IDs & get expiry reminders.',
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: '⚙️',
    description: 'Users, activity & stats.',
    adminOnly: true,
  },
];
