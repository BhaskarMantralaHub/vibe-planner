export type Tool = {
  name: string;
  href: string;
  icon: string;
  description: string;
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
];
