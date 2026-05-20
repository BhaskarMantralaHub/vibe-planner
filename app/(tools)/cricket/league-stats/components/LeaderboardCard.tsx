import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Text } from '@/components/ui';
import PlayerAvatar from './PlayerAvatar';

export type LeaderboardCardProps = {
  rank: number;
  playerName: string;
  playerPhotoUrl?: string | null;
  /* CSS color value, e.g. 'var(--stat-batting)'. Drives chevron tint on hover. */
  accentColor: string;
  /* Primary stat row — caller renders 4 stat columns or whatever the tab needs. */
  primaryRow: ReactNode;
  /* Secondary line below the primary row (e.g. "★ HS 62* · 25 4s · 12 6s"). */
  footer?: ReactNode;
  /* Optional right-side panel next to the primary stats (e.g. Recent form chips). */
  rightInline?: ReactNode;
  /* Tap handler — opens player detail bottom sheet. */
  onTap?: () => void;
  /* Whether the chevron is shown. */
  showChevron?: boolean;
  /* Index in the leaderboard — drives the cascading entrance animation.
   *  Capped internally so long rosters don't get long staggers. */
  revealIndex?: number;
};

/* Rank pill — elite gold/silver/bronze for top 3 (28px, glow + gradient ring),
   dim numeric for the rest (22px). Inlined here to keep this component
   self-contained. The "elite" feel comes from the inset highlight + outer
   colored glow shadow — these are what separate the top 3 from the field. */
function RankBadge({ rank }: { rank: number }): JSX.Element {
  if (rank <= 3) {
    const s =
      rank === 1
        ? {
            bg: 'linear-gradient(135deg, #FFE17A 0%, #FFB300 60%, #C97A00 100%)',
            text: '#5A3A00',
            glow: '0 0 0 2px rgba(255,200,80,0.35), 0 4px 14px rgba(255,180,60,0.45), inset 0 1px 1px rgba(255,255,255,0.6)',
          }
        : rank === 2
          ? {
              bg: 'linear-gradient(135deg, #F1F1F1 0%, #BDBDBD 60%, #8E8E8E 100%)',
              text: '#1A1A1A',
              glow: '0 0 0 2px rgba(200,200,200,0.35), 0 4px 12px rgba(180,180,180,0.4), inset 0 1px 1px rgba(255,255,255,0.7)',
            }
          : {
              bg: 'linear-gradient(135deg, #E5A572 0%, #B97339 60%, #7A4715 100%)',
              text: '#fff',
              glow: '0 0 0 2px rgba(205,127,50,0.35), 0 4px 12px rgba(180,105,40,0.4), inset 0 1px 1px rgba(255,255,255,0.4)',
            };
    return (
      <div
        className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[13px] font-black"
        style={{ background: s.bg, color: s.text, boxShadow: s.glow }}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </div>
    );
  }
  return (
    <div
      className="flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold tabular-nums"
      style={{
        color: 'var(--muted)',
        background: 'color-mix(in srgb, var(--muted) 8%, transparent)',
      }}
      aria-label={`Rank ${rank}`}
    >
      {rank}
    </div>
  );
}

export default function LeaderboardCard({
  rank,
  playerName,
  playerPhotoUrl,
  accentColor,
  primaryRow,
  footer,
  rightInline,
  onTap,
  showChevron = true,
  revealIndex = 0,
}: LeaderboardCardProps): JSX.Element {
  const [hovered, setHovered] = useState(false);
  const tappable = Boolean(onTap);
  // Stagger entrance: each card waits a few ms longer than the previous so
  // the leaderboard cascades into view. Cap at 8 so a 20-row roster
  // doesn't end with a half-second-late tail.
  const revealDelay = `${Math.min(revealIndex, 8) * 50}ms`;

  return (
    <div
      role={tappable ? 'button' : undefined}
      tabIndex={tappable ? 0 : undefined}
      onClick={onTap}
      onKeyDown={
        tappable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onTap?.();
              }
            }
          : undefined
      }
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label={tappable ? `Rank ${rank}, ${playerName}. Open detailed stats.` : undefined}
      className={[
        'relative w-full rounded-[20px] text-left transition-all overflow-hidden animate-card-rise',
        // Podium tier (rank 1-3) gets more padding + heavier shadow so the
        // top-of-leaderboard rhythm visually echoes a real podium. Default
        // tier keeps the lighter look so the page doesn't all shout.
        rank <= 3
          ? 'px-4 py-4 shadow-[0_4px_18px_rgba(0,0,0,0.07)]'
          : 'px-4 py-3 shadow-[0_2px_8px_rgba(0,0,0,0.035)]',
        rank <= 3
          ? 'border border-[var(--border)]/50'
          : 'border border-[var(--border)]/30',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--cricket)]/60',
        tappable
          ? rank <= 3
            ? 'cursor-pointer hover:shadow-[0_14px_36px_rgba(0,0,0,0.13)] hover:-translate-y-[2px] active:scale-[0.99]'
            : 'cursor-pointer hover:shadow-[0_8px_22px_rgba(0,0,0,0.09)] hover:-translate-y-[1px] active:scale-[0.99]'
          : '',
      ].join(' ')}
      style={{
        // Vertical stadium-lighting gradient — accent at the top fading into
        // the card surface. Podium tier gets a stronger tint (~14%) so the
        // top 3 read as elevated; default tier stays subtle (~7%) to create
        // visual breathing room between podium and the field.
        background: rank <= 3
          ? `linear-gradient(180deg, color-mix(in srgb, ${accentColor} 14%, var(--card)) 0%, var(--card) 60%)`
          : `linear-gradient(180deg, color-mix(in srgb, ${accentColor} 7%, var(--card)) 0%, var(--card) 55%)`,
        animationDelay: revealDelay,
      }}
    >
      {/* Vertical accent ribbon along the left edge — provides a discipline
          colour cue without dominating the card. Top 3 ribbons get a brighter
          tint so the eye is drawn to the leaders. */}
      <div
        aria-hidden
        className="absolute left-0 top-3 bottom-3 w-[3px] rounded-full"
        style={{
          background: rank <= 3
            ? accentColor
            : `color-mix(in srgb, ${accentColor} 35%, transparent)`,
        }}
      />

      <div className="flex items-start gap-3 min-w-0">
        {/* Avatar — 48px (reduced from 64). Sits left of the content stack
            but plays a supporting role: primary stats must dominate. */}
        <PlayerAvatar
          name={playerName}
          photoUrl={playerPhotoUrl}
          size={48}
          ringColor={rank <= 3 ? accentColor : undefined}
        />

        {/* Content column: header row (medal + name + chevron), primary slot, footer. */}
        <div className="flex-1 min-w-0 flex flex-col gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <RankBadge rank={rank} />
            <Text size="md" weight="bold" className="truncate flex-1 min-w-0 leading-tight">
              {playerName}
            </Text>
            {showChevron && (
              <ChevronDown
                size={18}
                className="flex-shrink-0 transition-colors"
                style={{ color: hovered ? accentColor : 'var(--muted)' }}
              />
            )}
          </div>

          {/* Primary slot — cinematic hero stat block lives here. */}
          <div className="min-w-0">{primaryRow}</div>

          {/* rightInline retained for legacy callers; not used by new Batting
              card (Recent chips moved into the footer). */}
          {rightInline && <div className="min-w-0">{rightInline}</div>}

          {footer && (
            <div className="text-[11px] text-[var(--muted)] min-w-0">
              {footer}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
