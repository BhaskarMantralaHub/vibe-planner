'use client';

import { useCricketStore } from '@/stores/cricket-store';
import { SEASON_TYPES } from '../lib/constants';

/// Shown above any season-scoped screen when the selected season is not the
/// current one. Names the current season and switches to it in one tap.
export default function PastSeasonNotice({ className = 'mb-4' }: { className?: string }) {
  const seasons = useCricketStore((s) => s.seasons);
  const selected = useCricketStore((s) => s.seasons.find((x) => x.id === s.selectedSeasonId));
  const setSelectedSeason = useCricketStore((s) => s.setSelectedSeason);
  const current = seasons.find((s) => s.is_active);

  if (!selected || selected.is_active) return null;

  return (
    <div role="status" className={`${className} flex items-center justify-between gap-3 rounded-xl bg-[var(--fill)] px-3.5 py-2.5`}>
      <p className="min-w-0 text-[13px] font-medium text-[var(--muted)]">Past season · view only</p>
      {current && (
        <button
          onClick={() => setSelectedSeason(current.id)}
          className="flex-shrink-0 cursor-pointer text-[13px] font-semibold text-[var(--cricket)] active:opacity-60"
        >
          Switch to {SEASON_TYPES.find((t) => t.key === current.season_type)?.label ?? current.season_type} {current.year}
        </button>
      )}
    </div>
  );
}
