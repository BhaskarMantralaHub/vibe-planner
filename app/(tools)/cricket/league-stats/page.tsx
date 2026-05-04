'use client';

import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { Text } from '@/components/ui';
import { Trophy } from 'lucide-react';
import LeagueStatsView from './components/LeagueStatsView';

export default function LeagueStatsPage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <div className="px-4 py-4 space-y-4">
          {/* Branded hero header — matches the existing cricket leaderboard style */}
          <div
            className="relative overflow-hidden rounded-2xl px-5 py-5"
            style={{
              background:
                'linear-gradient(135deg, color-mix(in srgb, var(--cricket) 18%, var(--card)), color-mix(in srgb, var(--cricket-accent) 12%, var(--card)))',
              border: '1px solid color-mix(in srgb, var(--cricket) 25%, var(--border))',
              boxShadow: '0 8px 32px var(--cricket-glow)',
            }}
          >
            <Trophy
              size={80}
              className="absolute -right-2 -top-1 opacity-[0.07]"
              style={{ color: 'var(--cricket)' }}
            />
            <Text as="p" size="2xs" color="cricket" weight="semibold" uppercase tracking="wider" className="mb-0.5">
              League Performance
            </Text>
            <Text as="h1" size="xl" weight="bold">
              Season Stats
            </Text>
            <Text as="p" size="xs" color="muted" className="mt-0.5">
              Batting · Bowling · All-Rounders · Catches
            </Text>
          </div>

          <LeagueStatsView />
        </div>
      </RoleGate>
    </AuthGate>
  );
}
