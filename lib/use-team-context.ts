'use client';

import { useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

/// Three-layer team resolution: URL param > Zustand store > localStorage fallback.
/// Single-team users get their team automatically. Multi-team users can override via URL.
export function useTeamContext() {
  const searchParams = useSearchParams();
  const { userTeams, currentTeamId, setCurrentTeam } = useAuthStore();

  const approvedTeams = userTeams.filter(t => t.approved);

  // Layer 1: URL param (source of truth for deep links / sharing).
  // In an EFFECT, not the render body — setCurrentTeam writes localStorage and
  // Zustand state, and a state write during render re-renders every subscriber
  // mid-pass (a React side-effect-during-render violation the old code had).
  const teamSlug = searchParams.get('team');
  useEffect(() => {
    if (!teamSlug) return;
    const matched = approvedTeams.find(t => t.team_slug === teamSlug);
    if (matched && matched.team_id !== currentTeamId) {
      setCurrentTeam(matched.team_id);
    }
    // approvedTeams is derived per render; keying on the stable inputs instead.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamSlug, currentTeamId, userTeams, setCurrentTeam]);

  const currentTeam = approvedTeams.find(t => t.team_id === currentTeamId) ?? approvedTeams[0] ?? null;

  return {
    currentTeamId: currentTeam?.team_id ?? null,
    currentTeam,
    userTeams: approvedTeams,
    isMultiTeam: approvedTeams.length > 1,
    setCurrentTeam,
  };
}
