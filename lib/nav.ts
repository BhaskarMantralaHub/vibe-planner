export type Tool = {
  name: string;
  href: string;
  icon: string;
  description: string;
  roles?: string[];
};

export const tools: Tool[] = [
  {
    name: 'Vibe Planner',
    href: '/vibe-planner',
    icon: '✦',
    description: 'Capture sparks. Plan actions. Track flow.',
    roles: ['toolkit', 'admin'],
  },
  {
    name: 'Sports',
    href: '/sports/toss',
    icon: '🏏',
    description: 'Cricket toss. Fair coin. ICC standard.',
    roles: ['toolkit', 'admin'],
  },
  {
    name: 'ID Tracker',
    href: '/id-tracker',
    icon: '🪪',
    description: 'Track IDs & get expiry reminders.',
    roles: ['toolkit', 'admin'],
  },
  {
    name: 'Cricket',
    href: '/cricket',
    icon: '💰',
    description: 'Team expenses & dues.',
    roles: ['cricket', 'admin'],
  },
  {
    name: 'Admin',
    href: '/admin',
    icon: '⚙️',
    description: 'Users, activity & stats.',
    roles: ['admin'],
  },
];
