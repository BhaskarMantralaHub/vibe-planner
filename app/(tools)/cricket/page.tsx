'use client';

import { useEffect } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import SeasonSelector from './components/SeasonSelector';
import PlayerManager from './components/PlayerManager';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import DuesSummary from './components/DuesSummary';
import SettleUpModal from './components/SettleUpModal';
import ShareButton from './components/ShareButton';

function CricketDashboard() {
  const { user } = useAuthStore();
  const { loadAll, loading, selectedSeasonId, setShowExpenseForm, players } = useCricketStore();
  const activePlayers = players.filter((p) => p.is_active);

  useEffect(() => {
    document.title = 'Sunrisers Manteca';
  }, []);

  useEffect(() => {
    const cloud = isCloudMode();
    if (cloud && user) {
      loadAll(user.id);
    } else if (!cloud) {
      loadAll('');
    }
  }, [user, loadAll]);

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[var(--orange)] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="min-h-screen px-4 py-5 lg:px-8">
      {/* Header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-[22px] font-bold text-[var(--text)]">Cricket Team Expenses</h2>
        <SeasonSelector />
      </div>

      {!selectedSeasonId ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-3 text-4xl">🏏</div>
            <p className="text-[var(--muted)]">Create your first season to get started</p>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          {/* Action bar */}
          <div className="flex gap-3">
            <button
              onClick={() => setShowExpenseForm(true)}
              disabled={activePlayers.length === 0}
              className="rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-4 py-2.5 text-[14px] font-semibold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
              + Add Expense
            </button>
            {activePlayers.length === 0 && (
              <p className="self-center text-[13px] text-[var(--muted)]">Add players first to create expenses</p>
            )}
          </div>

          {/* Two column layout on desktop */}
          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-5">
              <PlayerManager />
              <ExpenseList />
            </div>
            <div className="space-y-5">
              <DuesSummary />
              <ShareButton />
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      <ExpenseForm />
      <SettleUpModal />
    </div>
  );
}

export default function CricketPage() {
  return (
    <AuthGate variant="cricket">
      <CricketDashboard />
    </AuthGate>
  );
}
