import type { StatusConfig, VibeCategory } from '@/types/vibe';

export const STATUSES: Record<string, StatusConfig> = {
  spark:       { label: 'Spark',       icon: '✦', color: 'var(--toolkit)',  gradient: 'linear-gradient(135deg, var(--spark-from), var(--spark-to))',       glow: 'var(--spark-glow)' },
  in_progress: { label: 'In Progress', icon: '▶', color: 'var(--blue)',    gradient: 'linear-gradient(135deg, var(--progress-from), var(--progress-to))', glow: 'var(--progress-glow)' },
  scheduled:   { label: 'Scheduled',   icon: '◷', color: 'var(--orange)',  gradient: 'linear-gradient(135deg, var(--scheduled-from), var(--scheduled-to))', glow: 'var(--scheduled-glow)' },
  done:        { label: 'Done',        icon: '✓', color: 'var(--green)',   gradient: 'linear-gradient(135deg, var(--done-from), var(--done-to))',         glow: 'var(--done-glow)' },
};

export const STATUS_KEYS = Object.keys(STATUSES) as Array<keyof typeof STATUSES>;

export const CATEGORIES: VibeCategory[] = [
  'Work',
  'Personal',
  'Creative',
  'Learning',
  'Health',
];
