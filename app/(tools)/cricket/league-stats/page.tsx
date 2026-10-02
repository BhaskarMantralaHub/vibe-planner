'use client';

import { useRouter } from 'next/navigation';
import { AuthGate } from '@/components/AuthGate';
import { RoleGate } from '@/components/RoleGate';
import { SegmentedControl } from '@/components/ui/segmented-control';
import LeagueStatsView from './components/LeagueStatsView';
import { MATCH_TABS } from '../lib/match-tabs';

// Hero is now owned by LeagueStatsView (its CompactHero) so it can be sticky
// and reflect tab-specific theming. page.tsx is the wrapper + auth gate +
// the Matches-section contextual tabs + the global dock.
//
// Stats is a VIEW of the Matches section: the dock stays on 'matches' and the
// contextual switcher (shared vocabulary with /cricket/schedule) carries the
// Upcoming/Completed/Stats state — same control, same position, so moving
// between schedule and stats feels like switching tabs, not changing apps.
function LeagueStatsContent() {
  const router = useRouter();
  return (
    <div className="px-4 pt-2 pb-cricket-nav space-y-3">
      <SegmentedControl
        ariaLabel="Schedule view"
        options={MATCH_TABS}
        active="stats"
        onChange={(key) => {
          if (key !== 'stats') router.push(`/cricket/schedule?tab=${key}`);
        }}
      />
      <LeagueStatsView />
    </div>
  );
}

export default function LeagueStatsPage() {
  return (
    <AuthGate variant="cricket">
      <RoleGate allowed={['cricket', 'admin']} feature="cricket">
        <LeagueStatsContent />
      </RoleGate>
    </AuthGate>
  );
}
