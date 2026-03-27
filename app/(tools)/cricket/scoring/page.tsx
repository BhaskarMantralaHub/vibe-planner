'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Button, Text, EmptyState, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MdArrowBack, MdSportsCricket, MdAdd } from 'react-icons/md';
import type { MatchHistoryItem } from '@/types/scoring';
import ScoringWizard from './components/ScoringWizard';
import { ScoringScreen } from './components/ScoringScreen';

/* ── Match Card (rich design matching cricket dashboard patterns) ── */
function MatchCard({ item, onTap, onDelete }: { item: MatchHistoryItem; onTap: () => void; onDelete?: () => void }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const isActive = item.status === 'scoring' || item.status === 'innings_break';
  const isCompleted = item.status === 'completed';
  const inn1 = item.first_innings;
  const inn2 = item.second_innings;

  // Status-based left border color
  const borderColor = isActive
    ? 'var(--cricket)'
    : !item.match_winner ? 'var(--muted)' : item.match_winner === 'tied' ? 'var(--muted)' : '#4ADE80';

  const statusLabel = isActive ? 'LIVE' : !item.match_winner ? 'NO RESULT' : item.match_winner === 'tied' ? 'TIED' : 'WON';
  const statusColor = isActive ? 'var(--cricket)' : statusLabel === 'WON' ? '#4ADE80' : 'var(--muted)';

  return (
    <>
      <div
        onClick={onTap}
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden cursor-pointer select-none transition-all duration-150 active:scale-[0.98]"
        style={{ borderLeftWidth: '4px', borderLeftColor: borderColor }}
      >
        <div className="p-3 sm:p-4">
          {/* Header: team names + status pill */}
          <div className="flex items-start gap-2 mb-1">
            <div className="min-w-0 flex-1">
              <Text size="md" weight="semibold" truncate>{item.team_a_name} vs {item.team_b_name}</Text>
              {item.title && item.title !== `${item.team_a_name} vs ${item.team_b_name}` && (
                <Text size="2xs" weight="medium" color="muted" truncate className="mt-0.5">{item.title}</Text>
              )}
            </div>
            <span
              className="flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase whitespace-nowrap"
              style={{
                background: `color-mix(in srgb, ${statusColor} 12%, transparent)`,
                color: statusColor,
                border: `1px solid color-mix(in srgb, ${statusColor} 25%, transparent)`,
              }}
            >
              {isActive && <span className="w-1.5 h-1.5 rounded-full mr-1 animate-pulse" style={{ background: statusColor }} />}
              {statusLabel}
            </span>
          </div>

          {/* Scoreboard container */}
          {inn1 && (
            <div className="rounded-xl p-2.5 my-2" style={{ background: 'var(--surface)', border: '1px solid var(--border)' }}>
              <div className="space-y-1">
                {/* 1st innings */}
                <div className="flex items-center justify-between">
                  <Text size="xs" weight="bold" color="cricket" uppercase tracking="wide">
                    {(inn1.batting_team === 'team_a' ? item.team_a_name : item.team_b_name).slice(0, 8)}
                  </Text>
                  <div className="flex items-baseline gap-1">
                    <Text size="md" weight="bold" tabular>{inn1.total_runs}/{inn1.total_wickets}</Text>
                    <Text size="2xs" color="muted" tabular>({inn1.total_overs} ov)</Text>
                  </div>
                </div>

                {inn2 && (inn2.total_runs > 0 || inn2.total_wickets > 0) && (
                  <>
                    <div className="h-px" style={{ background: 'var(--border)' }} />
                    {/* 2nd innings */}
                    <div className="flex items-center justify-between">
                      <Text size="xs" weight="bold" color="muted" uppercase tracking="wide">
                        {(inn2.batting_team === 'team_a' ? item.team_a_name : item.team_b_name).slice(0, 8)}
                      </Text>
                      <div className="flex items-baseline gap-1">
                        <Text size="md" weight="bold" tabular>{inn2.total_runs}/{inn2.total_wickets}</Text>
                        <Text size="2xs" color="muted" tabular>({inn2.total_overs} ov)</Text>
                      </div>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Result text */}
          {isCompleted && item.result_summary && (
            <Text as="p" size="xs" weight="semibold" className="mb-2" style={{ color: statusColor }}>
              {item.result_summary}
            </Text>
          )}

          {/* Footer: meta + admin delete */}
          <div className="flex items-center justify-between gap-2 pt-1.5 border-t border-[var(--border)]/20">
            <Text size="2xs" color="dim" truncate>
              {item.match_date} · {item.overs_per_innings} ov{item.scorer_name ? ` · ${item.scorer_name}` : ''}
            </Text>
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setDeleteOpen(true); }}
                className="flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors"
                style={{ background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)' }}
                title="Delete match"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Dialog */}
      {onDelete && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Match?</DialogTitle>
              <DialogDescription>
                &quot;{item.team_a_name} vs {item.team_b_name}&quot; will be removed from match history. This can be recovered by an admin.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={() => { onDelete(); setDeleteOpen(false); }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ── Landing Page ── */
function ScoringLanding({ onNewMatch, onContinue, onResumeMatch }: {
  onNewMatch: () => void;
  onContinue?: () => void;
  onResumeMatch: (matchId: string) => void;
}) {
  const router = useRouter();
  const { match, innings, matchHistory, loadMatchHistory, deleteMatch } = useScoringStore();
  const { user, userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');

  // Load matches from DB every time this component mounts
  // (remounts when returning from match view since it's conditionally rendered)
  useEffect(() => {
    if (isCloudMode()) {
      loadMatchHistory();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local active match (from this device's store)
  const hasLocalMatch = match && (match.status === 'scoring' || match.status === 'innings_break' || match.status === 'setup');
  const idx = match?.current_innings ?? 0;
  const currentInnings = hasLocalMatch ? innings[idx] : null;

  // DB matches — separate active vs completed
  const activeDbMatches = matchHistory.filter((m) => m.status === 'scoring' || m.status === 'innings_break');
  const completedDbMatches = matchHistory.filter((m) => m.status === 'completed');

  return (
    <div className="flex min-h-[100dvh] flex-col bg-[var(--bg)]">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
        <button
          onClick={() => router.push('/cricket')}
          className="cursor-pointer rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
        >
          <MdArrowBack size={22} />
        </button>
        <Text size="lg" weight="semibold">Live Scoring</Text>
      </div>

      <div className="flex-1 px-4 py-6">
        <div className="mx-auto max-w-md space-y-6">
          {/* Hero */}
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="flex h-16 w-16 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
            >
              <MdSportsCricket size={32} className="text-white" />
            </div>
            <Text as="h1" size="xl" weight="semibold" tracking="tight">
              Live Scoring
            </Text>
          </div>

          {/* Local active match — Continue Scoring (scorer's device) */}
          {hasLocalMatch && match && currentInnings && onContinue && (
            <div className="rounded-2xl border border-[var(--cricket)]/30 overflow-hidden" style={{ background: 'color-mix(in srgb, var(--cricket) 6%, var(--card))' }}>
              <div className="px-4 pt-3 pb-2">
                <Text size="2xs" weight="semibold" color="cricket" uppercase tracking="wider">Your Active Match</Text>
                <Text as="h3" size="md" weight="bold" className="mt-1">
                  {match.team_a.name} vs {match.team_b.name}
                </Text>
                <Text size="sm" color="muted" tabular className="mt-0.5">
                  {currentInnings.total_runs}/{currentInnings.total_wickets} ({currentInnings.total_overs.toFixed(1)} ov)
                </Text>
              </div>
              <div className="px-4 pb-3">
                <Button variant="primary" brand="cricket" size="lg" fullWidth onClick={onContinue}>
                  Continue Scoring
                </Button>
              </div>
            </div>
          )}

          {/* Start New Match */}
          <Button
            variant={hasLocalMatch ? 'secondary' : 'primary'}
            brand="cricket"
            size="xl"
            fullWidth
            onClick={onNewMatch}
          >
            <MdAdd size={20} /> Start New Match
          </Button>

          {/* Active Matches from DB (visible to all players) */}
          {activeDbMatches.length > 0 && (
            <div>
              <Text as="h2" size="sm" weight="semibold" className="mb-2">
                Active Matches
              </Text>
              <div className="space-y-2">
                {activeDbMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    item={m}
                    onTap={() => onResumeMatch(m.id)}
                    onDelete={isAdmin ? () => {
                      deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
                    } : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Matches (history) */}
          {completedDbMatches.length > 0 && (
            <div>
              <Text as="h2" size="sm" weight="semibold" className="mb-2">
                Previous Matches
              </Text>
              <div className="space-y-2">
                {completedDbMatches.map((m) => (
                  <MatchCard
                    key={m.id}
                    item={m}
                    onTap={() => onResumeMatch(m.id)}
                    onDelete={isAdmin ? () => {
                      deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
                    } : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!hasLocalMatch && activeDbMatches.length === 0 && completedDbMatches.length === 0 && (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <EmptyState
                icon={<MdSportsCricket size={32} style={{ color: 'var(--dim)' }} />}
                title="No matches yet"
                description="Start a new match to begin scoring"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/* ── Active Match — wires to ScoringScreen ── */
function ActiveMatch({ onBack }: { onBack: () => void }) {
  const { match } = useScoringStore();
  if (!match) return null;
  return <ScoringScreen onBack={onBack} />;
}

/* ── Page Root ── */
export default function ScoringPage() {
  const [view, setView] = useState<'landing' | 'wizard' | 'match'>('landing');
  const { match } = useScoringStore();
  const { loadAll, players } = useCricketStore();
  const { user } = useAuthStore();
  const router = useRouter();

  // Load cricket roster data (needed for player picker)
  useEffect(() => {
    if (isCloudMode() && user && players.length === 0) {
      loadAll(user.id);
    }
  }, [user, players.length, loadAll]);

  // No auto-nav — user stays on landing until they explicitly tap Continue/Resume

  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']}>
        {/* Hide Shell — fixed overlay (no scroll on this element, iOS Safari ignores it).
             Inner absolute div is the actual scroll container. */}
        <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: 'var(--bg)' }}>
          <div
            className="absolute inset-0 overflow-y-auto overscroll-contain"
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            {view === 'landing' && (
              <ScoringLanding
                onNewMatch={() => setView('wizard')}
                onContinue={match ? () => setView('match') : undefined}
                onResumeMatch={async (matchId) => {
                  const ok = await useScoringStore.getState().resumeMatch(matchId);
                  if (ok) setView('match');
                }}
              />
            )}
            {view === 'wizard' && (
              <ScoringWizard
                onComplete={() => setView('match')}
                onBack={() => setView('landing')}
              />
            )}
            {view === 'match' && <ActiveMatch onBack={() => setView('landing')} />}
          </div>
        </div>
      </RoleGate>
    </AuthGate>
  );
}
