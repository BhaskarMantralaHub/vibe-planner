'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Button, Text, EmptyState, Skeleton, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, CardMenu, SegmentedControl, RefreshButton } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MdArrowBack, MdSportsCricket, MdAdd, MdDeleteOutline, MdRestoreFromTrash, MdDeleteForever, MdScoreboard, MdPlayArrow, MdSync } from 'react-icons/md';
import { FaEllipsisV } from 'react-icons/fa';
import type { MatchHistoryItem } from '@/types/scoring';
import ScoringWizard from './components/ScoringWizard';
import { ScoringScreen } from './components/ScoringScreen';

/* ── Load More Button ── */
function LoadMoreButton({ onLoadMore }: { onLoadMore: () => Promise<void> }) {
  const [loading, setLoading] = useState(false);

  return (
    <button
      onClick={async () => { setLoading(true); try { await onLoadMore(); } finally { setLoading(false); } }}
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
function MatchCard({ item, onTap, onDelete, onRestore, onPermanentDelete, onRevert, scorecardLoading, onResume, resumeLoading, onViewScoreboard, viewScoreboardLoading }: {
  item: MatchHistoryItem;
  onTap: () => void;
  onDelete?: () => Promise<void>;
  onRestore?: () => Promise<void>;
  onPermanentDelete?: () => Promise<void>;
  onRevert?: () => Promise<void>;
  scorecardLoading?: boolean;
  onResume?: () => void;
  resumeLoading?: boolean;
  onViewScoreboard?: () => void;
  viewScoreboardLoading?: boolean;
}) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [permanentDeleteOpen, setPermanentDeleteOpen] = useState(false);
  const [resumeConfirmOpen, setResumeConfirmOpen] = useState(false);
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
        className="w-full rounded-2xl overflow-hidden cursor-pointer select-none transition-all duration-200 active:scale-[0.98] hover:shadow-lg"
        style={{
          background: 'var(--card)',
          boxShadow: '0 2px 12px rgba(0,0,0,0.08), 0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid color-mix(in srgb, var(--cricket) 15%, var(--border))',
        }}
      >
        {/* ── Top bar: gradient for live, subtle for completed ── */}
        <div
          className="px-4 py-2 flex items-center justify-between"
          style={{
            background: isActive
              ? 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))'
              : 'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 12%, var(--card)), color-mix(in srgb, var(--cricket) 6%, var(--card)))',
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
            <div
              className="mt-3 rounded-xl overflow-hidden"
              style={{
                background: 'color-mix(in srgb, var(--cricket) 4%, var(--bg))',
                border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))',
              }}
            >
              {/* 1st innings */}
              <div className="px-4 py-3 flex items-center justify-between">
                <Text size="sm" weight="medium" color="muted" className="w-24 flex-shrink-0" truncate>
                  {inn1.batting_team === 'team_a' ? item.team_a_name : item.team_b_name}
                </Text>
                <div className="flex items-baseline gap-1">
                  <span className="text-[26px] font-extrabold tabular-nums leading-none" style={{ color: 'var(--text)' }}>
                    {inn1.total_runs}
                  </span>
                  <Text size="sm" weight="medium" color="dim" tabular>/{inn1.total_wickets}</Text>
                  <Text size="xs" weight="normal" color="dim" tabular className="ml-1.5">({inn1.total_overs} ov)</Text>
                </div>
              </div>

              {inn2 && (inn2.total_runs > 0 || inn2.total_wickets > 0) && (
                <>
                  <div className="mx-4 h-px" style={{ background: 'color-mix(in srgb, var(--cricket) 10%, var(--border))' }} />
                  {/* 2nd innings */}
                  <div className="px-4 py-3 flex items-center justify-between">
                    <Text size="sm" weight="medium" color="muted" className="w-24 flex-shrink-0" truncate>
                      {inn2.batting_team === 'team_a' ? item.team_a_name : item.team_b_name}
                    </Text>
                    <div className="flex items-baseline gap-1">
                      <span className="text-[26px] font-extrabold tabular-nums leading-none" style={{ color: 'var(--text)' }}>
                        {inn2.total_runs}
                      </span>
                      <Text size="sm" weight="medium" color="dim" tabular>/{inn2.total_wickets}</Text>
                      <Text size="xs" weight="normal" color="dim" tabular className="ml-1.5">({inn2.total_overs} ov)</Text>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {/* Level 3: Result */}
          {isCompleted && item.result_summary && (
            <div className="mt-3">
              <span
                className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[13px] font-bold"
                style={{
                  background: hasWin
                    ? 'color-mix(in srgb, var(--cricket) 12%, transparent)'
                    : isTied
                      ? 'color-mix(in srgb, var(--orange) 12%, transparent)'
                      : 'color-mix(in srgb, var(--muted) 10%, transparent)',
                  color: hasWin ? 'var(--cricket)' : isTied ? 'var(--orange)' : 'var(--muted)',
                }}
              >
                {hasWin && (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="flex-shrink-0 opacity-80">
                    <path d="M5 3h14c.6 0 1 .4 1 1v3c0 3.3-2.7 6-6 6h-.3c-.5 1.6-1.6 2.9-3 3.6V19h3v2H10v-2h3v-2.4c-1.4-.7-2.5-2-3-3.6H7c-3.3 0-6-2.7-6-6V4c0-.6.4-1 1-1h3zm9 8c2.2 0 4-1.8 4-4V5h-4v6zM6 5H3v2c0 2.2 1.8 4 4 4V5H6z"/>
                  </svg>
                )}
                {item.result_summary}
              </span>
            </div>
          )}
        </div>

        {/* Level 4: Meta */}
        <div className="px-4 py-2" style={{ borderTop: '1px solid color-mix(in srgb, var(--cricket) 6%, var(--border))', background: 'color-mix(in srgb, var(--cricket) 2%, var(--card))' }}>
          <Text size="xs" weight="medium" color="dim">
            {item.scorer_name ? `Scored by ${item.scorer_name}` : 'Practice Match'}
          </Text>
        </div>

        {/* Resume Scoring + View Scoreboard CTAs — for active matches */}
        {(onResume || onViewScoreboard) && (
          <div
            className="px-4 py-3 flex flex-col gap-2 border-t"
            style={{ borderColor: 'var(--border)', background: 'var(--surface)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {onViewScoreboard && (
              <button
                disabled={viewScoreboardLoading}
                onClick={onViewScoreboard}
                className={cn(
                  'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4',
                  'font-semibold text-sm transition-all duration-150 active:scale-[0.98]',
                  'cursor-pointer',
                  viewScoreboardLoading
                    ? 'opacity-60 cursor-not-allowed'
                    : '',
                )}
                style={{
                  background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))',
                  color: 'white',
                  boxShadow: '0 2px 8px color-mix(in srgb, var(--cricket) 25%, transparent)',
                }}
              >
                {viewScoreboardLoading ? (
                  <>
                    <span className="h-3.5 w-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                    Loading…
                  </>
                ) : (
                  <>
                    <MdScoreboard size={16} />
                    View Scoreboard
                  </>
                )}
              </button>
            )}
            {onResume && (
            <button
              disabled={resumeLoading}
              onClick={() => item.scorer_name ? setResumeConfirmOpen(true) : onResume()}
              className={cn(
                'w-full flex items-center justify-center gap-2 rounded-xl py-2.5 px-4',
                'font-semibold text-sm transition-all duration-150 active:scale-[0.98]',
                'border-2 cursor-pointer',
                resumeLoading
                  ? 'opacity-60 cursor-not-allowed border-[var(--cricket)]/40 text-[var(--cricket)]/60'
                  : 'border-[var(--cricket)] text-[var(--cricket)] hover:bg-[var(--cricket)]/8',
              )}
            >
              {resumeLoading ? (
                <>
                  <span className="h-3.5 w-3.5 rounded-full border-2 border-[var(--cricket)]/40 border-t-[var(--cricket)] animate-spin" />
                  Connecting…
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse flex-shrink-0" />
                  Resume Scoring
                </>
              )}
            </button>
            )}
          </div>
        )}
      </div>

      {/* Actions Menu */}
      {menuOpen && (
        <CardMenu
          anchorRef={menuBtnRef}
          onClose={() => setMenuOpen(false)}
          width={180}
          items={[
            { label: scorecardLoading ? 'Loading...' : 'View Scorecard', icon: <MdScoreboard size={15} />, color: 'var(--text)', onClick: onTap },
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

      {/* Resume Scoring Confirmation Dialog */}
      {onResume && (
        <Dialog open={resumeConfirmOpen} onOpenChange={setResumeConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Take Over Scoring?</DialogTitle>
              <DialogDescription>
                <Text as="span" weight="semibold" style={{ color: 'var(--cricket)' }}>{item.scorer_name}</Text> is currently scoring this match. Please ask {item.scorer_name?.split(' ')[0]} to stop scoring first, then continue.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="secondary" onClick={() => setResumeConfirmOpen(false)}>Cancel</Button>
              <Button variant="primary" brand="cricket" onClick={() => { setResumeConfirmOpen(false); onResume(); }}>
                Yes, Continue
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

/* ── Landing Page ── */
function ScoringLanding({ onNewMatch, onContinue, onResumeMatch, onViewScorecard }: {
  onNewMatch: () => void;
  onContinue?: () => Promise<void> | void;
  onResumeMatch: (matchId: string) => Promise<void> | void;
  onViewScorecard: (matchId: string) => Promise<void> | void;
}) {
  const router = useRouter();
  const { match, innings, dbMatchId, matchHistory, deletedMatches, historyLoading, loadMatchHistory, loadDeletedMatches, deleteMatch, restoreMatch, permanentDeleteMatch, revertMatch } = useScoringStore();
  const { user, userAccess } = useAuthStore();
  const [resuming, setResuming] = useState<string | boolean>(false); // true for local, matchId string for DB
  const [scorecardLoading, setScorecardLoading] = useState<string | false>(false); // matchId when loading scorecard
  const isAdmin = userAccess.includes('admin');

  const handleViewScorecard = async (matchId: string) => {
    if (scorecardLoading) return;
    setScorecardLoading(matchId);
    try {
      await onViewScorecard(matchId);
    } finally {
      setScorecardLoading(false);
    }
  };

  // Load matches from DB on mount (AuthGate guarantees user is authenticated)
  useEffect(() => {
    if (isCloudMode()) {
      loadMatchHistory();
      if (isAdmin) loadDeletedMatches();

      // Verify local match is still active on server — clear stale localStorage if not
      const { dbMatchId, match: localMatch } = useScoringStore.getState();
      if (localMatch && dbMatchId && (localMatch.status === 'scoring' || localMatch.status === 'innings_break')) {
        useScoringStore.getState().resumeMatch(dbMatchId).then((ok) => {
          if (!ok) {
            // Match was completed/deleted on another device — local state already reset by resumeMatch
            sessionStorage.removeItem('scoring-view');
          }
        }).catch(() => { /* network error on stale check — ignore, match stays local */ });
      }
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
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
              <MdSportsCricket size={20} className="text-white" />
            </div>
            <div className="flex-1">
              <Text as="h1" size="lg" weight="bold">Live Scoring</Text>
              <Text as="p" size="2xs" color="muted">Ball-by-ball match scoring</Text>
            </div>
            <RefreshButton
              onRefresh={async () => {
                await loadMatchHistory(false);
                if (isAdmin) await loadDeletedMatches();
                toast.success('Matches refreshed');
              }}
              variant="bordered"
              title="Refresh matches"
            />
          </div>

          {/* Local active match — Continue Scoring (scorer's device) */}
          {hasLocalMatch && match && currentInnings && onContinue && (
            <div className="rounded-2xl border border-[var(--cricket)]/30 overflow-hidden shadow-[inset_0_1px_0_0_var(--inner-glow)]" style={{ background: 'color-mix(in srgb, var(--cricket) 8%, var(--card))' }}>
              <div className="px-4 pt-3 pb-2 flex items-start justify-between">
                <div>
                  <Text size="2xs" weight="semibold" color="cricket" uppercase tracking="wider">Your Active Match</Text>
                  <Text as="h3" size="md" weight="bold" className="mt-1">
                    {match.team_a.name} vs {match.team_b.name}
                  </Text>
                  <Text size="sm" color="muted" tabular className="mt-0.5">
                    {currentInnings.total_runs}/{currentInnings.total_wickets} ({currentInnings.total_overs.toFixed(1)} ov)
                  </Text>
                </div>
                <button
                  onClick={async () => {
                    const { dbMatchId: mid } = useScoringStore.getState();
                    if (!mid || !isCloudMode()) return;
                    const ok = await useScoringStore.getState().resumeMatch(mid);
                    if (!ok) {
                      toast.info('Match was ended or deleted on another device');
                      loadMatchHistory();
                    } else {
                      toast.success('Synced with server');
                    }
                  }}
                  className="flex-shrink-0 rounded-lg p-2 cursor-pointer text-[var(--cricket)] hover:bg-[var(--cricket)]/10 transition-colors"
                  title="Sync with server"
                >
                  <MdSync size={18} />
                </button>
              </div>
              <div className="px-4 pb-3">
                <Button variant="primary" brand="cricket" size="lg" fullWidth
                  loading={resuming === true}
                  onClick={async () => {
                    if (resuming) return;
                    setResuming(true);
                    try { await onContinue!(); } finally { setResuming(false); }
                  }}>
                  Continue Scoring
                </Button>
              </div>
            </div>
          )}

          {/* Start New Match — hidden while loading, blocked when active match exists */}
          {!historyLoading && (
            hasLocalMatch || activeDbMatches.length > 0 ? (
              <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center">
                <Text as="p" size="xs" color="muted">
                  {hasLocalMatch
                    ? 'You have a match in progress. Continue scoring or end it first.'
                    : 'There is an active match. End or delete it before starting a new one.'}
                </Text>
              </div>
            ) : (
              <Button
                variant="primary"
                brand="cricket"
                size="xl"
                fullWidth
                onClick={onNewMatch}
              >
                <MdAdd size={20} /> Start New Match
              </Button>
            )
          )}


          {/* Loading skeleton */}
          {historyLoading && (
            <div className="space-y-3">
              {Array.from({ length: 2 }).map((_, i) => (
                <div key={i} className="rounded-2xl border border-[var(--border)]/60 bg-gradient-to-br from-[var(--card)] to-[var(--card-end)] overflow-hidden">
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
                    onTap={() => handleViewScorecard(m.id)}
                    onDelete={isAdmin ? async () => {
                      await deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
                    } : undefined}
                    onResume={async () => {
                      if (resuming) return;
                      setResuming(m.id);
                      try { await onResumeMatch(m.id); } finally { setResuming(false); }
                    }}
                    resumeLoading={resuming === m.id}
                    onViewScoreboard={async () => {
                      if (scorecardLoading) return;
                      setScorecardLoading(m.id);
                      try { await onViewScorecard(m.id); } finally { setScorecardLoading(false); }
                    }}
                    viewScoreboardLoading={scorecardLoading === m.id}
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
                      onTap={() => handleViewScorecard(m.id)}
                      scorecardLoading={scorecardLoading === m.id}
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
                        onTap={() => handleViewScorecard(m.id)}
                        scorecardLoading={scorecardLoading === m.id}
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
            <div className="rounded-2xl border border-[var(--border)]/60 bg-gradient-to-br from-[var(--card)] to-[var(--card-end)] p-6 shadow-[inset_0_1px_0_0_var(--inner-glow)]">
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
function ActiveMatch({ onBack, readOnly = false }: { onBack: () => void; readOnly?: boolean }) {
  const { match } = useScoringStore();
  if (!match) return null;

  const handleRefresh = async () => {
    const { dbMatchId, match: m } = useScoringStore.getState();
    if (!dbMatchId || !isCloudMode()) return;
    try {
      // readOnly or completed → viewScorecard (no scorer claim); active scorer → resumeMatch
      const isActive = m?.status === 'scoring' || m?.status === 'innings_break';
      const ok = isActive && !readOnly
        ? await useScoringStore.getState().resumeMatch(dbMatchId)
        : await useScoringStore.getState().viewScorecard(dbMatchId);
      if (ok) {
        toast.success('Scores updated');
      } else {
        toast.error('Match is no longer available');
        onBack();
      }
    } catch {
      toast.error('Could not refresh — check your connection');
    }
  };

  return <ScoringScreen onBack={onBack} onRefresh={handleRefresh} readOnly={readOnly} />;
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
  const [readOnly, setReadOnly] = useState(false);
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

  // On refresh: if view was 'match', re-hydrate from DB
  useEffect(() => {
    if (view !== 'match') return;
    const { match: m, dbMatchId } = useScoringStore.getState();
    if (!m || !dbMatchId || !isCloudMode()) {
      if (!m) setView('landing');
      return;
    }
    const isActive = m.status === 'scoring' || m.status === 'innings_break';
    if (isActive) {
      // Active match: resumeMatch re-hydrates + claims scorer; resets if completed/deleted on another device
      useScoringStore.getState().resumeMatch(dbMatchId).then((ok) => {
        if (!ok) setView('landing');
      }).catch(() => setView('landing'));
    } else if (m.status === 'completed') {
      // Completed match: viewScorecard re-hydrates without scorer claim (avoids RLS error)
      useScoringStore.getState().viewScorecard(dbMatchId).then((ok) => {
        if (!ok) setView('landing');
      }).catch(() => setView('landing'));
    } else {
      setView('landing');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        {/* Landing — renders within Shell (hamburger menu visible) */}
        {view === 'landing' && (
          <ScoringLanding
            onNewMatch={() => setView('wizard')}
            onContinue={match ? async () => {
              setReadOnly(false);
              const { dbMatchId } = useScoringStore.getState();
              if (dbMatchId) {
                const ok = await useScoringStore.getState().resumeMatch(dbMatchId);
                if (!ok) {
                  toast.info('Match was already ended on another device');
                  return;
                }
              }
              setView('match');
            } : undefined}
            onResumeMatch={async (matchId) => {
              setReadOnly(false);
              const ok = await useScoringStore.getState().resumeMatch(matchId);
              if (ok) {
                setView('match');
              } else {
                toast.error('Could not resume match — it may have been ended or deleted');
                useScoringStore.getState().loadMatchHistory();
              }
            }}
            onViewScorecard={async (matchId) => {
              setReadOnly(true);
              const ok = await useScoringStore.getState().viewScorecard(matchId);
              if (ok) setView('match');
              else { setReadOnly(false); toast.error('Could not load scorecard'); }
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
              {view === 'match' && <ActiveMatch onBack={() => { setReadOnly(false); setView('landing'); }} readOnly={readOnly} />}
            </div>
          </div>
        )}
      </RoleGate>
    </AuthGate>
  );
}
