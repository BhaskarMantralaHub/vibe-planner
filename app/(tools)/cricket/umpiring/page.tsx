'use client';

import { useEffect, useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Text } from '@/components/ui';
import { createPortal } from 'react-dom';
import UmpiringBoard from '../components/UmpiringBoard';
import SeasonSelector from '../components/SeasonSelector';
import CricketSectionNav from '../components/CricketSectionNav';
import { CRICKET_GLOBAL_NAV } from '../components/cricket-global-nav';

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
    <div className="relative min-h-screen w-full px-3 pt-5 pb-cricket-nav sm:px-4 lg:px-8 overflow-hidden">
      {/* Editorial header — strong title + quiet description; no icon chip,
          no container. The type is the design. */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Text as="h1" size="2xl" weight="bold" tracking="tight">Umpiring</Text>
          <Text as="p" size="xs" color="muted" className="mt-0.5">
            Sign up for duties & track who&apos;s stood
          </Text>
        </div>
        <div className="flex-shrink-0">
          <SeasonSelector />
        </div>
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
          <CricketSectionNav items={CRICKET_GLOBAL_NAV} activeKey="umpiring" />,
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
