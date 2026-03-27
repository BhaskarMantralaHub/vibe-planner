'use client';

import { Text } from '@/components/ui';

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
      className="px-3 py-2 rounded-t-xl"
      style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}
    >
      {children}
    </div>
  );
}

function BattingTable({ innings }: { innings: InningsSummary }) {
  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
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
              <Text key={h} size="2xs" weight="semibold" color="white" tabular className="w-6 text-right opacity-80">
                {h}
              </Text>
            ))}
          </div>
        </div>
      </SectionHeader>

      {/* Batsman rows */}
      <div style={{ background: 'var(--surface)' }}>
        {innings.batsmen.map((b, i) => {
          const isNotOut = b.dismissal === 'not out';
          return (
            <div key={i}>
              {i > 0 && <div className="mx-3 border-t border-[var(--border)]/30" />}
              <div className="px-3 py-2">
                {/* Name + dismissal */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1 min-w-0 flex-1">
                    <Text size="sm" weight="semibold" truncate>
                      {b.name}
                    </Text>
                    {b.isStriker && (
                      <Text size="xs" weight="bold" color="cricket">*</Text>
                    )}
                  </div>
                  <div className="flex gap-3">
                    <Text size="sm" weight="bold" tabular className="w-6 text-right">{b.runs}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.balls}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.fours}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.sixes}</Text>
                    <Text size="sm" weight="medium" color="muted" tabular className="w-6 text-right">{b.sr}</Text>
                  </div>
                </div>
                {/* Dismissal text */}
                <Text size="2xs" weight="medium" color={isNotOut ? 'success' : 'dim'} className="mt-0.5">
                  {b.dismissal}
                </Text>
              </div>
            </div>
          );
        })}

        {/* Extras */}
        <div className="mx-3 border-t border-[var(--border)]/30" />
        <div className="px-3 py-2 flex items-center justify-between">
          <Text size="xs" weight="medium" color="muted">
            Extras
            <Text size="2xs" color="dim">
              {' '}(w {innings.extras.wides}, nb {innings.extras.noBalls}, b {innings.extras.byes}, lb {innings.extras.legByes})
            </Text>
          </Text>
          <Text size="sm" weight="bold" tabular>{innings.extras.total}</Text>
        </div>

        {/* Total */}
        <div className="mx-3 border-t border-[var(--border)]/30" />
        <div className="px-3 py-2 flex items-center justify-between" style={{ background: 'color-mix(in srgb, var(--cricket) 6%, transparent)' }}>
          <Text size="sm" weight="bold">
            Total
            <Text size="xs" weight="medium" color="muted">
              {' '}({innings.totalWickets} wkts, {innings.totalOvers} overs)
            </Text>
          </Text>
          <Text size="lg" weight="bold" tabular>{innings.totalRuns}</Text>
        </div>

        {/* Did not bat */}
        {innings.didNotBat.length > 0 && (
          <>
            <div className="mx-3 border-t border-[var(--border)]/30" />
            <div className="px-3 py-2">
              <Text size="2xs" weight="medium" color="dim">
                Did not bat: {innings.didNotBat.join(', ')}
              </Text>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

function BowlingTable({ bowlers }: { bowlers: BowlerFigure[] }) {
  return (
    <div className="rounded-xl border border-[var(--border)] overflow-hidden">
      {/* Header */}
      <SectionHeader>
        <Text size="sm" weight="bold" color="white">Bowling</Text>
        <div className="flex gap-2 mt-1">
          {['O', 'M', 'Dots', 'R', 'W', 'Econ'].map((h) => (
            <Text key={h} size="2xs" weight="semibold" color="white" tabular className="w-7 text-right opacity-80">
              {h}
            </Text>
          ))}
        </div>
      </SectionHeader>

      {/* Bowler rows */}
      <div style={{ background: 'var(--surface)' }}>
        {bowlers.map((b, i) => (
          <div key={i}>
            {i > 0 && <div className="mx-3 border-t border-[var(--border)]/30" />}
            <div className="px-3 py-2">
              {/* Name + extras on first line */}
              <div className="flex items-baseline justify-between mb-0.5">
                <div className="flex items-baseline gap-1 min-w-0 flex-1 mr-2">
                  <Text size="sm" weight="semibold" truncate>{b.name}</Text>
                  {b.extras && (
                    <Text size="2xs" weight="medium" color="muted" className="flex-shrink-0">{b.extras}</Text>
                  )}
                </div>
              </div>
              {/* Stats row — fixed widths, always aligned */}
              <div className="flex gap-2">
                <Text size="sm" weight="medium" tabular className="w-7 text-right">{b.overs}</Text>
                <Text size="sm" weight="medium" color="muted" tabular className="w-7 text-right">{b.maidens}</Text>
                <Text size="sm" weight="medium" color="muted" tabular className="w-7 text-right">{b.dots}</Text>
                <Text size="sm" weight="medium" tabular className="w-7 text-right">{b.runs}</Text>
                <Text size="sm" weight="bold" tabular className="w-7 text-right">{b.wickets}</Text>
                <Text size="sm" weight="medium" color="muted" tabular className="w-7 text-right">{b.economy}</Text>
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
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 rounded-t-xl" style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
            <Text size="sm" weight="bold" color="white">Fall of Wickets</Text>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2" style={{ background: 'var(--surface)' }}>
            {innings.fallOfWickets.map((fow) => (
              <div key={fow.wicketNum} className="flex items-center gap-2.5 rounded-xl bg-[var(--card)] border border-[var(--border)]/30 px-3 py-2.5">
                <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[12px] font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
                  {fow.playerName.charAt(0)}
                </div>
                <div className="flex flex-col min-w-0">
                  <Text size="xs" weight="semibold" truncate>{fow.playerName}</Text>
                  <Text size="2xs" weight="medium" color="muted" tabular>
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
