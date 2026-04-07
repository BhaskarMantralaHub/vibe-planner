'use client';

import { useState } from 'react';
import { useAuthStore, type UserTeam } from '@/stores/auth-store';
import { Text, Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody } from '@/components/ui';
import { MdCheck, MdKeyboardArrowDown } from 'react-icons/md';

/// Team switcher — shown in cricket header for multi-team users.
/// Single-team users see static team name (no switcher affordance).
/// On switch: updates store + localStorage, page reloads cricket data via RLS.

export default function TeamSwitcher() {
  const { userTeams, currentTeamId, setCurrentTeam } = useAuthStore();
  const [open, setOpen] = useState(false);

  const currentTeam = userTeams.find(t => t.team_id === currentTeamId) ?? userTeams[0];
  const teamName = currentTeam?.team_name ?? 'Team';
  const isMultiTeam = userTeams.length > 1;

  const handleSwitch = (team: UserTeam) => {
    if (team.team_id === currentTeamId) {
      setOpen(false);
      return;
    }
    setCurrentTeam(team.team_id);
    setOpen(false);
    // Reload to re-fetch data with new team's RLS context
    window.location.reload();
  };

  // Single-team: static name, no interaction
  if (!isMultiTeam) {
    return (
      <Text size="lg" weight="semibold" tracking="tight" className="bg-gradient-to-r from-[var(--cricket)] to-[var(--blue)] bg-clip-text text-transparent">
        {teamName}
      </Text>
    );
  }

  // Multi-team: tappable name with chevron
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-0.5 cursor-pointer active:scale-95 transition-transform"
      >
        <Text size="lg" weight="semibold" tracking="tight" className="bg-gradient-to-r from-[var(--cricket)] to-[var(--blue)] bg-clip-text text-transparent">
          {teamName}
        </Text>
        <MdKeyboardArrowDown size={20} className="text-[var(--cricket)] -ml-0.5" />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerHandle />
        <DrawerHeader>
          <DrawerTitle>Switch Team</DrawerTitle>
        </DrawerHeader>
        <DrawerBody>
          <div className="space-y-1 pb-4">
            {userTeams.map((team) => {
              const isActive = team.team_id === currentTeamId;
              return (
                <button
                  key={team.team_id}
                  onClick={() => handleSwitch(team)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-xl cursor-pointer transition-colors ${
                    isActive
                      ? 'bg-[color-mix(in_srgb,var(--cricket)_12%,transparent)]'
                      : 'hover:bg-[var(--surface)]'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-[14px]"
                      style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
                    >
                      {team.team_name.charAt(0).toUpperCase()}
                    </div>
                    <div className="text-left">
                      <Text size="sm" weight="semibold">{team.team_name}</Text>
                      <Text size="2xs" color="muted" className="capitalize">{team.role}</Text>
                    </div>
                  </div>
                  {isActive && <MdCheck size={20} className="text-[var(--cricket)]" />}
                </button>
              );
            })}
          </div>
        </DrawerBody>
      </Drawer>
    </>
  );
}
