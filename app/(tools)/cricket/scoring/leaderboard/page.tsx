'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { Text } from '@/components/ui';
import { MdArrowBack } from 'react-icons/md';
import PracticeLeaderboard from '../components/PracticeLeaderboard';

export default function LeaderboardPage() {
  const router = useRouter();

  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']}>
        <div className="fixed inset-0 z-50 overflow-hidden" style={{ background: 'var(--bg)' }}>
          <div className="absolute inset-0 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: 'touch' }}>
            <div className="flex min-h-[100dvh] flex-col bg-[var(--bg)]">
              {/* Header */}
              <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--surface)]/80 px-4 py-3 backdrop-blur-md">
                <button
                  onClick={() => router.back()}
                  className="cursor-pointer rounded-lg p-1.5 text-[var(--muted)] hover:bg-[var(--hover-bg)] hover:text-[var(--text)] transition-colors"
                >
                  <MdArrowBack size={22} />
                </button>
                <Text size="md" weight="semibold">Practice Stats</Text>
              </div>

              {/* Content */}
              <div className="flex-1 px-4 py-4 space-y-4">
                <PracticeLeaderboard />
              </div>

              <div className="pb-[max(env(safe-area-inset-bottom),20px)]" />
            </div>
          </div>
        </div>
      </RoleGate>
    </AuthGate>
  );
}
