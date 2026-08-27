'use client';

import { useEffect, useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Text } from '@/components/ui';
import { CalendarDays, BarChart3, Camera, LayoutGrid } from 'lucide-react';
import { createPortal } from 'react-dom';
import UmpireIcon from '@/components/icons/UmpireIcon';
import UmpiringBoard from '../components/UmpiringBoard';
import SeasonSelector from '../components/SeasonSelector';
import CricketSectionNav, { type CricketSectionNavItem } from '../components/CricketSectionNav';

const NAV_ITEMS: CricketSectionNavItem[] = [
  { kind: 'route', key: 'schedule', label: 'Matches', icon: CalendarDays, href: '/cricket/schedule' },
  { kind: 'route', key: 'umpiring', label: 'Umpiring', icon: UmpireIcon, href: '/cricket/umpiring' },
  { kind: 'route', key: 'stats', label: 'Stats', icon: BarChart3, href: '/cricket/league-stats' },
  { kind: 'route', key: 'moments', label: 'Moments', icon: Camera, href: '/cricket/moments' },
  { kind: 'route', key: 'home', label: 'Home', icon: LayoutGrid, href: '/cricket' },
];

function UmpiringContent() {
  const { user } = useAuthStore();
  const { loadAll, loadSeasons, selectedSeasonId } = useCricketStore();
  const [ready, setReady] = useState(false);

  // The roster metric needs cricket_players, which lives in cricket-store, so
  // load both seasons and the full cricket payload before rendering.
  useEffect(() => {
    if (isCloudMode() && user) {
      Promise.all([loadSeasons(), loadAll(user.id)]).then(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [user, loadSeasons, loadAll]);

  return (
    <div className="relative min-h-screen w-full px-3 pt-5 pb-32 sm:px-4 lg:px-8 overflow-hidden">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
          >
            <UmpireIcon size={20} color="#ffffff" />
          </div>
          <div>
            <Text as="h1" size="lg" weight="bold">Umpiring</Text>
            <Text as="p" size="2xs" color="muted">Sign up for duties & track who&apos;s stood</Text>
          </div>
        </div>
        <SeasonSelector />
      </div>

      {!ready || !selectedSeasonId ? (
        <div className="flex justify-center py-20">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--dim)] border-t-transparent" />
        </div>
      ) : (
        <UmpiringBoard />
      )}

      {/* Portalled to body: the nav is position:fixed, and a transformed
          ancestor would otherwise become its containing block on iOS Safari.
          Same approach as MatchSchedule. */}
      {typeof document !== 'undefined' &&
        createPortal(
          <CricketSectionNav items={NAV_ITEMS} activeKey="umpiring" />,
          document.body,
        )}
    </div>
  );
}

export default function UmpiringPage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <UmpiringContent />
      </RoleGate>
    </AuthGate>
  );
}
