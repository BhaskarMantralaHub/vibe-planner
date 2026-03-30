'use client';

import { cn } from '@/lib/utils';
import { Text } from '@/components/ui';
import { MdSportsCricket, MdCheck } from 'react-icons/md';
import { GiTennisBall, GiGloves } from 'react-icons/gi';
import type { PlayerRole } from '@/types/cricket';

/* ── Role badge config ── */
const roleBadge: Record<PlayerRole, { label: string; abbr: string; color: string; icon: React.ReactNode }> = {
  batsman:       { label: 'Batsman',     abbr: 'BAT',  color: 'var(--cricket)',         icon: <MdSportsCricket size={11} /> },
  bowler:        { label: 'Bowler',      abbr: 'BOWL', color: '#3B82F6',               icon: <GiTennisBall size={10} /> },
  'all-rounder': { label: 'All-Rounder', abbr: 'Allrounder', color: 'var(--cricket-accent)',  icon: <MdSportsCricket size={11} /> },
  keeper:        { label: 'Keeper',      abbr: 'WK',   color: '#16A34A',               icon: <GiGloves size={11} /> },
};

import { nameToGradient } from '@/lib/avatar';

/* ── Types ── */
export interface PlayerPickerPlayer {
  id: string;
  name: string;
  jersey_number: number | null;
  photo_url?: string | null;
  player_role?: PlayerRole | null;
  is_guest?: boolean;
}

interface PlayerPickerRowProps {
  player: PlayerPickerPlayer;
  selected: boolean;
  onToggle: () => void;
  /** Disabled state — row is visible but not tappable (e.g. already on other team) */
  disabled?: boolean;
  /** Optional right-side badge label (e.g. "Striker", "Non-Striker", "Bowler") */
  badge?: string;
  /** Selection mode: 'check' shows checkbox, 'radio' shows radio circle, 'highlight' shows no indicator */
  mode?: 'check' | 'radio' | 'highlight';
}

export default function PlayerPickerRow({
  player,
  selected,
  onToggle,
  disabled = false,
  badge,
  mode = 'check',
}: PlayerPickerRowProps) {
  const initials = player.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const [gradFrom, gradTo] = nameToGradient(player.name);
  const role = player.player_role ? roleBadge[player.player_role] : null;

  return (
    <button
      onClick={disabled ? undefined : onToggle}
      disabled={disabled}
      className={cn(
        'group flex w-full items-center gap-3 rounded-2xl px-3 py-3 transition-all duration-200 cursor-pointer',
        'min-h-[56px]',
        selected
          ? 'bg-[var(--cricket)]/8 border-[1.5px] border-[var(--cricket)]/40 shadow-[0_0_12px_rgba(77,187,235,0.12)]'
          : 'bg-[var(--surface)] border-[1.5px] border-[var(--border)] hover:border-[var(--muted)]/30 hover:bg-[var(--hover-bg)]',
        disabled && 'opacity-35 cursor-not-allowed hover:bg-[var(--surface)] hover:border-[var(--border)]',
      )}
    >
      {/* ── Selection indicator ── */}
      {mode === 'check' && (
        <div
          className={cn(
            'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-md border-2 transition-all duration-200',
            selected
              ? 'border-[var(--cricket)] bg-[var(--cricket)] scale-110'
              : 'border-[var(--dim)] group-hover:border-[var(--muted)]',
          )}
        >
          {selected && <MdCheck size={14} className="text-white" />}
        </div>
      )}
      {mode === 'radio' && (
        <div
          className={cn(
            'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 transition-all duration-200',
            selected
              ? 'border-[var(--cricket)]'
              : 'border-[var(--dim)] group-hover:border-[var(--muted)]',
          )}
        >
          {selected && (
            <div className="h-2.5 w-2.5 rounded-full bg-[var(--cricket)]" />
          )}
        </div>
      )}

      {/* ── Avatar ── */}
      <div className="relative flex-shrink-0">
        {player.photo_url ? (
          <img
            src={player.photo_url}
            alt={player.name}
            className={cn(
              'h-10 w-10 rounded-full object-cover transition-all duration-200',
              selected
                ? 'ring-2 ring-[var(--cricket)] ring-offset-2 ring-offset-[var(--bg)]'
                : 'ring-1 ring-[var(--border)]',
            )}
          />
        ) : (
          <div
            className={cn(
              'flex h-10 w-10 items-center justify-center rounded-full text-[13px] font-bold text-white transition-all duration-200',
              selected && 'ring-2 ring-[var(--cricket)] ring-offset-2 ring-offset-[var(--bg)]',
            )}
            style={{ background: `linear-gradient(135deg, ${gradFrom}, ${gradTo})` }}
          >
            {initials}
          </div>
        )}
        {/* Jersey number badge on avatar */}
        {player.jersey_number != null && (
          <div
            className={cn(
              'absolute -bottom-1 -right-1 flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-0.5 text-[9px] font-bold',
              selected
                ? 'bg-[var(--cricket)] text-white'
                : 'bg-[var(--card)] text-[var(--muted)] border border-[var(--border)]',
            )}
          >
            {player.jersey_number}
          </div>
        )}
      </div>

      {/* ── Name + role ── */}
      <div className="flex-1 min-w-0 text-left">
        <Text
          size="sm"
          weight={selected ? 'semibold' : 'medium'}
          className={cn(
            'block transition-colors duration-200',
            selected && 'text-[var(--cricket)]',
          )}
          truncate
        >
          {player.name}{player.is_guest && <span className="text-[var(--dim)] font-normal"> (G)</span>}
        </Text>
        {role && (
          <div className="flex items-center gap-1 mt-0.5">
            <span
              className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-[1px] text-[9px] font-bold uppercase tracking-wider"
              style={{
                color: role.color,
                background: `color-mix(in srgb, ${role.color} 12%, transparent)`,
              }}
            >
              {role.icon}
              {role.abbr}
            </span>
          </div>
        )}
      </div>

      {/* ── Right side: badge or checkmark ── */}
      {badge && selected && (
        <span
          className="flex-shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold text-white"
          style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
        >
          {badge}
        </span>
      )}
      {mode === 'highlight' && selected && !badge && (
        <div
          className="flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full"
          style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
        >
          <MdCheck size={14} className="text-white" />
        </div>
      )}
    </button>
  );
}
