'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Button, Text, EmptyState } from '@/components/ui';
import { MdArrowBack, MdSportsCricket, MdAdd } from 'react-icons/md';
import ScoringWizard from './components/ScoringWizard';
import { ScoringScreen } from './components/ScoringScreen';

/* ── Landing Page (no active match) ── */
function ScoringLanding({ onNewMatch }: { onNewMatch: () => void }) {
  const router = useRouter();

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

      <div className="flex-1 px-4 py-8">
        <div className="mx-auto max-w-md space-y-8">
          {/* Hero section */}
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className="flex h-20 w-20 items-center justify-center rounded-2xl"
              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
            >
              <MdSportsCricket size={40} className="text-white" />
            </div>
            <div>
              <Text as="h1" size="2xl" weight="semibold" tracking="tight">
                Live Scoring
              </Text>
              <Text as="p" size="sm" color="muted" className="mt-1">
                Score matches ball-by-ball with real-time stats
              </Text>
            </div>
          </div>

          {/* Start New Match CTA */}
          <Button
            variant="primary"
            brand="cricket"
            size="xl"
            fullWidth
            onClick={onNewMatch}
          >
            <MdAdd size={20} /> Start New Match
          </Button>

          {/* Active Matches section (placeholder) */}
          <div>
            <Text as="h2" size="md" weight="semibold" className="mb-3">
              Your Active Matches
            </Text>
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
              <EmptyState
                icon={<MdSportsCricket size={32} style={{ color: 'var(--dim)' }} />}
                title="No active matches"
                description="Start a new match to begin scoring"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Active Match — wires to ScoringScreen ── */
function ActiveMatch() {
  const { match } = useScoringStore();
  if (!match) return null;
  return <ScoringScreen />;
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

  // Sync view with match status
  const matchStatus = match?.status ?? null;
  useEffect(() => {
    if (matchStatus === 'scoring' || matchStatus === 'innings_break') {
      setView('match');
    }
    if (matchStatus === 'completed') {
      useScoringStore.getState().reset();
      setView('landing');
    }
  }, [matchStatus]);

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
              <ScoringLanding onNewMatch={() => setView('wizard')} />
            )}
            {view === 'wizard' && (
              <ScoringWizard
                onComplete={() => setView('match')}
                onBack={() => setView('landing')}
              />
            )}
            {view === 'match' && <ActiveMatch />}
          </div>
        </div>
      </RoleGate>
    </AuthGate>
  );
}
