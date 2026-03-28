'use client';

import { useEffect, useState, useRef } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { FaUsers, FaReceipt, FaChartPie, FaShareAlt, FaMoneyBillWave, FaWallet, FaCamera } from 'react-icons/fa';
import { MdSportsCricket, MdSportsScore } from 'react-icons/md';
import { GiCoinflip } from 'react-icons/gi';
import { PiCricketFill } from 'react-icons/pi';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui';
import { PageFooter } from '@/components/PageFooter';
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
import Gallery from './components/Gallery';
import MatchSchedule from './components/MatchSchedule';

type View = 'players' | 'expenses' | 'fees' | 'charts' | 'sponsors' | 'gallery' | 'matches' | 'toss' | 'share';

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
    { label: 'Players', value: String(animPlayers), color: 'var(--cricket)', icon: <MdSportsCricket size={18} /> },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 sm:p-4 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span style={{ color: s.color }}>{s.icon}</span>
            <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">{s.label}</Text>
          </div>
          <Text as="p" size="2xl" weight="bold" tabular className="sm:text-[26px] leading-none" style={{ color: s.color }}>
            {s.value}
          </Text>
        </div>
      ))}
    </div>
  );
}

/* ── 5-Tab Navigation with Segmented Sub-views ── */
type Tab = 'players' | 'finances' | 'matches' | 'moments' | 'more';

const TABS: { key: Tab; label: string }[] = [
  { key: 'players', label: 'Players' },
  { key: 'finances', label: 'Finances' },
  { key: 'matches', label: 'Matches' },
  { key: 'moments', label: 'Moments' },
  { key: 'more', label: '...' },
];

// Maps View → parent Tab
function viewToTab(view: View): Tab {
  if (view === 'players' || view === 'fees') return 'players';
  if (view === 'expenses' || view === 'charts' || view === 'sponsors') return 'finances';
  if (view === 'matches' || view === 'toss') return 'matches';
  if (view === 'gallery') return 'moments';
  return 'more';
}

// Default sub-view for each tab
function tabToView(tab: Tab): View {
  if (tab === 'players') return 'players';
  if (tab === 'finances') return 'expenses';
  if (tab === 'matches') return 'matches';
  if (tab === 'moments') return 'gallery';
  return 'share';
}


/* ── More Menu (bottom sheet) ── */
function MoreMenu({ open, onClose, onSelect }: {
  open: boolean; onClose: () => void; onSelect: (view: View) => void;
}) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} />
      <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 pb-8 animate-[slideUp_0.2s]" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
        <div className="flex justify-center mb-4">
          <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
        </div>
        <div className="space-y-1">
          <button onClick={() => { onSelect('share'); onClose(); }}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl cursor-pointer hover:bg-[var(--hover-bg)] transition-colors">
            <FaShareAlt size={16} className="text-[var(--cricket)]" />
            <div className="text-left">
              <Text as="p" size="md" weight="semibold">Share</Text>
              <Text as="p" size="2xs" color="dim">Export PDF & share dues</Text>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}

/* ── Tab config using shared CapsuleTabs ── */
import { CapsuleTabs, SegmentedControl } from '@/components/ui';
import type { CapsuleTab } from '@/components/ui';

const CAPSULE_TABS: CapsuleTab[] = [
  { key: 'players', label: 'Players', icon: <FaUsers size={16} /> },
  { key: 'finances', label: 'Finances', icon: <FaReceipt size={16} /> },
  { key: 'matches', label: 'Matches', icon: <PiCricketFill size={18} /> },
  { key: 'moments', label: 'Moments', icon: <FaCamera size={15} /> },
  { key: 'more', label: '...', icon: <FaShareAlt size={14} /> },
];

function CricketDashboard() {
  const { user } = useAuthStore();
  const { loadAll, loading, selectedSeasonId, setShowExpenseForm, players, expenses, fees, sponsorships } = useCricketStore();
  const { userAccess } = useAuthStore();
  const isAdmin = userAccess.includes('admin');
  const activePlayers = players.filter((p) => p.is_active && !p.is_guest);
  const [activeView, setActiveView] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as View;
      if (['players', 'expenses', 'fees', 'charts', 'sponsors', 'gallery', 'matches', 'toss', 'share'].includes(hash)) return hash;
    }
    return 'players';
  });
  const [showMore, setShowMore] = useState(false);
  const activeTab = viewToTab(activeView);

  const handleViewChange = (view: View) => {
    setActiveView(view);
    window.history.replaceState(null, '', `#${view}`);
  };

  // Listen for notification click → switch to gallery and scroll to post
  useEffect(() => {
    const handler = (e: Event) => {
      const postId = (e as CustomEvent).detail;
      handleViewChange('gallery');
      // Scroll to the post after view switches
      setTimeout(() => {
        const el = document.getElementById(`gallery-post-${postId}`);
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
    };
    window.addEventListener('gallery-scroll-to', handler);
    return () => window.removeEventListener('gallery-scroll-to', handler);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Keyboard shortcuts: 1-6 to switch views
  useEffect(() => {
    if (!selectedSeasonId) return;
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const viewKeys: Record<string, View> = { '1': 'players', '2': 'fees', '3': 'expenses', '4': 'charts', '5': 'gallery', '6': 'matches', '7': 'toss', '8': 'share' };
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
    // Override ALL favicon links to cricket logo
    const iconLinks = document.querySelectorAll("link[rel~='icon'], link[rel='shortcut icon']");
    const prevHrefs = Array.from(iconLinks).map((l) => (l as HTMLLinkElement).href);
    iconLinks.forEach((l) => { (l as HTMLLinkElement).href = '/cricket-logo.png'; });
    // If no icon links exist, create one
    if (iconLinks.length === 0) {
      const link = document.createElement('link');
      link.rel = 'icon';
      link.href = '/cricket-logo.png';
      document.head.appendChild(link);
    }
    return () => {
      iconLinks.forEach((l, i) => { (l as HTMLLinkElement).href = prevHrefs[i] || '/favicon.ico'; });
    };
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
      <div className="relative min-h-screen w-full px-3 py-5 sm:px-4 lg:px-8">
        {/* Greeting + season selector skeleton */}
        <div className="mb-5 flex items-start justify-between gap-3">
          <Skeleton className="h-8 w-48 rounded-lg" />
          <Skeleton className="h-10 w-40 rounded-full" />
        </div>

        {/* Tab bar skeleton */}
        <div className="flex gap-2 mb-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-20 rounded-xl" />
          ))}
        </div>

        {/* Stats grid skeleton */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 rounded-xl" />
          ))}
        </div>

        {/* Content card placeholders */}
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen w-full px-3 py-5 sm:px-4 lg:px-8 overflow-hidden">
      {/* Ambient background blobs — cricket warm tones */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden>
        <div className="absolute -top-[20%] -right-[10%] h-[500px] w-[500px] rounded-full opacity-[0.07] blur-[100px]"
          style={{ background: 'radial-gradient(circle, var(--cricket), transparent 70%)' }} />
        <div className="absolute top-[30%] -left-[15%] h-[400px] w-[400px] rounded-full opacity-[0.05] blur-[90px]"
          style={{ background: 'radial-gradient(circle, var(--cricket-accent), transparent 70%)' }} />
        <div className="absolute -bottom-[10%] right-[20%] h-[450px] w-[450px] rounded-full opacity-[0.06] blur-[100px]"
          style={{ background: 'radial-gradient(circle, var(--cricket-accent), transparent 70%)' }} />
      </div>

      {/* Header — greeting + pulse */}
      {(() => {
        const hour = new Date().getHours();
        // Find current user's player record by email (not user_id — admin owns unlinked records)
        const userEmail = user?.email?.toLowerCase();
        const myPlayer = players.find((p) => p.is_active && p.email?.toLowerCase() === userEmail);
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
              <Text as="h2" size="xl" weight="bold" tracking="tight" className="sm:text-[24px]">
                {timeGreeting}{firstName ? `, ${firstName}` : ''} <MdSportsCricket className="inline-block ml-1 text-[var(--cricket)]" size={22} />
              </Text>
            </div>
            <SeasonSelector />
          </div>
        );
      })()}

      {!selectedSeasonId ? (
        <div className="flex min-h-[40vh] items-center justify-center">
          <EmptyState
            icon="🏏"
            title="No seasons yet"
            description="Create your first season to get started"
          />
        </div>
      ) : (
        <>
          {/* Tab bar */}
          <div className="mb-4">
            <CapsuleTabs
              tabs={CAPSULE_TABS.map((t) => ({
                ...t,
                badge: t.key === 'players' ? activePlayers.length : t.key === 'finances' ? seasonExpensesList.length : undefined,
              }))}
              active={activeTab}
              onChange={(tab) => {
                if (tab === 'more') { setShowMore(true); return; }
                handleViewChange(tabToView(tab as Tab));
              }}
            />
          </div>

          {/* Segmented controls for tabs with sub-views */}
          {activeTab === 'players' && (
            <SegmentedControl
              options={[{ key: 'players', label: 'Roster' }, { key: 'fees', label: 'Season Fees' }]}
              active={activeView}
              onChange={(key) => handleViewChange(key as View)}
              className="mb-4"
            />
          )}
          {activeTab === 'finances' && (
            <SegmentedControl
              options={[{ key: 'expenses', label: 'Expenses' }, { key: 'charts', label: 'Charts' }, { key: 'sponsors', label: 'Sponsors' }]}
              active={activeView}
              onChange={(key) => handleViewChange(key as View)}
              className="mb-4"
            />
          )}
          {activeTab === 'matches' && (
            <SegmentedControl
              options={[{ key: 'matches', label: 'Schedule' }, { key: 'toss', label: 'Toss' }]}
              active={activeView}
              onChange={(key) => handleViewChange(key as View)}
              className="mb-4"
            />
          )}

          {/* More menu */}
          <MoreMenu open={showMore} onClose={() => setShowMore(false)} onSelect={handleViewChange} />

          {/* Action buttons */}
          {isAdmin && activeView === 'expenses' && (
            <div className="mb-4 flex items-center gap-2">
              <Button
                onClick={() => setShowExpenseForm(true)}
                disabled={activePlayers.length === 0}
                variant="primary"
                brand="cricket"
                size="md"
              >
                + Add Expense
              </Button>
              {activePlayers.length === 0 && (
                <Text as="p" size="sm" color="muted">Add players first</Text>
              )}
            </div>
          )}

          {/* Summary Stats — show only on players, fees, charts */}
          {activeView !== 'toss' && activeView !== 'share' && activeView !== 'expenses' && activeView !== 'gallery' && activeView !== 'matches' && (
            <SummaryStats
              totalSpent={totalSpent}
              poolBalance={poolBalance}
              playerCount={activePlayers.length}
              feesPaid={feesPaid}
              feesTotal={activePlayers.length}
            />
          )}

          {/* Content */}
          <div key={activeView} className="min-w-0 animate-fade-in">
            {activeView === 'players' && <PlayerManager />}
            {activeView === 'expenses' && <ExpenseList />}
            {activeView === 'charts' && (
              <div className="space-y-5">
                <CategoryDonut />
                <MonthlyBar />
              </div>
            )}
            {activeView === 'fees' && <FeeTracker />}
            {activeView === 'sponsors' && <SponsorshipSection />}
            {activeView === 'gallery' && <Gallery />}
            {activeView === 'matches' && <MatchSchedule />}
            {activeView === 'toss' && <TossWidget />}
            {activeView === 'share' && <ShareButton />}
          </div>
        </>
      )}

      {/* Modals */}
      <ExpenseForm />

      <PageFooter className="mt-16 mb-8" />
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
