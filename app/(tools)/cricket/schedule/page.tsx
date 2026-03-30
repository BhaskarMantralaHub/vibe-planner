'use client';

import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { Text } from '@/components/ui';
import { MdDateRange } from 'react-icons/md';
import MatchSchedule from '../components/MatchSchedule';

export default function SchedulePage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <div className="px-4 py-4 space-y-4">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
              <MdDateRange size={20} className="text-white" />
            </div>
            <div>
              <Text as="h1" size="lg" weight="bold">League Schedule</Text>
              <Text as="p" size="2xs" color="muted">Upcoming matches & fixtures</Text>
            </div>
          </div>

          <MatchSchedule />
        </div>
      </RoleGate>
    </AuthGate>
  );
}
