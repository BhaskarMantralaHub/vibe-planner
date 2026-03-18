'use client';

import { useEffect, useState, useRef } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { FaUsers, FaReceipt, FaChartPie, FaShareAlt, FaMoneyBillWave, FaWallet } from 'react-icons/fa';
import { MdSportsCricket } from 'react-icons/md';
import { formatCurrency } from './lib/utils';
import SeasonSelector from './components/SeasonSelector';
import PlayerManager from './components/PlayerManager';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import ShareButton from './components/ShareButton';
import CategoryDonut from './components/CategoryDonut';
import MonthlyBar from './components/MonthlyBar';
import TossWidget from './components/TossWidget';
import FeeTracker from './components/FeeTracker';
import SponsorshipSection from './components/SponsorshipSection';

type View = 'players' | 'expenses' | 'fees' | 'charts' | 'toss' | 'share';

/* ── Animated counter hook ── */
function useAnimatedValue(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    let raf: number;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(start + diff * eased));
      if (progress < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

/* ── Summary Stats Bar ── */
function SummaryStats({ totalSpent, poolBalance, playerCount, feesPaid, feesTotal }: {
  totalSpent: number; poolBalance: number; playerCount: number; feesPaid: number; feesTotal: number;
}) {
  const animSpent = useAnimatedValue(Math.round(totalSpent));
  const animPool = useAnimatedValue(Math.round(poolBalance));
  const animPlayers = useAnimatedValue(playerCount);
  const animPaid = useAnimatedValue(feesPaid);

  const feeColor = feesTotal > 0 && feesPaid === feesTotal ? 'var(--green)' : 'var(--blue)';

  const stats = [
    { label: 'Total Spent', value: formatCurrency(animSpent), color: 'var(--red)', icon: <FaReceipt size={16} /> },
    { label: 'Fees Paid', value: `${animPaid} of ${feesTotal}`, color: feeColor, icon: <FaMoneyBillWave size={16} /> },
    { label: 'Pool Balance', value: `${poolBalance < 0 ? '-' : ''}${formatCurrency(animPool)}`, color: poolBalance < 0 ? 'var(--red)' : 'var(--green)', icon: <FaWallet size={16} /> },
    { label: 'Players', value: String(animPlayers), color: 'var(--orange)', icon: <MdSportsCricket size={18} /> },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{ color: s.color }}>{s.icon}</span>
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--muted)]">{s.label}</span>
          </div>
          <p className="text-[22px] sm:text-[26px] font-extrabold leading-none tabular-nums" style={{ color: s.color }}>
            {s.value}
          </p>
        </div>
      ))}
    </div>
  );
}

const VIEWS: { key: View; label: string; short: string; icon: React.ReactNode }[] = [
  { key: 'players', label: 'Players', short: 'Players', icon: <FaUsers size={14} /> },
  { key: 'fees', label: 'Fees & Sponsors', short: 'Fees', icon: <FaMoneyBillWave size={14} /> },
  { key: 'expenses', label: 'Expenses', short: 'Expenses', icon: <FaReceipt size={14} /> },
  { key: 'charts', label: 'Expense Charts', short: 'Charts', icon: <FaChartPie size={14} /> },
  { key: 'toss', label: 'Toss', short: 'Toss', icon: <MdSportsCricket size={15} /> },
  { key: 'share', label: 'Share', short: 'Share', icon: <FaShareAlt size={13} /> },
];

function ViewTabs({ active, onChange, playerCount, expenseCount }: {
  active: View;
  onChange: (v: View) => void;
  playerCount: number;
  expenseCount: number;
}) {
  const getBadge = (key: View) => {
    if (key === 'players') return playerCount;
    if (key === 'expenses') return expenseCount;
    return 0;
  };

  return (
    <div className="flex flex-wrap gap-1.5 sm:gap-2">
      {VIEWS.map((v) => {
        const isActive = active === v.key;
        const badge = getBadge(v.key);
        return (
          <button
            key={v.key}
            onClick={() => onChange(v.key)}
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[13px] font-medium cursor-pointer transition-all ${
              isActive
                ? 'bg-[var(--orange)] text-white font-bold border border-[var(--orange)]'
                : 'bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--orange)]/30'
            }`}
            style={isActive ? { boxShadow: '0 2px 12px rgba(217,119,6,0.3)' } : undefined}
          >
            <span className={isActive ? 'text-white/90' : ''}>{v.icon}</span>
            <span className="hidden sm:inline">{v.label}</span>
            <span className="sm:hidden">{v.short}</span>
            {badge > 0 && (
              <span className={`text-[10px] font-extrabold px-1.5 py-0.5 rounded-full min-w-[18px] text-center leading-none ${
                isActive
                  ? 'bg-white/25 text-white'
                  : 'bg-[var(--hover-bg)] text-[var(--dim)]'
              }`}>
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function CricketDashboard() {
  const { user } = useAuthStore();
  const { loadAll, loading, selectedSeasonId, setShowExpenseForm, players, expenses, fees, sponsorships } = useCricketStore();
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const activePlayers = players.filter((p) => p.is_active);
  const [activeView, setActiveView] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as View;
      if (['players', 'expenses', 'fees', 'charts', 'toss', 'share'].includes(hash)) return hash;
    }
    return 'players';
  });

  const handleViewChange = (view: View) => {
    setActiveView(view);
    window.history.replaceState(null, '', `#${view}`);
  };

  // Keyboard shortcuts: 1-6 to switch views
  useEffect(() => {
    if (!selectedSeasonId) return;
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const viewKeys: Record<string, View> = { '1': 'players', '2': 'fees', '3': 'expenses', '4': 'charts', '5': 'toss', '6': 'share' };
      const view = viewKeys[e.key];
      if (view) handleViewChange(view);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedSeasonId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Compute summary stats
  const season = useCricketStore.getState().seasons.find((s) => s.id === selectedSeasonId);
  const feeAmount = season?.fee_amount ?? 60;
  const seasonExpensesList = expenses.filter((e) => e.season_id === selectedSeasonId && !e.deleted_at);
  const totalSpent = seasonExpensesList.reduce((sum, e) => sum + Number(e.amount), 0);
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feesPaid = seasonFees.filter((f) => Number(f.amount_paid) >= feeAmount).length;
  const seasonSponsors = sponsorships.filter((s) => s.season_id === selectedSeasonId && !s.deleted_at);
  const totalCollected = seasonFees.reduce((sum, f) => sum + Number(f.amount_paid), 0)
    + seasonSponsors.reduce((sum, s) => sum + Number(s.amount), 0);
  const poolBalance = totalCollected - totalSpent;

  useEffect(() => {
    document.title = 'Sunrisers Manteca';
    // Set cricket favicon
    const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
      || document.createElement('link');
    link.rel = 'icon';
    link.href = '/cricket-logo.png';
    document.head.appendChild(link);
    return () => { link.href = '/favicon.ico'; };
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
    <div className="relative min-h-screen w-full px-3 py-5 sm:px-4 lg:px-8 overflow-hidden">
      {/* Ambient background blobs — cricket warm tones */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-[20%] -right-[10%] h-[500px] w-[500px] rounded-full opacity-[0.07] blur-[100px]"
          style={{ background: 'radial-gradient(circle, #F59E0B, transparent 70%)' }} />
        <div className="absolute top-[30%] -left-[15%] h-[400px] w-[400px] rounded-full opacity-[0.05] blur-[90px]"
          style={{ background: 'radial-gradient(circle, #EF4444, transparent 70%)' }} />
        <div className="absolute -bottom-[10%] right-[20%] h-[450px] w-[450px] rounded-full opacity-[0.06] blur-[100px]"
          style={{ background: 'radial-gradient(circle, #D97706, transparent 70%)' }} />
      </div>

      {/* Header — greeting + pulse */}
      {(() => {
        const hour = new Date().getHours();
        // Find current user's player record for role-based greeting
        const myPlayer = players.find((p) => p.user_id === user?.id && p.is_active);
        const firstName = myPlayer?.name?.split(' ')[0]
          || (user?.user_metadata?.full_name as string)?.split(' ')[0]
          || '';
        const role = myPlayer?.player_role ?? '';
        const isCaptain = myPlayer?.designation === 'captain';
        const isVC = myPlayer?.designation === 'vice-captain';

        // Role-based greetings
        const roleGreetings: Record<string, string[]> = {
          batsman: ['Time to tonk some runs', 'Pad up and get going', 'Cover drive kind of day', 'Eyes on the ball today'],
          bowler: ['Time to hit the deck', 'Let\'s rattle some stumps', 'Seam it or spin it', 'Yorker length today'],
          'all-rounder': ['Bat, ball, and hustle', 'Double threat energy', 'All-round domination', 'Jack of all trades'],
          keeper: ['Sharp hands today', 'Behind the stumps and ready', 'Catch everything', 'Eyes like a hawk'],
        };
        const captainGreetings = ['Lead from the front, skipper', 'Your team awaits, captain', 'Set the field, skipper'];
        const vcGreetings = ['Ready to step up, vice', 'Right hand of the captain', 'Keep the ship steady'];
        const defaultGreetings = ['Howzat', 'Game on', 'Let\'s play', 'What a day for cricket'];

        // Pick greeting pool: captain > vc > role > default
        const greetPool = isCaptain ? captainGreetings
          : isVC ? vcGreetings
          : roleGreetings[role] ?? defaultGreetings;

        // Consistent per day
        const dayIndex = new Date().getDate() % greetPool.length;
        const timeGreeting = greetPool[dayIndex];
        return (
          <div className="mb-5 flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-[20px] sm:text-[24px] font-bold text-[var(--text)] tracking-tight">
                {timeGreeting}{firstName ? `, ${firstName}` : ''} <MdSportsCricket className="inline-block ml-1 text-[var(--orange)]" size={22} />
              </h2>
            </div>
            <SeasonSelector />
          </div>
        );
      })()}

      {!selectedSeasonId ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="text-center">
            <div className="mb-3 text-4xl">🏏</div>
            <p className="text-[var(--muted)]">Create your first season to get started</p>
          </div>
        </div>
      ) : (
        <>
          {/* View tabs */}
          <div className="mb-4">
            <ViewTabs
              active={activeView}
              onChange={handleViewChange}
              playerCount={activePlayers.length}
              expenseCount={seasonExpensesList.length}
            />
          </div>

          {/* Action buttons */}
          {isAdmin && activeView === 'expenses' && (
            <div className="mb-4 flex items-center gap-2">
              <button
                onClick={() => setShowExpenseForm(true)}
                disabled={activePlayers.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-4 py-2.5 text-[14px] font-semibold text-white cursor-pointer hover:opacity-90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                + Add Expense
              </button>
              {activePlayers.length === 0 && (
                <p className="text-[13px] text-[var(--muted)]">Add players first</p>
              )}
            </div>
          )}

          {/* Summary Stats — show only on players, fees, charts */}
          {activeView !== 'toss' && activeView !== 'share' && activeView !== 'expenses' && (
            <SummaryStats
              totalSpent={totalSpent}
              poolBalance={poolBalance}
              playerCount={activePlayers.length}
              feesPaid={feesPaid}
              feesTotal={activePlayers.length}
            />
          )}

          {/* Content */}
          <div className="min-w-0">
            {activeView === 'players' && <PlayerManager />}
            {activeView === 'expenses' && <ExpenseList />}
            {activeView === 'charts' && (
              <div className="space-y-5">
                <CategoryDonut />
                <MonthlyBar />
              </div>
            )}
            {activeView === 'fees' && (
              <div className="space-y-5">
                <FeeTracker />
                <SponsorshipSection />
              </div>
            )}
            {activeView === 'toss' && <TossWidget />}
            {activeView === 'share' && <ShareButton />}
          </div>
        </>
      )}

      {/* Modals */}
      <ExpenseForm />

      {/* Footer */}
      <footer className="mt-16 mb-8 text-center">
        <p className="text-[11px] text-[var(--dim)] tracking-wide">
          &copy; Designed by <span className="font-semibold text-[var(--muted)]">Bhaskar Mantrala</span>
        </p>
      </footer>
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
