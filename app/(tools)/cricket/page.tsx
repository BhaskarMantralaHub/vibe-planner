'use client';

import { useEffect, useState, useRef } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Users, Receipt, Share2, Banknote, PiggyBank, PersonStanding } from 'lucide-react';
import { MdSportsCricket } from 'react-icons/md';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui';
import { PageFooter } from '@/components/PageFooter';
import InviteHandler from '@/components/InviteHandler';
import { formatCurrency } from './lib/utils';
import SeasonSelector from './components/SeasonSelector';
import PlayerManager from './components/PlayerManager';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import ShareButton from './components/ShareButton';
import CategoryDonut from './components/CategoryDonut';
import MonthlyBar from './components/MonthlyBar';
import FeeTracker from './components/FeeTracker';
import SponsorshipSection from './components/SponsorshipSection';
type View = 'players' | 'expenses' | 'fees' | 'charts' | 'sponsors';

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
    { label: 'Total Spent', value: formatCurrency(animSpent), color: 'var(--red)', icon: <Receipt size={16} /> },
    { label: 'Fees Paid', value: `${animPaid} of ${feesTotal}`, color: feeColor, icon: <Banknote size={16} /> },
    { label: 'Pool Balance', value: `${poolBalance < 0 ? '-' : ''}${formatCurrency(animPool)}`, color: poolBalance < 0 ? 'var(--red)' : 'var(--green)', icon: <PiggyBank size={16} /> },
    { label: 'Players', value: String(animPlayers), color: 'var(--cricket)', icon: <PersonStanding size={18} /> },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {stats.map((s) => (
        <div key={s.label} className="rounded-xl border border-[var(--border)]/60 bg-gradient-to-br from-[var(--card)] to-[var(--card-end)] p-3 sm:p-4 min-w-0 shadow-[inset_0_1px_0_0_var(--inner-glow)]">
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

/* ── 2-Tab Navigation with Segmented Sub-views ── */
type Tab = 'players' | 'finances';

// Maps View → parent Tab
function viewToTab(view: View): Tab {
  if (view === 'players' || view === 'fees') return 'players';
  return 'finances';
}

// Default sub-view for each tab
function tabToView(tab: Tab): View {
  if (tab === 'players') return 'players';
  return 'expenses';
}


/* ── Tab config using shared CapsuleTabs ── */
import { CapsuleTabs, SegmentedControl } from '@/components/ui';
import type { CapsuleTab } from '@/components/ui';

const CAPSULE_TABS: CapsuleTab[] = [
  { key: 'players', label: 'Players', icon: <Users size={16} /> },
  { key: 'finances', label: 'Finances', icon: <Receipt size={16} /> },
];

function CricketDashboard() {
  const { user, userAccess, userTeams, currentTeamId } = useAuthStore();
  const { loadAll, loading, selectedSeasonId, setShowExpenseForm, players, expenses, fees, sponsorships, adminUserIds } = useCricketStore();
  const isGlobalAdmin = userAccess.includes('admin');
  const isTeamAdmin = user ? adminUserIds.includes(user.id) : false;
  const isAdmin = isGlobalAdmin || isTeamAdmin;
  const activePlayers = players.filter((p) => p.is_active && !p.is_guest);
  const [activeView, setActiveView] = useState<View>(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '') as View;
      if (['players', 'expenses', 'fees', 'charts', 'sponsors'].includes(hash)) return hash;
    }
    return 'players';
  });
  const [showShare, setShowShare] = useState(false);
  const activeTab = viewToTab(activeView);

  const handleViewChange = (view: View) => {
    setActiveView(view);
    window.history.replaceState(null, '', `#${view}`);
  };

  // Keyboard shortcuts: 1-5 to switch views
  useEffect(() => {
    if (!selectedSeasonId) return;
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const viewKeys: Record<string, View> = { '1': 'players', '2': 'fees', '3': 'expenses', '4': 'charts', '5': 'sponsors' };
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
    document.title = userTeams.find(t => t.team_id === currentTeamId)?.team_name ?? 'Cricket';
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
          {/* Bottom tab bar — premium iOS-style with pill active state */}
          <div
            className="fixed left-0 right-0 z-40"
            style={{
              bottom: 0,
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              background: 'color-mix(in srgb, var(--card) 85%, transparent)',
              backdropFilter: 'blur(20px) saturate(180%)',
              WebkitBackdropFilter: 'blur(20px) saturate(180%)',
              borderTop: '1px solid color-mix(in srgb, var(--border) 60%, transparent)',
              boxShadow: '0 -1px 0 0 color-mix(in srgb, var(--border) 40%, transparent), 0 -8px 32px rgba(0,0,0,0.12)',
            }}
          >
            <div className="flex items-center justify-around px-2 pt-1.5 pb-2">
              {CAPSULE_TABS.map((t) => {
                const isActive = activeTab === t.key;
                return (
                  <button
                    key={t.key}
                    onClick={() => handleViewChange(tabToView(t.key as Tab))}
                    className="relative flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 active:scale-90 min-w-[80px] py-1.5 px-3"
                    style={{ WebkitTapHighlightColor: 'transparent' }}
                  >
                    {/* Pill background on active */}
                    {isActive && (
                      <span
                        className="absolute inset-0 rounded-2xl"
                        style={{
                          background: 'color-mix(in srgb, var(--cricket) 15%, transparent)',
                          border: '1px solid color-mix(in srgb, var(--cricket) 25%, transparent)',
                        }}
                      />
                    )}
                    {/* Icon with glow on active */}
                    <span
                      className="relative z-10 transition-all duration-200"
                      style={{
                        color: isActive ? 'var(--cricket)' : 'var(--muted)',
                        filter: isActive ? 'drop-shadow(0 0 6px color-mix(in srgb, var(--cricket) 60%, transparent))' : 'none',
                        transform: isActive ? 'scale(1.15) translateY(-1px)' : 'scale(1)',
                        display: 'flex',
                      }}
                    >
                      {t.icon}
                    </span>
                    {/* Label */}
                    <span
                      className="relative z-10 text-[10px] transition-all duration-200"
                      style={{
                        color: isActive ? 'var(--cricket)' : 'var(--muted)',
                        fontWeight: isActive ? 700 : 500,
                        letterSpacing: isActive ? '0.03em' : '0.02em',
                      }}
                    >
                      {t.label}
                    </span>
                  </button>
                );
              })}
              {/* Share tab — never active */}
              <button
                onClick={() => setShowShare(true)}
                className="relative flex flex-col items-center gap-1 cursor-pointer transition-all duration-200 active:scale-90 min-w-[80px] py-1.5 px-3"
                style={{ WebkitTapHighlightColor: 'transparent' }}
              >
                <span className="transition-all duration-200" style={{ color: 'var(--muted)', display: 'flex' }}>
                  <Share2 size={16} />
                </span>
                <span className="text-[10px] font-medium" style={{ color: 'var(--muted)', letterSpacing: '0.02em' }}>
                  Share
                </span>
              </button>
            </div>
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
          {/* Share bottom sheet */}
          {showShare && (
            <>
              <div className="fixed inset-0 z-40 bg-black/40" onClick={() => setShowShare(false)} />
              <div className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 pb-8 animate-[slideUp_0.2s]" style={{ background: 'var(--card)', border: '1px solid var(--border)' }}>
                <div className="flex justify-center mb-4">
                  <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
                </div>
                <ShareButton />
              </div>
            </>
          )}

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
          {activeView !== 'expenses' && (
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
          </div>
        </>
      )}

      {/* Modals */}
      <ExpenseForm />

      {/* Spacer for fixed bottom tab bar */}
      <div className="h-24" />
      <PageFooter className="mb-24" />
    </div>
  );
}

export default function CricketPage() {
  return (
    <AuthGate variant="cricket">
      <InviteHandler />
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <CricketDashboard />
      </RoleGate>
    </AuthGate>
  );
}
