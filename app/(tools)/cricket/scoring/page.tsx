'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Button, Text, EmptyState, Dialog, DialogContent, DialogTitle, DialogDescription, DialogHeader, DialogFooter, Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MdArrowBack, MdSportsCricket, MdAdd, MdDeleteOutline, MdRestoreFromTrash, MdDeleteForever } from 'react-icons/md';
import { FaEllipsisV } from 'react-icons/fa';
import type { MatchHistoryItem } from '@/types/scoring';
import ScoringWizard from './components/ScoringWizard';
import { ScoringScreen } from './components/ScoringScreen';

/* ── Deleted Match Card (admin only) ── */
function DeletedMatchCard({ item, onRestore, onPermanentDelete }: {
  item: MatchHistoryItem;
  onRestore: () => Promise<void>;
  onPermanentDelete: () => Promise<void>;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [restoring, setRestoring] = useState(false);

  return (
    <>
      <div className="rounded-xl border border-[var(--border)]/50 bg-[var(--card)] p-3 opacity-70">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <Text size="sm" weight="medium" truncate>{item.team_a_name} vs {item.team_b_name}</Text>
            {item.title && item.title !== `${item.team_a_name} vs ${item.team_b_name}` && (
              <Text size="2xs" color="dim" truncate>{item.title}</Text>
            )}
            <Text size="2xs" color="dim" className="mt-0.5">
              {item.match_date} · Deleted{(item as Record<string, unknown>).deleted_by ? ` by ${(item as Record<string, unknown>).deleted_by}` : ''}
            </Text>
          </div>
          <Text size="2xs" weight="bold" color="muted" uppercase>Deleted</Text>
        </div>
        <div className="flex gap-2 mt-2">
          <button
            onClick={async () => { setRestoring(true); await onRestore(); setRestoring(false); }}
            disabled={restoring}
            className={cn(
              'flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg cursor-pointer transition-all active:scale-[0.96]',
              restoring && 'opacity-50 cursor-not-allowed active:scale-100',
            )}
            style={{ background: 'color-mix(in srgb, var(--cricket) 10%, transparent)', color: 'var(--cricket)' }}
          >
            <MdRestoreFromTrash size={15} />
            <Text size="xs" weight="semibold" color="cricket">{restoring ? 'Restoring...' : 'Restore'}</Text>
          </button>
          <button
            onClick={() => setConfirmDelete(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg cursor-pointer transition-all active:scale-[0.96]"
            style={{ background: 'color-mix(in srgb, var(--red) 10%, transparent)', color: 'var(--red)' }}
          >
            <MdDeleteForever size={15} />
            <Text size="xs" weight="semibold" color="danger">Delete Forever</Text>
          </button>
        </div>
      </div>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Permanently Delete?</DialogTitle>
            <DialogDescription>
              This will permanently remove &quot;{item.team_a_name} vs {item.team_b_name}&quot; and all its ball-by-ball data. This cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button variant="danger" onClick={async () => { setConfirmDelete(false); await onPermanentDelete(); }}>
              Delete Forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ── Match Card ── */
function MatchCard({ item, onTap, onDelete }: { item: MatchHistoryItem; onTap: () => void; onDelete?: () => Promise<void> }) {
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
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
            {onDelete && (
              <button
                onClick={(e) => { e.stopPropagation(); setActionsOpen(true); }}
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

      {/* Actions Drawer (same pattern as GalleryPost) */}
      <Drawer open={actionsOpen} onOpenChange={setActionsOpen}>
        <DrawerHandle />
        <DrawerTitle>Actions</DrawerTitle>
        <DrawerBody className="px-4 pb-6 pt-2">
          <div className="space-y-1">
            <button
              onClick={() => { setActionsOpen(false); onTap(); }}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'color-mix(in srgb, var(--cricket) 12%, transparent)' }}>
                <MdSportsCricket size={18} style={{ color: 'var(--cricket)' }} />
              </div>
              <div className="text-left">
                <Text size="sm" weight="semibold">View Scorecard</Text>
                <Text as="p" size="2xs" color="dim">Full match details</Text>
              </div>
            </button>
            <button
              onClick={() => { setActionsOpen(false); setDeleteOpen(true); }}
              className="w-full flex items-center gap-3.5 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)]"
            >
              <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(239,68,68,0.12)' }}>
                <MdDeleteOutline size={18} style={{ color: 'var(--red)' }} />
              </div>
              <div className="text-left">
                <Text size="sm" weight="semibold" color="danger">Delete Match</Text>
                <Text as="p" size="2xs" color="dim">Remove from match history</Text>
              </div>
            </button>
          </div>
          <button
            onClick={() => setActionsOpen(false)}
            className="w-full mt-3 py-3 rounded-xl text-[15px] font-semibold cursor-pointer"
            style={{ background: 'var(--surface)', color: 'var(--text)' }}
          >
            Cancel
          </button>
        </DrawerBody>
      </Drawer>

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
  const { match, innings, matchHistory, deletedMatches, loadMatchHistory, loadDeletedMatches, deleteMatch, restoreMatch, permanentDeleteMatch } = useScoringStore();
  const { user, userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');

  // Load matches from DB every time this component mounts
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
                    onDelete={isAdmin ? async () => {
                      await deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
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
                    onDelete={isAdmin ? async () => {
                      await deleteMatch(m.id, user?.user_metadata?.full_name as string || 'Admin');
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

          {/* Recently Deleted (admin only) */}
          {isAdmin && deletedMatches.length > 0 && (
            <div>
              <Text as="h2" size="sm" weight="semibold" color="muted" className="mb-2">
                Recently Deleted
              </Text>
              <div className="space-y-2">
                {deletedMatches.map((m) => (
                  <DeletedMatchCard
                    key={m.id}
                    item={m}
                    onRestore={async () => { await restoreMatch(m.id); }}
                    onPermanentDelete={async () => { await permanentDeleteMatch(m.id); }}
                  />
                ))}
              </div>
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
