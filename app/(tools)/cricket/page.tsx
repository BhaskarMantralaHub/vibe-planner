'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { seasonRoster, billableRoster } from './lib/season-roster';
import { useRouter, useSearchParams } from 'next/navigation';
import { Users, Receipt, Banknote, PiggyBank, CalendarDays, Camera, ArrowDownToLine, Lock, LockOpen } from 'lucide-react';
import { toast } from 'sonner';
import { MdSportsCricket } from 'react-icons/md';
import UmpireIcon from '@/components/icons/UmpireIcon';
import CricketPlayerIcon from '@/components/icons/CricketPlayerIcon';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/ui/empty-state';
import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useReducedMotion } from '@/hooks/use-reduced-motion';
import { PageFooter } from '@/components/PageFooter';
import InviteHandler from '@/components/InviteHandler';
import { formatCurrency, computeSeasonPool, type CarriedForward } from './lib/utils';
import SeasonSelector from './components/SeasonSelector';
import PlayerManager from './components/PlayerManager';
import ExpenseForm from './components/ExpenseForm';
import ExpenseList from './components/ExpenseList';
import ShareFab from './components/ShareFab';
import FeeTracker from './components/FeeTracker';
import SponsorshipSection from './components/SponsorshipSection';
import SplitsDashboard from './components/SplitsDashboard';
// 'charts' was removed (unused in practice). A stale '#charts' hash or a
// sessionStorage entry from before the change simply fails the VALID_VIEWS
// check and falls back to 'players', so old bookmarks degrade quietly.
type View = 'players' | 'expenses' | 'fees' | 'sponsors' | 'splits';

/* ── Animated counter hook ── */
function useAnimatedValue(target: number, duration = 600) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  const reducedMotion = useReducedMotion();
  useEffect(() => {
    // Counting up from 0 is decorative. Somebody who has asked the OS to reduce
    // motion gets the figure immediately — and so does the ref, or the next
    // change would animate from a stale start.
    if (reducedMotion) {
      prev.current = target;
      setValue(target);
      return;
    }
    const start = prev.current;
    const diff = target - start;
    if (diff === 0) return;
    const startTime = performance.now();
    let raf: number;
    // Tracks what is actually ON SCREEN, so an animation interrupted mid-flight
    // resumes from there. `prev.current` used to be written only on completion,
    // which meant a target change partway through restarted from the last
    // COMPLETED figure — and the number visibly jumped backwards before running
    // forwards again. Harmless when the tiles were inert; much easier to trigger
    // now they re-render on every view change.
    let onScreen = start;
    const tick = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      onScreen = Math.round(start + diff * eased);
      setValue(onScreen);
      if (progress < 1) raf = requestAnimationFrame(tick);
      else prev.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      prev.current = onScreen;
    };
  }, [target, duration, reducedMotion]);
  return value;
}

/* ── Summary Stats Bar ──
 *
 * Each tile is a button that jumps to the view its number comes from, so a
 * figure you are looking at is one tap from the detail behind it.
 *
 * TWO DESIGN CALLS WORTH KNOWING BEFORE EDITING THIS:
 *
 * 1. ALL FOUR ARE ALWAYS BUTTONS — never a button on one view and a plain div
 *    on another. The tiles render on the Players, Fees and Sponsors views, and
 *    only two of the four have a destination among those, so a
 *    "disable-the-current-one" rule would make the number of live tiles change
 *    from 3 to 3 to 4 as you move around. That is exactly the shifting-target
 *    problem that got the bottom nav rebuilt. A control that is sometimes a
 *    control is worse than one that always is.
 *
 * 2. TAPPING THE TILE YOU ARE ALREADY ON SCROLLS TO TOP rather than doing
 *    nothing. That is the same thing CricketSectionNav does when you tap the
 *    active tab (`onActiveTap`), so the gesture already means something here,
 *    and no tap is ever dead. The tile is marked `aria-current="page"` and
 *    tinted so it is clear which one you are on.
 */
interface StatTile {
  label: string;
  /** Animated, for display only. */
  value: string;
  /**
   * Settled value as it should be SPOKEN — see the aria-label note below.
   * Not always the same string as `value`: a leading minus sign is read as
   * "hyphen" by some screen readers and silently dropped by others, so a
   * negative pool balance says "short" in words instead.
   */
  exactValue: string;
  /** Icon tint + current-tile tint. The VALUE stays neutral ink — see below. */
  color: string;
  /** Semantic exception only (e.g. a negative pool balance reads red).
   *  Every value in its own bright color made the row four competing
   *  dashboard widgets; neutral figures read as one team overview. */
  valueColor?: string;
  icon: React.ReactNode;
  /** View this tile drills into. */
  target: View;
  /** Plain-language destination, e.g. "expenses". Used in the accessible name. */
  destination: string;
}

// Exported for tests/unit/summary-stats.test.tsx. Nothing else imports it —
// these tiles only make sense on this page, so it stays here rather than moving
// to components/ for the sake of the test.
export function SummaryStats({
  totalSpent, poolBalance, playerCount, feesPaid, feesTotal, activeView, onNavigate,
}: {
  totalSpent: number; poolBalance: number; playerCount: number;
  feesPaid: number; feesTotal: number;
  activeView: View;
  onNavigate: (view: View) => void;
}) {
  const animSpent = useAnimatedValue(Math.round(totalSpent));
  const animPool = useAnimatedValue(Math.round(poolBalance));
  const animPlayers = useAnimatedValue(playerCount);
  const animPaid = useAnimatedValue(feesPaid);

  const feeColor = feesTotal > 0 && feesPaid === feesTotal ? 'var(--green)' : 'var(--blue)';
  const poolSign = poolBalance < 0 ? '-' : '';

  const stats: StatTile[] = [
    {
      label: 'Total Spent',
      value: formatCurrency(animSpent),
      exactValue: formatCurrency(totalSpent),
      color: 'var(--red)',
      icon: <Receipt size={16} />,
      target: 'expenses',
      destination: 'expenses',
    },
    {
      label: 'Fees Paid',
      value: `${animPaid} of ${feesTotal}`,
      exactValue: `${feesPaid} of ${feesTotal}`,
      color: feeColor,
      icon: <Banknote size={16} />,
      target: 'fees',
      destination: 'season fees',
    },
    {
      // Pool balance is fees + sponsorships − expenses, and the Expenses view is
      // where that sum is shown adding up, carried-forward entry included. Same
      // destination as Total Spent on purpose: it is the same ledger.
      label: 'Pool Balance',
      // formatCurrency() already applies Math.abs, which is why the sign is
      // prefixed by hand here rather than left to the formatter.
      value: `${poolSign}${formatCurrency(animPool)}`,
      exactValue: poolBalance < 0
        ? `${formatCurrency(poolBalance)} short`
        : formatCurrency(poolBalance),
      color: poolBalance < 0 ? 'var(--red)' : 'var(--green)',
      valueColor: poolBalance < 0 ? 'var(--red)' : undefined,
      icon: <PiggyBank size={16} />,
      target: 'expenses',
      destination: 'expenses',
    },
    {
      label: 'Players',
      value: String(animPlayers),
      exactValue: String(playerCount),
      color: 'var(--cricket)',
      icon: <CricketPlayerIcon size={18} />,
      target: 'players',
      destination: 'the roster',
    },
  ];

  return (
    <div className="mb-5 grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
      {stats.map((s) => {
        const isCurrent = s.target === activeView;
        return (
          <button
            key={s.label}
            type="button"
            // aria-current="true", not "page": this switches an in-page view,
            // it does not navigate to a page. SeasonSelector.tsx uses "true" for
            // the same kind of in-page selection; CricketSectionNav uses "page"
            // because its items are real routes. Not role="tab" either — these
            // tiles don't own the panel below them.
            aria-current={isCurrent ? 'true' : undefined}
            // The accessible name uses exactValue, NOT the animated one. The
            // counter re-renders ~60 times over 600ms, and an aria-label bound
            // to it would make a screen reader announce a number that is still
            // counting — or announce nothing coherent at all.
            aria-label={isCurrent
              ? `${s.label}, ${s.exactValue}. Currently showing.`
              : `${s.label}, ${s.exactValue}. Go to ${s.destination}.`}
            onClick={() => {
              if (isCurrent) {
                // Same gesture as tapping the active bottom-nav tab.
                window.scrollTo({ top: 0, behavior: 'smooth' });
                return;
              }
              onNavigate(s.target);
            }}
            className={cn(
              // Tone + soft elevation, no outline — matches the border-free
              // surface system introduced with the pool hero.
              'rounded-xl p-3 sm:p-4 min-w-0 text-left cursor-pointer',
              'bg-[var(--card)] shadow-[var(--card-shadow)]',
              'transition-all duration-150 ease-out',
              // 0.98, not the 0.95 used on pills: at 171x70 a 5% shrink is 8.5px
              // of travel and reads as a lurch. Same value as the tappable stat
              // cards in TopPerformersCarousel.
              'active:scale-[0.98]',
              // Copied from SplitsDashboard's SummaryCard — the closest twin in
              // the repo (a tappable summary card that jumps to another view).
              // NO ring-offset: button.tsx has it, but nothing overrides
              // Tailwind v4's default white --tw-ring-offset-color, so it draws
              // a white halo in dark mode. SplitsDashboard omits it too.
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60',
            )}
            style={
              // The current tile is tinted in its own colour rather than given a
              // left rail or a chevron — both were rejected as clutter on a tile
              // this small, and a rail on a rounded card is a tired pattern.
              isCurrent
                ? {
                  boxShadow: `var(--card-shadow), inset 0 0 0 1.5px color-mix(in srgb, ${s.color} 45%, transparent)`,
                  background: `color-mix(in srgb, ${s.color} 7%, var(--card))`,
                }
                : undefined
            }
          >
            <div className="flex items-center gap-2 mb-1.5">
              <span style={{ color: s.color }}>{s.icon}</span>
              <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">{s.label}</Text>
            </div>
            {/* aria-hidden: the settled figure is already in the button's
                aria-label, so exposing the counting one would read it twice. */}
            <Text
              as="p"
              size="2xl"
              weight="bold"
              tabular
              aria-hidden
              className="sm:text-[26px] leading-none"
              style={s.valueColor ? { color: s.valueColor } : undefined}
            >
              {s.value}
            </Text>
          </button>
        );
      })}
    </div>
  );
}

/* ── 2-Tab Navigation with Segmented Sub-views ── */
type Tab = 'players' | 'finances';

// Maps View → parent Tab
/**
 * The pool money a season starts with, shown as a line item.
 *
 * Deliberately looks like an entry rather than a summary tile: it is money that
 * arrived, sitting in the list where the other money is, so the season balance
 * visibly adds up instead of appearing from nowhere.
 *
 * The "Updates live" note is load-bearing. While the previous season is still
 * being played this figure tracks it, so it WILL change if more of that
 * season's money is spent — and a number that moves without explanation is
 * exactly what makes people distrust a ledger. Once an admin freezes the
 * season, the note disappears because the figure has stopped moving.
 */
function CarriedForwardEntry({ carried, isAdmin, onFreeze, onUnfreeze }: {
  carried: CarriedForward;
  isAdmin: boolean;
  onFreeze: (amount: number) => void;
  onUnfreeze: () => void;
}) {
  const isDeficit = carried.amount < 0;
  const tone = isDeficit ? 'var(--red)' : 'var(--green)';

  return (
    // Compact contextual info row — tonal surface, no border, no card chrome.
    // The green lives in the icon and the amount, never the whole row.
    <div
      className="flex items-center gap-3 rounded-xl px-3 py-2.5"
      style={{ background: 'var(--surface)' }}
    >
      <span
        className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full"
        style={{ background: `color-mix(in srgb, ${tone} 14%, transparent)`, color: tone }}
        aria-hidden
      >
        <ArrowDownToLine size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <Text as="p" size="sm" weight="semibold" truncate>
          {isDeficit ? 'Deficit carried forward' : 'Carried forward'}
        </Text>
        <Text as="p" size="2xs" color="muted" truncate>
          {carried.fromSeasonName ? `From ${carried.fromSeasonName}` : 'From the previous season'}
          {carried.live && ' · updates live'}
        </Text>
      </div>

      <span
        className="flex-shrink-0 text-[15px] font-bold tabular-nums"
        style={{ color: tone }}
      >
        {isDeficit ? '−' : '+'}{formatCurrency(Math.abs(carried.amount))}
      </span>

      {/* Freezing is what stops the live chain. Leave it live forever and one
          correction to an old expense would silently rewrite every later
          season's balance; freeze it when a season closes and history stops
          moving. Sits on the entry because that is where the number is. */}
      {isAdmin && (
        <button
          type="button"
          onClick={() => (carried.live ? onFreeze(carried.amount) : onUnfreeze())}
          aria-label={carried.live
            ? `Lock this at ${formatCurrency(carried.amount)}`
            : 'Unlock and track the previous season again'}
          title={carried.live
            ? 'Lock this figure — do it once the previous season is finished'
            : 'Unlock to track the previous season again'}
          className="pressable flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-lg text-[var(--muted)] active:bg-[var(--hover-bg)]"
        >
          {carried.live ? <LockOpen size={15} /> : <Lock size={15} />}
        </button>
      )}
    </div>
  );
}

function viewToTab(view: View): Tab {
  // Season fees live under Finances, not Players: they are money in, the other
  // half of the pool alongside expenses. Players is now a single view (Roster).
  if (view === 'players') return 'players';
  return 'finances';
}

// Default sub-view for each tab
function tabToView(tab: Tab): View {
  if (tab === 'players') return 'players';
  return 'expenses';
}


import { SegmentedControl } from '@/components/ui';
import CricketSectionNav, {
  type CricketSectionNavItem,
} from './components/CricketSectionNav';

function CricketDashboard() {
  const { user, userAccess, userTeams, currentTeamId } = useAuthStore();
  const { loadAll, loading, selectedSeasonId, seasons, players, seasonPlayers, expenses, fees, sponsorships, adminUserIds, updateSeason } = useCricketStore();
  const isGlobalAdmin = userAccess.includes('admin');
  const isTeamAdmin = user ? adminUserIds.includes(user.id) : false;
  const isAdmin = isGlobalAdmin || isTeamAdmin;
  // This season's roster, not the whole team — so the Players stat card counts
  // who is actually playing the selected season. Falls back to the team-wide
  // list for a season with no roster rows. See ./lib/season-roster.
  const activePlayers = billableRoster(seasonRoster(players, seasonPlayers, selectedSeasonId));
  const VALID_VIEWS: View[] = ['players', 'expenses', 'fees', 'sponsors', 'splits'];
  const SS_KEY = 'cricket:activeView';
  const [activeView, setActiveView] = useState<View>(() => {
    if (typeof window === 'undefined') return 'players';
    const hash = window.location.hash.replace('#', '') as View;
    if (VALID_VIEWS.includes(hash)) return hash;
    // ?view= deep-link (hamburger "Finances") — read directly here too so a
    // hard load of /cricket?view=expenses opens on the right tab without a
    // players-first flash. Client navigations are handled by the
    // searchParams effect below instead.
    const param = new URLSearchParams(window.location.search).get('view') as View | null;
    if (param && VALID_VIEWS.includes(param)) return param;
    // Round-trip memory: if user came back via Matches → Home or Moments → Home,
    // restore the view they were on before leaving. Survives one session.
    const stored = sessionStorage.getItem(SS_KEY) as View | null;
    if (stored && VALID_VIEWS.includes(stored)) return stored;
    return 'players';
  });
  const router = useRouter();
  const activeTab = viewToTab(activeView);

  // ?view= deep-link, client-navigation path. Hash links break here: the App
  // Router updates the URL via pushState (no hashchange event) and commits it
  // AFTER this component renders, so a hash read on mount sees the old URL.
  // useSearchParams IS wired into the router, so it delivers the new value on
  // both cross-route and same-route navigations. Once applied, the param is
  // consumed into the canonical #hash form so manual tab switches (which
  // write the hash) aren't shadowed by a stale ?view= in the URL.
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  useEffect(() => {
    if (!viewParam || !VALID_VIEWS.includes(viewParam as View)) return;
    setActiveView(viewParam as View);
    sessionStorage.setItem(SS_KEY, viewParam);
    window.history.replaceState(null, '', `${window.location.pathname}#${viewParam}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParam]);

  const handleViewChange = (view: View) => {
    setActiveView(view);
    if (typeof window !== 'undefined') {
      window.history.replaceState(null, '', `#${view}`);
      sessionStorage.setItem(SS_KEY, view);
    }
  };

  // Cross-route hash sync — if the URL hash changes outside our handler
  // (e.g. browser back/forward, deep-link from another page), reflect it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const hash = window.location.hash.replace('#', '') as View;
      if (VALID_VIEWS.includes(hash)) setActiveView(hash);
    };
    window.addEventListener('hashchange', sync);
    window.addEventListener('popstate', sync);
    return () => {
      window.removeEventListener('hashchange', sync);
      window.removeEventListener('popstate', sync);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keyboard shortcuts: 1-5 to switch views
  useEffect(() => {
    if (!selectedSeasonId) return;
    const handler = (e: KeyboardEvent) => {
      // Skip if user is typing in an input
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      // Numbered in the order the views appear on screen: Roster, then the
      // four Finances sub-views left to right.
      const viewKeys: Record<string, View> = { '1': 'players', '2': 'expenses', '3': 'fees', '4': 'splits', '5': 'sponsors' };
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
  const seasonFees = fees.filter((f) => f.season_id === selectedSeasonId);
  const feesPaid = seasonFees.filter((f) => Number(f.amount_paid) >= feeAmount).length;

  /**
   * Pool position for this season, INCLUDING whatever carried over.
   *
   * One shared function rather than arithmetic inlined here — there used to be
   * four copies of this sum across the app and they had already drifted (the
   * WhatsApp text share silently dropped sponsorships). See computeSeasonPool
   * in ./lib/utils.
   *
   * The carried figure tracks the previous season LIVE until an admin freezes
   * it, because Spring is still being played: a snapshot would go stale the
   * moment more of Spring's money is spent.
   */
  const pool = computeSeasonPool(
    selectedSeasonId ?? '',
    seasons,
    {
      fees,
      sponsors: sponsorships.filter((s) => !s.deleted_at),
      expenses: expenses.filter((e) => !e.deleted_at),
    },
  );
  const totalSpent = pool.totalSpent;
  const totalCollected = pool.totalIn;
  const poolBalance = pool.balance;

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
    <div className="relative min-h-screen w-full px-3 pt-5 pb-cricket-nav sm:px-4 lg:px-8 overflow-hidden">
      {/* Ambient depth — two near-imperceptible washes, not blobs: a faint
          brand warmth bleeding down from the header, and a neutral tonal
          shift toward the bottom so the floating nav has ground to sit on.
          Static gradients, no blur filters — free to composite. */}
      <div className="pointer-events-none fixed inset-0 -z-10" aria-hidden>
        <div
          className="absolute inset-x-0 top-0 h-[45vh]"
          style={{ background: 'radial-gradient(120% 100% at 50% 0%, color-mix(in srgb, var(--cricket) 5%, transparent), transparent 70%)' }}
        />
        <div
          className="absolute inset-x-0 bottom-0 h-[30vh]"
          style={{ background: 'linear-gradient(to top, color-mix(in srgb, var(--text) 3%, transparent), transparent)' }}
        />
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
          // One line on phones: greeting truncates, the season pill never
          // wraps below it — wrapping cost a full row of the viewport and
          // pushed the pool balance further down.
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Text as="h2" size="xl" weight="bold" tracking="tight" truncate className="sm:text-[24px]">
                {timeGreeting}{firstName ? `, ${firstName}` : ''} <MdSportsCricket className="inline-block ml-1 text-[var(--cricket)]" size={22} />
              </Text>
            </div>
            <div className="flex-shrink-0">
              <SeasonSelector />
            </div>
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
          {/* Bottom tab bar — Players (view) · Finances (view) · Matches (route) · Moments (route) */}
          {(() => {
            const navItems: CricketSectionNavItem[] = [
              { kind: 'view', key: 'players', label: 'Players', icon: CricketPlayerIcon },
              { kind: 'view', key: 'finances', label: 'Finances', icon: Receipt },
              { kind: 'route', key: 'matches', label: 'Matches', icon: CalendarDays, href: '/cricket/schedule' },
              { kind: 'route', key: 'umpiring', label: 'Umpiring', icon: UmpireIcon, href: '/cricket/umpiring' },
              { kind: 'route', key: 'moments', label: 'Moments', icon: Camera, href: '/cricket/moments' },
            ];
            return (
              <CricketSectionNav
                items={navItems}
                activeKey={activeTab}
                onViewChange={(key) => {
                  if (key === 'players') handleViewChange(tabToView('players'));
                  else if (key === 'finances') handleViewChange(tabToView('finances'));
                }}
              />
            );
          })()}

          {/* Share — extracted from the pill into a standalone FAB */}
          <ShareFab />

          {/* Segmented control for Finances, which is the only tab with
              sub-views now. Players is a single view (Roster) — a one-option
              segmented control is just a label that looks tappable.

              Labelled "Fees", not "Season Fees": SegmentedControl lays its
              buttons out flex-1 with overflow-hidden and no horizontal
              padding, so with four options a 320px phone gives each ~69px and
              "Season Fees" (~78px at 13px semibold) would clip mid-word. The
              season is already named in the pill above, so the word is
              redundant here anyway. */}
          {activeTab === 'finances' && (
            <SegmentedControl
              options={[{ key: 'expenses', label: 'Expenses' }, { key: 'fees', label: 'Fees' }, { key: 'splits', label: 'Splits' }, { key: 'sponsors', label: 'Sponsors' }]}
              active={activeView}
              onChange={(key) => handleViewChange(key as View)}
              className="mb-4"
            />
          )}
          {/* Summary Stats — players and fees only. Deliberately NOT on
              sponsors: none of its tiles is "current" there, and the four
              generic KPIs competed with the Total Sponsorships hero, which is
              that view's primary financial content. The same numbers remain
              one tab away. */}
          {(activeView === 'players' || activeView === 'fees') && (
            <SummaryStats
              totalSpent={totalSpent}
              poolBalance={poolBalance}
              playerCount={activePlayers.length}
              feesPaid={feesPaid}
              feesTotal={activePlayers.length}
              activeView={activeView}
              onNavigate={handleViewChange}
            />
          )}

          {/* Content — remounts per view; view-in is the brief's subtle
              opacity + 6px rise, replacing the plain fade */}
          <div key={activeView} className="min-w-0 animate-view-in">
            {activeView === 'players' && <PlayerManager />}
            {activeView === 'expenses' && (
              /* Carried-forward money as a visible ENTRY, not a hidden column.
                 It renders directly UNDER the pool hero (via carriedSlot) so
                 the balance is the first thing on screen and the entry that
                 explains it sits right beneath — the numbers still add up on
                 screen. Hidden at exactly zero — a "$0.00 carried forward" row
                 is noise, and the first season legitimately has none. */
              <ExpenseList
                onNavigate={handleViewChange}
                carriedSlot={Math.abs(pool.carried.amount) >= 0.01 ? (
                  <CarriedForwardEntry
                    carried={pool.carried}
                    isAdmin={isAdmin}
                    onFreeze={(amount) => {
                      if (!selectedSeasonId) return;
                      updateSeason(selectedSeasonId, { opening_balance: amount });
                      toast.success(`Locked at ${formatCurrency(amount)}`);
                    }}
                    onUnfreeze={() => {
                      if (!selectedSeasonId) return;
                      updateSeason(selectedSeasonId, { opening_balance: null });
                      toast.success('Now tracking the previous season again');
                    }}
                  />
                ) : undefined}
              />
            )}
            {activeView === 'splits' && <SplitsDashboard />}
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
        {/* Suspense is required by the static export: CricketDashboard calls
            useSearchParams, which bails out of prerendering without it. */}
        <Suspense fallback={null}>
          <CricketDashboard />
        </Suspense>
      </RoleGate>
    </AuthGate>
  );
}
