'use client';

import { Suspense, useEffect, useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Text } from '@/components/ui';
import MatchSchedule from '../components/MatchSchedule';
import SeasonSelector from '../components/SeasonSelector';

function ScheduleContent() {
  const { user } = useAuthStore();
  const { loadSeasons, selectedSeasonId } = useCricketStore();
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (isCloudMode() && user) {
      loadSeasons().then(() => setReady(true));
    } else {
      setReady(true);
    }
  }, [user, loadSeasons]);

  return (
    <div className="relative min-h-screen w-full px-3 pt-5 pb-cricket-nav sm:px-4 lg:px-8 overflow-hidden">
      {/* Same editorial header as Umpiring: the title is the dock's label, no
          icon chip. */}
      <div className="mb-4 flex items-end justify-between gap-3">
        <div className="min-w-0">
          <Text as="h1" size="2xl" weight="bold" tracking="tight">Matches</Text>
          <Text as="p" size="xs" color="muted" className="mt-0.5">Fixtures, results &amp; stats</Text>
        </div>
        <div className="flex-shrink-0">
          <SeasonSelector />
        </div>
      </div>

      {!ready ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--dim)] border-t-transparent" />
        </div>
      ) : (
        <Suspense fallback={null}><MatchSchedule /></Suspense>
      )}
    </div>
  );
}

export default function SchedulePage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <ScheduleContent />
      </RoleGate>
    </AuthGate>
  );
}
