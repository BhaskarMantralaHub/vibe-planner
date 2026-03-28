'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Button, Text, EmptyState, Skeleton, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, CardMenu, SegmentedControl } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MdArrowBack, MdSportsCricket, MdAdd, MdDeleteOutline, MdRestoreFromTrash, MdDeleteForever, MdScoreboard, MdPlayArrow } from 'react-icons/md';
import { FaEllipsisV } from 'react-icons/fa';
import type { MatchHistoryItem } from '@/types/scoring';
import ScoringWizard from './components/ScoringWizard';
import { ScoringScreen } from './components/ScoringScreen';

/* ── Load More Button ── */
function LoadMoreButton({ onLoadMore }: { onLoadMore: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      onClick={async () => { setLoading(true); await onLoadMore(); setLoading(false); }}
      disabled={loading}
      className={cn(
        'w-full mt-3 py-2.5 rounded-xl text-center cursor-pointer transition-all active:scale-[0.98]',
        'border border-[var(--border)] bg-[var(--surface)]',
        loading && 'opacity-50 cursor-not-allowed',
      )}
    >
      <Text size="xs" weight="semibold" color="cricket">
        {loading ? 'Loading...' : 'Load More Matches'}
      </Text>
    </button>
  );
}

/* ── Match Card ── */
function MatchCard({ item, onTap, onDelete, onRestore, onPermanentDelete, onRevert }: {
  item: MatchHistoryItem;
  onTap: () => void;
  onDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onPermanentDelete?: () => Promise<void>;
  onRevert?: () => Promise<void>;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [restoring, setRestoring] = useState(false);
  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const isDeleted = !!(item as Record<string, unknown>).deleted_at;
  const isActive = item.status === 'scoring' || item.status === 'innings_break';
  const isCompleted = item.status === 'completed';
  const inn1 = item.first_innings;
  const inn2 = item.second_innings;
  // Detect win from result_summary text if match_winner isn't set (older matches)
  const hasWin = (item.match_winner && item.match_winner !== 'tied')
    || (item.result_summary?.includes('won') ?? false);
  const isTied = item.match_winner === 'tied' || (item.result_summary?.includes('tied') ?? false);
  const isNoResult = !hasWin && !isTied;

  return (
    <>
      <div
        onClick={onTap}
        className="w-full rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden cursor-pointer select-none transition-all duration-150 active:scale-[0.98]"
      >
        {/* ── Top bar: gradient for live, subtle for completed ── */}
        <div
          className="px-4 py-2 flex items-center justify-between"
          style={{
            background: isActive
              ? 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))'
              : 'color-mix(in srgb, var(--cricket) 6%, var(--surface))',
          }}
        >
          <div className="flex items-center gap-2 min-w-0">
            {isActive && <span className="w-2 h-2 rounded-full bg-white animate-pulse flex-shrink-0" />}
            <Text size="xs" weight="bold" color={isActive ? 'white' : 'cricket'} uppercase tracking="wider" truncate>
              {item.overs_per_innings} Over Match
            </Text>
          </div>
          <div className="flex items-center gap-2">
            <Text size="xs" weight="medium" color={isActive ? 'white' : 'muted'} className={isActive ? 'opacity-80' : ''}>
              {item.match_date}
            </Text>
            {(onDelete || onRestore || onPermanentDelete || onRevert) && (
              <button
                ref={menuBtnRef}
                onClick={(e) => { e.stopPropagation(); setMenuOpen(!menuOpen); }}
                className={cn(
                  'flex-shrink-0 h-7 w-7 flex items-center justify-center rounded-lg cursor-pointer transition-colors',
                  isActive ? 'text-white/70 hover:bg-white/10' : 'text-[var(--muted)] hover:bg-[var(--hover-bg)]',
                )}
                title="Options"
              >
                <FaEllipsisV size={11} />
              </button>
            )}
          </div>
        </div>

        {/* ── Body ── */}
        <div className="px-4 py-3">
          {/* Level 1: Title — largest, boldest */}
          <Text as="h3" size="lg" weight="bold">
            {item.team_a_name} <Text as="span" size="sm" weight="normal" color="muted">vs</Text> {item.team_b_name}
          </Text>
          {item.title && item.title !== `${item.team_a_name} vs ${item.team_b_name}` && (
            <Text as="p" size="xs" weight="medium" color="muted" className="mt-1">{item.title}</Text>
          )}

          {/* Level 2: Scores — numbers dominate, names recede */}
          {inn1 && (
            <div className="mt-3 rounded-xl overflow-hidden" style={{ background: 'var(--surface)' }}>
              {/* 1st innings */}
              <div className="px-3 py-2.5 flex items-center justify-between">
                <Text size="sm" weight="medium" color="muted" className="w-20 flex-shrink-0" truncate>
                  {inn1.batting_team === 'team_a' ? item.team_a_name : item.team_b_name}
                </Text>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: 'var(--text)' }}>
                    {inn1.total_runs}
                  </span>
                  <Text size="sm" weight="normal" color="dim" tabular>/{inn1.total_wickets}</Text>
                  <Text size="2xs" weight="normal" color="dim" tabular className="ml-1">({inn1.total_overs} ov)</Text>
                </div>
              </div>

              {inn2 && (inn2.total_runs > 0 || inn2.total_wickets > 0) && (
                <>
                  <div className="mx-3 h-px" style={{ background: 'var(--border)' }} />
                  {/* 2nd innings */}
                  <div className="px-3 py-2.5 flex items-center justify-between">
                    <Text size="sm" weight="medium" color="muted" className="w-20 flex-shrink-0" truncate>
                      {inn2.batting_team === 'team_a' ? item.team_a_name : item.team_b_name}
                    </Text>
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-[22px] font-extrabold tabular-nums leading-none" style={{ color: 'var(--text)' }}>
                        {inn2.total_runs}
                      </span>
                      <Text size="sm" weight="normal" color="dim" tabular>/{inn2.total_wickets}</Text>
                      <Text size="2xs" weight="normal" color="dim" tabular className="ml-1">({inn2.total_overs} ov)</Text>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Level 3: Result */}
          {isCompleted && item.result_summary && (
            <Text as="p" size="sm" weight="bold" color={hasWin ? 'cricket' : 'muted'} className="mt-3">
              {item.result_summary}
            </Text>
          )}
        </div>

        {/* Level 4: Meta */}
        <div className="px-4 py-2 border-t border-[var(--border)]/15">
          <Text size="xs" weight="medium" color="muted">
            {item.scorer_name ? `Scored by ${item.scorer_name}` : 'Practice Match'}
          </Text>
        </div>
      </div>

      {/* Actions Menu */}
      {menuOpen && (
        <CardMenu
          anchorRef={menuBtnRef}
          onClose={() => setMenuOpen(false)}
          width={180}
          items={[
            { label: 'View Scorecard', icon: <MdScoreboard size={15} />, color: 'var(--text)', onClick: onTap },
            ...(onRevert ? [{ label: 'Resume Scoring', icon: <MdPlayArrow size={15} />, color: 'var(--cricket)', onClick: () => onRevert() }] : []),
            ...(isDeleted && onRestore ? [{ label: restoring ? 'Restoring...' : 'Restore', icon: <MdRestoreFromTrash size={15} />, color: 'var(--cricket)', onClick: async () => { setRestoring(true); await onRestore(); setRestoring(false); } }] : []),
            ...(!isDeleted && onDelete ? [{ label: 'Delete', icon: <MdDeleteOutline size={15} />, color: 'var(--red)', onClick: () => setDeleteOpen(true), dividerBefore: true }] : []),
            ...(isDeleted && onPermanentDelete ? [{ label: 'Delete Forever', icon: <MdDeleteForever size={15} />, color: 'var(--red)', onClick: () => setPermanentDeleteOpen(true), dividerBefore: true }] : []),
          ]}
        />
      )}

      {/* Delete Dialog */}
      {onDelete && (
        <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Match?</DialogTitle>
              <DialogDescription>
                {item.title && item.title !== `${item.team_a_name} vs ${item.team_b_name}`
                  ? `"${item.title}" (${item.team_a_name} vs ${item.team_b_name})`
                  : `"${item.team_a_name} vs ${item.team_b_name}"`
                } on {item.match_date} will be moved to Recently Deleted. An admin can restore it later.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={async () => { setDeleteOpen(false); if (onDelete) await onDelete(); }}>Delete</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Permanent Delete Dialog */}
      {onPermanentDelete && (
        <Dialog open={permanentDeleteOpen} onOpenChange={setPermanentDeleteOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Permanently Delete?</DialogTitle>
              <DialogDescription>
                This will permanently remove &quot;{item.team_a_name} vs {item.team_b_name}&quot; and all ball-by-ball data. This cannot be undone.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setPermanentDeleteOpen(false)}>Cancel</Button>
              <Button variant="danger" onClick={async () => { setPermanentDeleteOpen(false); await onPermanentDelete(); }}>Delete Forever</Button>
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
  const { match, innings, dbMatchId, matchHistory, deletedMatches, historyLoading, loadMatchHistory, loadDeletedMatches, deleteMatch, restoreMatch, permanentDeleteMatch, revertMatch } = useScoringStore();
  const { user, userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');

  // Load matches from DB on mount (AuthGate guarantees user is authenticated)
  useEffect(() => {
    if (isCloudMode()) {
      loadMatchHistory();
      if (isAdmin) loadDeletedMatches();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Local active match (from this device's store)
  const hasLocalMatch = match && (match.status === 'scoring' || match.status === 'innings_break' || match.status === 'setup');
  const idx = match?.current_innings ?? 0;
  const currentInnings = hasLocalMatch ? innings[idx] : null;

  // Match filter
  type MatchFilter = 'all' | 'last5' | 'last10' | 'last20' | 'deleted';
  const [matchFilter, setMatchFilter] = useState<MatchFilter>('all');

  const getLimit = (filter: MatchFilter): number => {
    switch (filter) {
      case 'last5': return 5;
      case 'last10': return 10;
      case 'last20': return 20;
      default: return 50;
    }
  };

  const handleFilterChange = (filter: MatchFilter) => {
    setMatchFilter(filter);
    if (filter === 'deleted') {
      loadDeletedMatches();
    } else {
      loadMatchHistory(false);
    }
  };

  // DB matches — separate active vs completed
  // Only exclude dbMatchId if we have a valid local match with players (to avoid duplicate card)
  const hasValidLocalMatch = hasLocalMatch && currentInnings?.striker_id;
  const activeDbMatches = matchHistory.filter((m) =>
    (m.status === 'scoring' || m.status === 'innings_break') && !(hasValidLocalMatch && m.id === dbMatchId)
  );
  const allCompleted = matchHistory.filter((m) => m.status === 'completed');
  const limit = getLimit(matchFilter);
  const completedDbMatches = allCompleted.slice(0, limit);


  return (
    <div className="px-4 py-4">
      <div className="mx-auto max-w-md space-y-6">

          {/* Page header */}
          <div className="relative rounded-2xl overflow-hidden px-5 py-5"
            style={{ background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-1/3 translate-x-1/4"
              style={{ background: 'radial-gradient(circle, white, transparent 70%)' }} />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-10 translate-y-1/3 -translate-x-1/4"
              style={{ background: 'radial-gradient(circle, var(--cricket-accent), transparent 70%)' }} />
            <div className="relative flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <MdSportsCricket size={22} className="text-white" />
              </div>
              <div>
                <Text as="h1" size="lg" weight="bold" color="white">Live Scoring</Text>
                <Text as="p" size="2xs" color="white" className="opacity-70">Ball-by-ball match scoring</Text>
              </div>
            </div>
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


          {/* Loading skeleton */}
          {historyLoading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-[var(--border)] bg-[var(--card)] overflow-hidden">
                  <Skeleton className="h-9 w-full" />
                  <div className="p-4 space-y-3">
                    <Skeleton className="h-5 w-48 rounded-lg" />
                    <Skeleton className="h-4 w-32 rounded-lg" />
                    <div className="rounded-xl overflow-hidden">
                      <Skeleton className="h-16 w-full" />
                    </div>
                    <Skeleton className="h-4 w-40 rounded-lg" />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Active Matches from DB (visible to all players) */}
          {!historyLoading && matchFilter !== 'deleted' && activeDbMatches.length > 0 && (
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
                    onDelete={isAdmin ? async () => {
                      await deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
                    } : undefined}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Completed Matches (history with pagination + date filter) */}
          {!historyLoading && (completedDbMatches.length > 0 || allCompleted.length > 0 || matchFilter !== 'all' || (isAdmin && deletedMatches.length > 0)) && (
            <div>
              <div className="flex items-center justify-between mb-2">
                <Text as="h2" size="sm" weight="semibold">
                  {matchFilter === 'deleted' ? 'Deleted Matches' : 'Previous Matches'}
                </Text>
              </div>
              {/* Filter */}
              <SegmentedControl
                options={[
                  { key: 'all', label: 'All' },
                  { key: 'last5', label: 'Last 5' },
                  { key: 'last10', label: 'Last 10' },
                  { key: 'last20', label: 'Last 20' },
                  ...(isAdmin ? [{ key: 'deleted', label: 'Deleted' }] : []),
                ]}
                active={matchFilter}
                onChange={(key) => handleFilterChange(key as MatchFilter)}
                className="mb-3"
              />
              {/* Match list — switches between completed and deleted */}
              {matchFilter === 'deleted' ? (
                <div className="space-y-2">
                  {deletedMatches.length > 0 ? deletedMatches.map((m) => (
                    <MatchCard
                      key={m.id}
                      item={m}
                      onTap={() => onResumeMatch(m.id)}
                      onRestore={async () => { await restoreMatch(m.id); }}
                      onPermanentDelete={async () => { await permanentDeleteMatch(m.id); }}
                    />
                  )) : (
                    <div className="py-6 text-center">
                      <Text size="sm" color="muted">No deleted matches</Text>
                    </div>
                  )}
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    {completedDbMatches.map((m) => (
                      <MatchCard
                        key={m.id}
                        item={m}
                        onTap={() => onResumeMatch(m.id)}
                        onDelete={isAdmin ? async () => {
                          await deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
                        } : undefined}
                        onRevert={isAdmin && !m.match_winner ? async () => {
                          await revertMatch(m.id);
                        } : undefined}
                      />
                    ))}
                  </div>
                  {completedDbMatches.length === 0 && matchFilter !== 'all' && (
                    <div className="py-6 text-center">
                      <Text size="sm" color="muted">No matches found</Text>
                    </div>
                  )}
                  {completedDbMatches.length >= 5 && (
                    <LoadMoreButton onLoadMore={() => loadMatchHistory(true)} />
                  )}
                </>
              )}
            </div>
          )}

          {/* Empty state — only when not loading, no filter, and truly no matches */}
          {!historyLoading && !hasLocalMatch && activeDbMatches.length === 0 && allCompleted.length === 0 && matchFilter === 'all' && (
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
  const [view, setViewState] = useState<'landing' | 'wizard' | 'match'>(() => {
    if (typeof window === 'undefined') return 'landing';
    const saved = sessionStorage.getItem('scoring-view');
    return saved === 'match' || saved === 'wizard' ? saved : 'landing';
  });
  const setView = (v: 'landing' | 'wizard' | 'match') => {
    sessionStorage.setItem('scoring-view', v);
    setViewState(v);
  };
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

  // On refresh: if view was 'match' and there's an active match, re-hydrate from DB
  useEffect(() => {
    if (view !== 'match') return;
    const { match: m, dbMatchId } = useScoringStore.getState();
    if (m && (m.status === 'scoring' || m.status === 'innings_break') && dbMatchId && isCloudMode()) {
      useScoringStore.getState().resumeMatch(dbMatchId);
    } else if (!m || (m.status !== 'scoring' && m.status !== 'innings_break')) {
      // No active match but view was 'match' — fall back to landing
      setView('landing');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']}>
        {/* Landing — renders within Shell (hamburger menu visible) */}
        {view === 'landing' && (
          <ScoringLanding
            onNewMatch={() => setView('wizard')}
            onContinue={match ? async () => {
              const { dbMatchId } = useScoringStore.getState();
              if (dbMatchId) await useScoringStore.getState().resumeMatch(dbMatchId);
              setView('match');
            } : undefined}
            onResumeMatch={async (matchId) => {
              const ok = await useScoringStore.getState().resumeMatch(matchId);
              if (ok) setView('match');
            }}
          />
        )}

        {/* Wizard + Active Match — full-screen overlay (hides Shell) */}
        {(view === 'wizard' || view === 'match') && (
          <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: 'var(--bg)' }}>
            <div
              className="absolute inset-0 overflow-y-auto overscroll-contain"
              style={{ WebkitOverflowScrolling: 'touch' }}
            >
              {view === 'wizard' && (
                <ScoringWizard
                  onComplete={() => setView('match')}
                  onBack={() => setView('landing')}
                />
              )}
              {view === 'match' && <ActiveMatch onBack={() => setView('landing')} />}
            </div>
          </div>
        )}
      </RoleGate>
    </AuthGate>
  );
}
