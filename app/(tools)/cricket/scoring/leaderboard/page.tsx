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
          <div className="relative rounded-2xl overflow-hidden px-5 py-5"
            style={{ background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))' }}>
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full opacity-10 -translate-y-1/3 translate-x-1/4"
              style={{ background: 'radial-gradient(circle, white, transparent 70%)' }} />
            <div className="absolute bottom-0 left-0 w-24 h-24 rounded-full opacity-10 translate-y-1/3 -translate-x-1/4"
              style={{ background: 'radial-gradient(circle, var(--cricket-accent), transparent 70%)' }} />
            <div className="relative flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 backdrop-blur-sm">
                <MdLeaderboard size={22} className="text-white" />
              </div>
              <div>
                <Text as="h1" size="lg" weight="bold" color="white">Practice Stats</Text>
                <Text as="p" size="2xs" color="white" className="opacity-70">Batting, bowling & fielding leaderboards</Text>
              </div>
            </div>
          </div>

          <PracticeLeaderboard />
        </div>
      </RoleGate>
    </AuthGate>
  );
}
