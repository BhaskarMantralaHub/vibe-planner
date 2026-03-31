'use client';

import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';

/* ── Types ── */

interface BatsmanScore {
  name: string;
  isStriker?: boolean;
  dismissal: string;     // "c Ravi b Sanjay" or "not out" or "b Pradeep"
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  sr: string;
}

interface BowlerFigure {
  name: string;
  overs: string;
  maidens: number;
  dots: number;
  runs: number;
  wickets: number;
  economy: string;
  extras?: string;       // e.g. "(1w, 1nb)" if any
}

interface ExtrasBreakdown {
  wides: number;
  noBalls: number;
  byes: number;
  legByes: number;
  total: number;
}

interface InningsSummary {
  teamName: string;
  target?: number;
  batsmen: BatsmanScore[];
  didNotBat: string[];
  extras: ExtrasBreakdown;
  totalRuns: number;
  totalWickets: number;
  totalOvers: string;
  bowlers: BowlerFigure[];
  fallOfWickets: { wicketNum: number; playerName: string; score: number; over: string }[];
}

/* ── (mock data removed — accepts innings as prop) ── */

/* ── Sub-Components ── */

function SectionHeader({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-4 py-2.5 rounded-t-xl"
      style={{
        background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B) 0%, var(--cricket) 60%, color-mix(in srgb, var(--cricket) 80%, white) 100%)',
        boxShadow: '0 2px 8px color-mix(in srgb, var(--cricket) 20%, transparent)',
      }}
    >
      {children}
    </div>
  );
}

function BattingTable({ innings }: { innings: InningsSummary }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <SectionHeader>
        <div className="flex items-center justify-between">
          <Text size="sm" weight="bold" color="white">
            {innings.teamName} innings
            {innings.target != null && (
              <Text size="xs" weight="medium" color="white" className="opacity-80">
                {' '}(target: {innings.target})
              </Text>
            )}
          </Text>
          <div className="flex gap-3">
            {['R', 'B', '4s', '6s', 'SR'].map((h) => (
              <Text key={h} size="2xs" weight="bold" color="white" tabular className="w-6 text-right opacity-70">
                {h}
              </Text>
            ))}
          </div>
        </div>
      </SectionHeader>

      {/* Batsman rows */}
      <div style={{ background: 'var(--card)' }}>
        {innings.batsmen.map((b, i) => {
          const isNotOut = b.dismissal === 'not out';
          return (
            <div key={i} style={{ background: i % 2 === 1 ? 'color-mix(in srgb, var(--surface) 50%, var(--card))' : 'var(--card)', borderBottom: '1px solid color-mix(in srgb, var(--border) 25%, transparent)' }}>
              <div className="px-4 py-3">
                {/* Name + dismissal */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <Text size="sm" weight="bold" truncate>
                      {b.name}
                    </Text>
                    {b.isStriker && (
                      <Text size="xs" weight="bold" color="cricket">*</Text>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Text size="md" weight="bold" tabular className="w-6 text-right">{b.runs}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.balls}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.fours}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.sixes}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.sr}</Text>
                  </div>
                </div>
                {/* Dismissal text */}
                <Text size="2xs" weight="medium" color={isNotOut ? 'success' : 'dim'} className="mt-1">
                  {b.dismissal}
                </Text>
              </div>
            </div>
          );
        })}

        {/* Extras */}
        <div className="px-4 py-2.5 flex items-center justify-between" style={{ borderBottom: '1px solid color-mix(in srgb, var(--border) 25%, transparent)' }}>
          <Text size="xs" weight="medium" color="muted">
            Extras
            <Text size="2xs" color="dim">
              {' '}(w {innings.extras.wides}, nb {innings.extras.noBalls}, b {innings.extras.byes}, lb {innings.extras.legByes})
            </Text>
          </Text>
          <Text size="sm" weight="bold" tabular>{innings.extras.total}</Text>
        </div>

        {/* Total */}
        <div className="px-4 py-3 flex items-center justify-between" style={{ background: 'color-mix(in srgb, var(--cricket) 8%, var(--card))' }}>
          <Text size="md" weight="bold">
            Total
            <Text size="xs" weight="medium" color="muted">
              {' '}({innings.totalWickets} wkts, {innings.totalOvers} overs)
            </Text>
          </Text>
          <Text size="xl" weight="bold" tabular>{innings.totalRuns}</Text>
        </div>

        {/* Did not bat */}
        {innings.didNotBat.length > 0 && (
          <div className="px-4 py-2.5" style={{ borderTop: '1px solid color-mix(in srgb, var(--border) 25%, transparent)' }}>
            <Text size="2xs" weight="medium" color="dim">
              Did not bat: {innings.didNotBat.join(', ')}
            </Text>
          </div>
        )}
      </div>

    </div>
  );
}

function BowlingTable({ bowlers }: { bowlers: BowlerFigure[] }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
      {/* Header */}
      <SectionHeader>
        <div className="flex items-center justify-between">
          <Text size="sm" weight="bold" color="white">Bowling</Text>
        </div>
      </SectionHeader>

      {/* Column headers */}
      <div className="px-4 py-2 flex items-center justify-between" style={{ background: 'color-mix(in srgb, var(--cricket) 4%, var(--surface))', borderBottom: '1px solid color-mix(in srgb, var(--border) 40%, transparent)' }}>
        <Text size="2xs" weight="bold" color="dim" uppercase tracking="wider" className="flex-1">Bowler</Text>
        <div className="flex gap-1.5">
          {['O', 'M', 'R', 'W', 'Econ'].map((h) => (
            <Text key={h} size="2xs" weight="bold" color="dim" uppercase tracking="wider" tabular className={cn(h === 'Econ' ? 'w-9' : 'w-6', 'text-right')}>
              {h}
            </Text>
          ))}
        </div>
      </div>

      {/* Bowler rows */}
      <div style={{ background: 'var(--card)' }}>
        {bowlers.map((b, i) => (
          <div key={i} style={{ background: i % 2 === 1 ? 'color-mix(in srgb, var(--surface) 50%, var(--card))' : 'var(--card)', borderBottom: '1px solid color-mix(in srgb, var(--border) 25%, transparent)' }}>
            <div className="px-4 py-3 flex items-start justify-between gap-2">
              {/* Name + extras */}
              <div className="min-w-0 flex-1">
                <Text size="sm" weight="bold" truncate>{b.name}</Text>
                {b.extras && (
                  <Text size="2xs" weight="medium" color="muted" className="mt-0.5">{b.extras}</Text>
                )}
              </div>
              {/* Stats */}
              <div className="flex gap-1.5 flex-shrink-0">
                <Text size="sm" weight="medium" tabular className="w-6 text-right">{b.overs}</Text>
                <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.maidens}</Text>
                <Text size="sm" weight="medium" tabular className="w-6 text-right">{b.runs}</Text>
                <Text size="md" weight="bold" tabular className="w-6 text-right">{b.wickets}</Text>
                <Text size="sm" weight="medium" color="muted" tabular className="w-9 text-right">{b.economy}</Text>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ── */

interface FullScorecardProps {
  innings: InningsSummary | null;
}

function FullScorecard({ innings }: FullScorecardProps) {
  if (!innings || innings.batsmen.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4" style={{}}>
        <Text size="sm" color="muted">No scorecard data yet</Text>
      </div>
    );
  }

  return (
    <div
      className="flex-1 overflow-y-auto px-4 space-y-3 py-1"
      style={{}}
    >
      <BattingTable innings={innings} />
      <BowlingTable bowlers={innings.bowlers} />

      {/* ── Fall of Wickets ── */}
      {innings.fallOfWickets.length > 0 && (
        <div className="rounded-xl overflow-hidden" style={{ border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))', boxShadow: '0 2px 10px rgba(0,0,0,0.05)' }}>
          <SectionHeader>
            <Text size="sm" weight="bold" color="white">Fall of Wickets</Text>
          </SectionHeader>
          <div className="grid grid-cols-2 gap-2 p-3" style={{ background: 'var(--card)' }}>
            {innings.fallOfWickets.map((fow) => (
              <div key={fow.wicketNum} className="flex items-center gap-2.5 rounded-xl px-3 py-3" style={{ background: 'color-mix(in srgb, var(--red) 4%, var(--surface))', border: '1px solid color-mix(in srgb, var(--red) 10%, var(--border))' }}>
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--red-deep), var(--red))', boxShadow: '0 2px 6px rgba(220,38,38,0.2)' }}>
                  {fow.playerName.charAt(0)}
                </div>
                <div className="flex flex-col min-w-0">
                  <Text size="xs" weight="bold" truncate>{fow.playerName}</Text>
                  <Text size="2xs" weight="semibold" color="muted" tabular>
                    {fow.wicketNum} - {fow.score}, Ov {fow.over}
                  </Text>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { FullScorecard };
export type { BatsmanScore, BowlerFigure, ExtrasBreakdown, InningsSummary };
