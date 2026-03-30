'use client';

import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';
import { MdCheck } from 'react-icons/md';
import type { TeamSide, TossDecision } from '@/types/scoring';

interface TossPageProps {
  teamAName: string;
  teamBName: string;
  tossWinner: TeamSide;
  tossDecision: TossDecision;
  onTossWinnerChange: (winner: TeamSide) => void;
  onTossDecisionChange: (decision: TossDecision) => void;
  className?: string;
}

function TossPage({
  teamAName, teamBName, tossWinner, tossDecision,
  onTossWinnerChange, onTossDecisionChange, className,
}: TossPageProps) {
  const winnerName = tossWinner === 'team_a' ? (teamAName || 'Team A') : (teamBName || 'Team B');

  return (
    <div className={cn('flex flex-col gap-0', className)}>
      {/* Hero image — full bleed with gradient fade */}
      <div className="relative overflow-hidden rounded-2xl mx-[-16px]" style={{ height: 200 }}>
        <img
          src="/toss.png"
          alt="Cricket toss ceremony"
          className="w-full h-full object-cover object-top"
        />
        <div
          className="absolute inset-0"
          style={{ background: 'linear-gradient(to bottom, transparent 40%, var(--bg) 100%)' }}
        />
      </div>

      {/* Headline — overlaps the gradient fade */}
      <div className="text-center mt-[-8px] mb-5 relative z-10">
        <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
          Coin has been tossed
        </Text>
        <Text as="h2" size="xl" weight="bold" className="mt-1">
          Who won the toss?
        </Text>
      </div>

      {/* Team cards */}
      <div className="flex gap-3">
        {(['team_a', 'team_b'] as const).map((side) => {
          const name = side === 'team_a' ? (teamAName || 'Team A') : (teamBName || 'Team B');
          const isSelected = tossWinner === side;
          return (
            <button
              key={side}
              onClick={() => onTossWinnerChange(side)}
              className={cn(
                'flex-1 flex flex-col items-center justify-center gap-2 rounded-2xl py-5 cursor-pointer',
                'transition-all duration-200 active:scale-[0.95] select-none',
                isSelected
                  ? 'border-2 border-[var(--cricket)]'
                  : 'border border-[var(--border)] bg-[var(--card)]',
              )}
              style={isSelected ? {
                background: 'color-mix(in srgb, var(--cricket) 12%, var(--card))',
                boxShadow: '0 0 16px var(--cricket-glow)',
              } : undefined}
            >
              <div
                className="h-10 w-10 rounded-full flex items-center justify-center transition-all duration-200"
                style={isSelected
                  ? { background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }
                  : { background: 'var(--surface)', border: '1.5px solid var(--border)' }
                }
              >
                {isSelected ? (
                  <MdCheck size={20} className="text-white" />
                ) : (
                  <Text size="md" weight="bold" color="muted">{name[0]?.toUpperCase()}</Text>
                )}
              </div>
              <Text
                size="sm"
                weight="semibold"
                className="leading-tight text-center px-2"
                style={isSelected ? { color: 'var(--cricket)' } : undefined}
              >
                {name}
              </Text>
            </button>
          );
        })}
      </div>

      {/* Decision section — animated reveal */}
      <div
        className="overflow-hidden"
        style={{
          maxHeight: 200,
          opacity: 1,
          transition: 'max-height 350ms cubic-bezier(0.4,0,0.2,1), opacity 300ms ease',
        }}
      >
        <div className="pt-6">
          <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider" className="text-center mb-3">
            {winnerName} elected to...
          </Text>
          <div className="flex gap-3">
            {(['bat', 'bowl'] as const).map((decision) => {
              const isSelected = tossDecision === decision;
              return (
                <button
                  key={decision}
                  onClick={() => onTossDecisionChange(decision)}
                  className={cn(
                    'flex-1 h-14 rounded-2xl border flex items-center justify-center cursor-pointer',
                    'transition-all duration-200 active:scale-[0.95] select-none',
                    isSelected
                      ? 'border-transparent text-white'
                      : 'border-[var(--border)] bg-[var(--card)]',
                  )}
                  style={isSelected ? {
                    background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
                    boxShadow: '0 0 16px var(--cricket-glow)',
                  } : undefined}
                >
                  <Text size="md" weight="bold" style={isSelected ? { color: 'white' } : undefined}>
                    {decision === 'bat' ? 'Bat First' : 'Bowl First'}
                  </Text>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Confirmation sentence */}
      <div className="text-center px-2 pt-4">
        <Text as="p" size="sm" weight="medium" color="muted">
          <span style={{ color: 'var(--cricket)', fontWeight: 600 }}>{winnerName}</span>
          {' '}won the toss and elected to{' '}
          <span style={{ color: 'var(--cricket)', fontWeight: 600 }}>{tossDecision}</span>
          {' '}first.
        </Text>
      </div>
    </div>
  );
}

export { TossPage };
export type { TossPageProps };
