import type { SegmentOption } from '@/components/ui/segmented-control';

/**
 * The Matches section's tabs. Rendered on two routes — /cricket/schedule
 * (Upcoming, Completed) and /cricket/league-stats (Stats) — so they live here
 * once rather than drifting apart.
 */
export const MATCH_TABS: SegmentOption[] = [
  { key: 'upcoming', label: 'Upcoming' },
  { key: 'completed', label: 'Completed' },
  { key: 'stats', label: 'Stats' },
];
