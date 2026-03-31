'use client';

import { Text } from '@/components/ui';

interface ScoreboardProps {
  teamName: string;
  runs: number;
  wickets: number;
  overs: string;
  runRate: string;
  target?: number;
}

function Scoreboard({ teamName, runs, wickets, overs, runRate, target }: ScoreboardProps) {
  return (
    <div
      className="flex items-center justify-between px-5 py-3"
      style={{
        minHeight: 80,
        background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B) 0%, var(--cricket) 60%, color-mix(in srgb, var(--cricket) 80%, white) 100%)',
        borderRadius: '0 0 20px 20px',
        boxShadow: '0 4px 20px color-mix(in srgb, var(--cricket) 30%, transparent)',
      }}
    >
      {/* Left: team name + overs */}
      <div className="flex flex-col gap-0.5">
        <Text size="md" weight="bold" color="white" uppercase tracking="wide">
          {teamName}
        </Text>
        <Text size="xs" color="white" className="opacity-60" tabular>
          ({overs} ov)
        </Text>
      </div>

      {/* Center: big score */}
      <div className="flex items-baseline gap-0.5">
        <Text as="span" color="white" weight="bold" tabular className="text-[40px] leading-none">
          {runs}
        </Text>
        <Text as="span" color="white" weight="semibold" tabular className="text-[20px] leading-none opacity-70">
          /{wickets}
        </Text>
      </div>

      {/* Right: RR + target */}
      <div className="flex flex-col items-end gap-0.5">
        <Text size="xs" color="white" weight="medium" className="opacity-70" tabular>
          RR: {runRate}
        </Text>
        {target !== undefined && (
          <Text size="sm" color="white" weight="bold" className="opacity-90" tabular>
            Target: {target}
          </Text>
        )}
      </div>
    </div>
  );
}

export { Scoreboard };
export type { ScoreboardProps };
