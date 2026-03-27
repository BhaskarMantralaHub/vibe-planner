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
      className="flex items-center justify-between px-4 py-2"
      style={{
        height: 72,
        background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))',
        borderRadius: '0 0 16px 16px',
      }}
    >
      {/* Left: team name + overs */}
      <div className="flex flex-col">
        <Text size="md" weight="semibold" color="white" uppercase>
          {teamName}
        </Text>
        <Text size="xs" color="white" className="opacity-70" tabular>
          ({overs} ov)
        </Text>
      </div>

      {/* Center: big score */}
      <div className="flex items-baseline gap-0.5">
        <Text as="span" color="white" weight="bold" tabular className="text-[34px] leading-none">
          {runs}
        </Text>
        <Text as="span" color="white" weight="semibold" tabular className="text-[18px] leading-none opacity-80">
          /{wickets}
        </Text>
      </div>

      {/* Right: RR + target */}
      <div className="flex flex-col items-end">
        <Text size="xs" color="white" className="opacity-75" tabular>
          RR: {runRate}
        </Text>
        {target !== undefined && (
          <Text size="xs" color="white" className="opacity-75" tabular>
            Target: {target}
          </Text>
        )}
      </div>
    </div>
  );
}

export { Scoreboard };
export type { ScoreboardProps };
