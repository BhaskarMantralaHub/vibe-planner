'use client';

import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

/// Three-layer team resolution: URL param > Zustand store > localStorage fallback.
/// Single-team users get their team automatically. Multi-team users can override via URL.
export function useTeamContext() {
  const searchParams = useSearchParams();
  const { userTeams, currentTeamId, setCurrentTeam } = useAuthStore();

  const approvedTeams = userTeams.filter(t => t.approved);

  // Layer 1: URL param (source of truth for deep links / sharing)
  const teamSlug = searchParams.get('team');
  if (teamSlug) {
    const matched = approvedTeams.find(t => t.team_slug === teamSlug);
    if (matched && matched.team_id !== currentTeamId) {
      setCurrentTeam(matched.team_id);
    }
  }

  const currentTeam = approvedTeams.find(t => t.team_id === currentTeamId) ?? approvedTeams[0] ?? null;

  return {
    currentTeamId: currentTeam?.team_id ?? null,
    currentTeam,
    userTeams: approvedTeams,
    isMultiTeam: approvedTeams.length > 1,
    setCurrentTeam,
  };
}
