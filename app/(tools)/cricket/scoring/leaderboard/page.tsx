'use client';

import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { Text } from '@/components/ui';
import { MdLeaderboard } from 'react-icons/md';
import PracticeLeaderboard from '../components/PracticeLeaderboard';

export default function LeaderboardPage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']}>
        <div className="px-4 py-4 space-y-4">
          {/* Page header */}
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl"
              style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
              <MdLeaderboard size={20} className="text-white" />
            </div>
            <div>
              <Text as="h1" size="lg" weight="bold">Practice Stats</Text>
              <Text as="p" size="2xs" color="muted">Batting, bowling & fielding leaderboards</Text>
            </div>
          </div>

          <PracticeLeaderboard />
        </div>
      </RoleGate>
    </AuthGate>
  );
}
