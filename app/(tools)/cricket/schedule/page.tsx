'use client';

import { useEffect, useState } from 'react';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { useAuthStore } from '@/stores/auth-store';
import { useCricketStore } from '@/stores/cricket-store';
import { isCloudMode } from '@/lib/supabase/client';
import { Text } from '@/components/ui';
import { CalendarRange } from 'lucide-react';
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
    <div className="relative min-h-screen w-full px-3 py-5 sm:px-4 lg:px-8 overflow-hidden">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
            <CalendarRange size={20} className="text-white" />
          </div>
          <div>
            <Text as="h1" size="lg" weight="bold">League Schedule</Text>
            <Text as="p" size="2xs" color="muted">Upcoming matches & fixtures</Text>
          </div>
        </div>
        <SeasonSelector />
      </div>

      {!ready ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-[var(--dim)] border-t-transparent" />
        </div>
      ) : (
        <MatchSchedule />
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
