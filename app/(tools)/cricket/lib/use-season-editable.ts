import { useCricketStore } from '@/stores/cricket-store';

/// False when the selected season is a past (inactive) one. Finance screens
/// hide every add, edit, delete and settle control while this is false.
/// Optimistically true until seasons load so the controls don't flash away.
export function useSeasonEditable(): boolean {
  return useCricketStore((s) => s.seasons.find((x) => x.id === s.selectedSeasonId)?.is_active ?? true);
}
