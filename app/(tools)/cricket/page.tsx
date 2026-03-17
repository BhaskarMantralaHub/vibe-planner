'use client';

import { useEffect, useState, useRef } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { FaUsers, FaReceipt, FaBalanceScale, FaChartPie, FaShareAlt } from 'react-icons/fa';
import SeasonSelector from './components/SeasonSelector';
import PlayerManager from './components/PlayerManager';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import DuesSummary from './components/DuesSummary';
import SettleUpModal from './components/SettleUpModal';
import ShareButton from './components/ShareButton';
import CategoryDonut from './components/CategoryDonut';
import MonthlyBar from './components/MonthlyBar';

type View = 'players' | 'expenses' | 'dues' | 'charts' | 'share';

const VIEWS: { key: View; label: string; icon: React.ReactNode }[] = [
  { key: 'players', label: 'Players', icon: <FaUsers size={14} /> },
  { key: 'expenses', label: 'Expenses', icon: <FaReceipt size={14} /> },
  { key: 'dues', label: 'Dues', icon: <FaBalanceScale size={14} /> },
  { key: 'charts', label: 'Charts', icon: <FaChartPie size={14} /> },
  { key: 'share', label: 'Share', icon: <FaShareAlt size={13} /> },
];

function ViewSelector({ active, onChange, playerCount, expenseCount }: {
  active: View;
  onChange: (v: View) => void;
  playerCount: number;
  expenseCount: number;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) {
      document.addEventListener('mousedown', handleClick);
      return () => document.removeEventListener('mousedown', handleClick);
    }
  }, [open]);

  const activeView = VIEWS.find((v) => v.key === active)!;
  const getBadge = (key: View) => {
    if (key === 'players') return playerCount;
    if (key === 'expenses') return expenseCount;
    return 0;
  };

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium cursor-pointer transition-all bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--muted)] text-[var(--text)]"
      >
        <span className="text-[var(--orange)]">{activeView.icon}</span>
        <span>{activeView.label}</span>
        {getBadge(active) > 0 && (
          <span className="text-[12px] font-bold px-1.5 py-0.5 rounded-md bg-[var(--orange)]/15 text-[var(--orange)]">
            {getBadge(active)}
          </span>
        )}
        <span className={`text-[var(--muted)] text-[10px] transition-transform ${open ? 'rotate-180' : ''}`}>▾</span>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 min-w-[200px] rounded-xl border border-[var(--border)] bg-[var(--card)] shadow-xl py-1 animate-slide-in">
          {VIEWS.map((v) => {
            const isActive = active === v.key;
            const badge = getBadge(v.key);
            return (
              <button
                key={v.key}
                onClick={() => { onChange(v.key); setOpen(false); }}
                className={`w-full flex items-center gap-3 px-4 py-2.5 text-[14px] cursor-pointer transition-colors ${
                  isActive
                    ? 'text-[var(--orange)] bg-[var(--orange)]/5 font-semibold'
                    : 'text-[var(--text)] hover:bg-[var(--hover-bg)]'
                }`}
              >
                <span className={isActive ? 'text-[var(--orange)]' : 'text-[var(--muted)]'}>{v.icon}</span>
                <span className="flex-1 text-left">{v.label}</span>
                {badge > 0 && (
                  <span className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md min-w-[22px] text-center ${
                    isActive
                      ? 'bg-[var(--orange)]/15 text-[var(--orange)]'
                      : 'bg-[var(--hover-bg)] text-[var(--dim)]'
                  }`}>
                    {badge}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function CricketDashboard() {
  const { user } = useAuthStore();
  const { loadAll, loading, selectedSeasonId, setShowExpenseForm, players, expenses } = useCricketStore();
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const activePlayers = players.filter((p) => p.is_active);
  const seasonExpenses = expenses.filter((e) => e.season_id === selectedSeasonId);
  const [activeView, setActiveView] = useState<View>('players');

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
    <div className="min-h-screen overflow-x-hidden w-full px-3 py-5 sm:px-4 lg:px-8">
      {/* Header */}
      <div className="mb-5 flex items-center justify-between gap-3 flex-wrap">
        <h2 className="text-[20px] sm:text-[22px] font-bold text-[var(--text)]">Cricket Team Expenses</h2>
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
        <>
          {/* View selector + action buttons */}
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <ViewSelector
              active={activeView}
              onChange={setActiveView}
              playerCount={activePlayers.length}
              expenseCount={seasonExpenses.length}
            />
            {isAdmin && activeView === 'expenses' && (
              <button
                onClick={() => setShowExpenseForm(true)}
                disabled={activePlayers.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-4 py-2.5 text-[14px] font-semibold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add Expense
              </button>
            )}
            {isAdmin && activeView === 'expenses' && activePlayers.length === 0 && (
              <p className="text-[13px] text-[var(--muted)]">Add players first</p>
            )}
          </div>

          {/* Content */}
          <div className="min-w-0">
            {activeView === 'players' && <PlayerManager />}
            {activeView === 'expenses' && <ExpenseList />}
            {activeView === 'dues' && <DuesSummary />}
            {activeView === 'charts' && (
              <div className="space-y-5">
                <CategoryDonut />
                <MonthlyBar />
              </div>
            )}
            {activeView === 'share' && <ShareButton />}
          </div>
        </>
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
