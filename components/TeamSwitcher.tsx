'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useAuthStore, type UserTeam } from '@/stores/auth-store';
import { Text, Spinner } from '@/components/ui';
import { MdKeyboardArrowDown, MdCheck } from 'react-icons/md';

const DEFAULT_COLORS: Record<string, string> = {
  'sunrisers-manteca': '#0c4a6e',
};

function getTeamColor(team: UserTeam): string {
  return team.primary_color || DEFAULT_COLORS[team.team_slug] || '#0369a1';
}

function TeamLogo({ team, size }: { team: UserTeam; size: 'sm' | 'md' | 'lg' }) {
  const dim = { sm: 'w-7 h-7', md: 'w-10 h-10', lg: 'w-12 h-12' }[size];
  const textSize = { sm: 'text-[11px]', md: 'text-[15px]', lg: 'text-[18px]' }[size];
  const radius = size === 'sm' ? 'rounded-lg' : 'rounded-xl';
  const color = getTeamColor(team);

  // Teams with custom logos
  if (team.logo_url || team.team_slug === 'sunrisers-manteca') {
    const src = team.logo_url || '/cricket-logo.png';
    return (
      <img
        src={src}
        alt={team.team_name}
        className={`${dim} ${radius} object-cover shrink-0`}
      />
    );
  }

  // Fallback: colored initial
  return (
    <div
      className={`${dim} ${radius} flex items-center justify-center text-white font-bold ${textSize} shrink-0`}
      style={{ background: `linear-gradient(135deg, ${color}, ${color}dd)` }}
    >
      {team.team_name.charAt(0).toUpperCase()}
    </div>
  );
}

export { TeamLogo };

export default function TeamSwitcher() {
  const { userTeams, currentTeamId, setCurrentTeam } = useAuthStore();
  const [open, setOpen] = useState(false);
  const [switchingTo, setSwitchingTo] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const currentTeam = userTeams.find(t => t.team_id === currentTeamId) ?? userTeams[0];
  const teamName = currentTeam?.team_name ?? 'Team';
  const isMultiTeam = userTeams.length > 1;

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSwitch = (team: UserTeam) => {
    if (team.team_id === currentTeamId) { setOpen(false); return; }
    setSwitchingTo(team.team_id);
    setTimeout(() => {
      setCurrentTeam(team.team_id);
      setOpen(false);
      window.location.reload();
    }, 400);
  };

  // Single-team: logo + name
  if (!isMultiTeam) {
    return (
      <div className="flex items-center gap-2">
        {currentTeam && <TeamLogo team={currentTeam} size="sm" />}
        <Text size="sm" weight="semibold" className="max-w-[140px] sm:max-w-[200px] truncate bg-gradient-to-r from-[var(--cricket)] to-[var(--blue)] bg-clip-text text-transparent">
          {teamName}
        </Text>
      </div>
    );
  }

  // Multi-team
  return (
    <div className="relative" ref={dropdownRef}>
      <motion.button
        whileTap={{ scale: 0.96 }}
        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(!open); }}
        className="flex items-center gap-2 cursor-pointer transition-all active:opacity-80"
      >
        {currentTeam && <TeamLogo team={currentTeam} size="sm" />}
        <Text size="sm" weight="semibold" className="max-w-[140px] sm:max-w-[200px] truncate bg-gradient-to-r from-[var(--cricket)] to-[var(--blue)] bg-clip-text text-transparent">
          {teamName}
        </Text>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          className="flex items-center"
        >
          <MdKeyboardArrowDown size={16} className="text-[var(--muted)]" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 sm:hidden"
            onClick={() => setOpen(false)}
          />
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8, scale: 0.96 }}
            transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            className="fixed sm:absolute left-4 right-4 sm:left-0 sm:right-auto top-16 sm:top-full z-50 sm:mt-2.5 w-auto sm:w-[300px] rounded-2xl overflow-hidden"
            style={{
              background: 'var(--card)',
              border: '1px solid color-mix(in srgb, var(--border) 80%, transparent)',
              boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 8px 20px rgba(0,0,0,0.1)',
            }}
          >
            {/* Team list */}
            <div className="p-2">
              {userTeams.map((team) => {
                const isActive = team.team_id === currentTeamId;
                const isSwitching = switchingTo === team.team_id;
                const color = getTeamColor(team);

                return (
                  <motion.button
                    key={team.team_id}
                    onClick={() => handleSwitch(team)}
                    whileTap={{ scale: 0.98 }}
                    className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl cursor-pointer transition-all duration-150 ${
                      isActive ? '' : 'hover:bg-[var(--surface)]'
                    }`}
                    style={isActive ? {
                      background: `color-mix(in srgb, ${color} 10%, var(--card))`,
                      boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${color} 25%, transparent)`,
                    } : undefined}
                  >
                    <TeamLogo team={team} size="md" />
                    <div className="flex-1 min-w-0 text-left">
                      <Text size="sm" weight={isActive ? 'bold' : 'medium'} className="truncate">
                        {team.team_name}
                      </Text>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span
                          className="inline-block w-[6px] h-[6px] rounded-full"
                          style={{ background: isActive ? '#22c55e' : 'var(--dim)' }}
                        />
                        <Text size="2xs" color={isActive ? 'muted' : 'dim'} className="capitalize">
                          {team.role}
                        </Text>
                      </div>
                    </div>

                    {isSwitching ? (
                      <Spinner size="sm" />
                    ) : isActive ? (
                      <div
                        className="w-6 h-6 rounded-full flex items-center justify-center shrink-0"
                        style={{ background: color }}
                      >
                        <MdCheck size={14} className="text-white" />
                      </div>
                    ) : (
                      <div className="w-6 h-6 rounded-full border-[1.5px] border-[var(--border)] shrink-0" />
                    )}
                  </motion.button>
                );
              })}
            </div>
          </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
