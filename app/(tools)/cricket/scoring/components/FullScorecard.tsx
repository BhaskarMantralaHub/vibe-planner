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

/* ── Mock Data ── */

const MOCK_INNINGS: InningsSummary = {
  teamName: 'SUN',
  target: 138,
  batsmen: [
    { name: 'Bhaskar', dismissal: 'c Ravi b Sanjay', runs: 34, balls: 22, fours: 4, sixes: 1, sr: '154.5' },
    { name: 'Venkat', dismissal: 'b Pradeep', runs: 18, balls: 14, fours: 2, sixes: 0, sr: '128.6' },
    { name: 'Arun', isStriker: true, dismissal: 'not out', runs: 14, balls: 10, fours: 1, sixes: 1, sr: '140.0' },
    { name: 'Sunil', dismissal: 'lbw b Ravi', runs: 6, balls: 8, fours: 0, sixes: 0, sr: '75.0' },
    { name: 'Prasad', dismissal: 'not out', runs: 2, balls: 4, fours: 0, sixes: 0, sr: '50.0' },
  ],
  didNotBat: ['Kumar', 'Naveen', 'Deepak'],
  extras: { wides: 2, noBalls: 1, byes: 1, legByes: 0, total: 4 },
  totalRuns: 78,
  totalWickets: 3,
  fallOfWickets: [
    { wicketNum: 1, playerName: 'Bhaskar', score: 42, over: '4.3' },
    { wicketNum: 2, playerName: 'Venkat', score: 58, over: '5.1' },
    { wicketNum: 3, playerName: 'Sunil', score: 68, over: '5.5' },
  ],
  totalOvers: '6.2',
  bowlers: [
    { name: 'Ravi', overs: '3.0', maidens: 0, dots: 12, runs: 22, wickets: 1, economy: '7.33', extras: '(1nb)' },
    { name: 'Sanjay', overs: '2.0', maidens: 0, dots: 8, runs: 18, wickets: 1, economy: '9.00' },
    { name: 'Pradeep', overs: '1.2', maidens: 0, dots: 4, runs: 12, wickets: 1, economy: '9.23', extras: '(2w)' },
  ],
};

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
        <div className="flex items-center justify-between">
          <Text size="sm" weight="bold" color="white">Bowling</Text>
          <div className="flex gap-2">
            {['O', 'M', 'Dots', 'R', 'W', 'Econ'].map((h) => (
              <Text key={h} size="2xs" weight="semibold" color="white" tabular className="w-7 text-right opacity-80">
                {h}
              </Text>
            ))}
          </div>
        </div>
      </SectionHeader>

      {/* Bowler rows */}
      <div style={{ background: 'var(--surface)' }}>
        {bowlers.map((b, i) => (
          <div key={i}>
            {i > 0 && <div className="mx-3 border-t border-[var(--border)]/30" />}
            <div className="px-3 py-2">
              <div className="flex items-center justify-between">
                <div className="min-w-0 flex-1">
                  <Text size="sm" weight="semibold" truncate>{b.name}</Text>
                  {b.extras && (
                    <Text size="xs" weight="medium" color="muted" className="mt-0.5">{b.extras}</Text>
                  )}
                </div>
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
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Main Component ── */

function FullScorecard() {
  return (
    <div
      className="flex-1 overflow-y-auto px-4 space-y-3 py-1"
      style={{ maxHeight: 260 }}
    >
      <BattingTable innings={MOCK_INNINGS} />
      <BowlingTable bowlers={MOCK_INNINGS.bowlers} />

      {/* ── Fall of Wickets ── */}
      {MOCK_INNINGS.fallOfWickets.length > 0 && (
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="px-3 py-2 rounded-t-xl" style={{ background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))' }}>
            <Text size="sm" weight="bold" color="white">Fall of Wickets</Text>
          </div>
          <div className="grid grid-cols-2 gap-1.5 p-2" style={{ background: 'var(--surface)' }}>
            {MOCK_INNINGS.fallOfWickets.map((fow) => (
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
