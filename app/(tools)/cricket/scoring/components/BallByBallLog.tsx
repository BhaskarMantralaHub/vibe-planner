'use client';

import { useRef, useEffect } from 'react';
import { Text } from '@/components/ui';

/* ── Types ── */

interface BallEntry {
  overBall: string;       // e.g. "0.1", "1.6"
  bowler: string;
  batter: string;
  runs: number;
  type: 'dot' | 'single' | 'double' | 'triple' | 'four' | 'six' | 'wide' | 'noball' | 'bye' | 'legbye' | 'wicket';
  wicketText?: string;    // e.g. "c Venkat b Ravi"
  timestamp: string;      // e.g. "10:02"
}

interface OverSummary {
  overNumber: number;
  totalRuns: number;
  batsmen: { name: string; runs: number; balls: number }[];
  bowlerName: string;
  bowlerFigures: string;  // e.g. "1.0-0-14-0"
  runRate: string;
  teamName: string;
  teamScore: string;      // e.g. "14/0"
}

interface InningsBreakData {
  teamName: string;
  totalRuns: number;
  totalWickets: number;
  totalOvers: string;
  target: number;
}

interface MatchResultData {
  result: string;
  team1: { name: string; runs: number; wickets: number; overs: string };
  team2: { name: string; runs: number; wickets: number; overs: string };
}

interface RetirementData {
  playerName: string;
  replacementName: string;
  runs: number;
  balls: number;
}

type TimelineEntry =
  | { kind: 'ball'; data: BallEntry }
  | { kind: 'overSummary'; data: OverSummary }
  | { kind: 'inningsBreak'; data: InningsBreakData }
  | { kind: 'matchResult'; data: MatchResultData }
  | { kind: 'retirement'; data: RetirementData };

/* ── Ball color map (matches OverTimeline 3-tone palette) ── */
const ballTypeColor: Record<BallEntry['type'], { bg: string; text: string }> = {
  dot:    { bg: '#9CA3AF', text: 'white' },
  single: { bg: '#6B7280', text: 'white' },
  double: { bg: '#6B7280', text: 'white' },
  triple: { bg: '#6B7280', text: 'white' },
  four:   { bg: '#1A75A8', text: 'white' },
  six:    { bg: '#1A75A8', text: 'white' },
  wide:   { bg: '#D97706', text: 'white' },
  noball: { bg: '#D97706', text: 'white' },
  bye:    { bg: '#D97706', text: 'white' },
  legbye: { bg: '#D97706', text: 'white' },
  wicket: { bg: '#DC2626', text: 'white' },
};

function ballLabel(entry: BallEntry): string {
  if (entry.type === 'wicket') return 'W';
  if (entry.type === 'wide') return 'Wd';
  if (entry.type === 'noball') return 'NB';
  if (entry.type === 'bye') return 'B';
  if (entry.type === 'legbye') return 'LB';
  if (entry.type === 'dot') return '\u00B7';
  return String(entry.runs);
}

function eventTag(entry: BallEntry): string | null {
  switch (entry.type) {
    case 'four': return 'FOUR';
    case 'six': return 'SIX';
    case 'wide': return 'WIDE';
    case 'noball': return 'NO BALL';
    case 'wicket': return 'WICKET';
    default: return null;
  }
}

function ballDescription(entry: BallEntry): string {
  if (entry.type === 'wicket') {
    return `${entry.bowler} to ${entry.batter}, OUT`;
  }
  if (entry.type === 'wide') {
    return `${entry.bowler} to ${entry.batter}, ${entry.runs} run${entry.runs !== 1 ? 's' : ''}, wide`;
  }
  if (entry.type === 'noball') {
    return `${entry.bowler} to ${entry.batter}, ${entry.runs} run${entry.runs !== 1 ? 's' : ''}, no ball`;
  }
  if (entry.type === 'dot') {
    return `${entry.bowler} to ${entry.batter}, no run`;
  }
  return `${entry.bowler} to ${entry.batter}, ${entry.runs} run${entry.runs !== 1 ? 's' : ''}`;
}

/* ── (mock data removed — accepts timeline as prop) ── */

/* ── Components ── */

function BallPill({ entry }: { entry: BallEntry }) {
  const c = ballTypeColor[entry.type];
  const label = ballLabel(entry);
  const isSmall = ['Wd', 'NB', 'LB'].includes(label);
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full"
      style={{ width: 36, height: 36, backgroundColor: c.bg }}
    >
      <span
        className="font-bold tabular-nums leading-none"
        style={{ color: c.text, fontSize: label === '\u00B7' ? 22 : isSmall ? 11 : 14 }}
      >
        {label}
      </span>
    </div>
  );
}

function BallRow({ entry }: { entry: BallEntry }) {
  const isWicket = entry.type === 'wicket';
  const tag = eventTag(entry);
  return (
    <div
      className="flex items-start gap-3 px-3 py-2.5 rounded-xl"
      style={{
        background: isWicket
          ? 'color-mix(in srgb, #EF4444 8%, transparent)'
          : 'transparent',
        borderLeft: isWicket ? '3px solid #EF4444' : '3px solid transparent',
      }}
    >
      <BallPill entry={entry} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <Text size="xs" weight="semibold" color="muted" tabular className="flex-shrink-0">
            {entry.overBall}
          </Text>
          <Text size="sm" weight={tag ? 'semibold' : 'normal'} className="flex-1 min-w-0" truncate>
            {ballDescription(entry)}
          </Text>
        </div>
        {tag && (
          <Text
            size="xs"
            weight="bold"
            color={isWicket ? 'danger' : entry.type === 'four' ? 'accent' : entry.type === 'six' ? 'success' : 'muted'}
            className="mt-0.5"
          >
            {isWicket ? `OUT! ${entry.batter} — ${entry.wicketText ?? 'dismissed'}` : tag}
          </Text>
        )}
      </div>
      <Text size="2xs" color="dim" tabular className="flex-shrink-0 mt-0.5">
        {entry.timestamp}
      </Text>
    </div>
  );
}

function OverSummaryCard({ data }: { data: OverSummary }) {
  return (
    <div
      className="mx-1 my-2 rounded-xl border border-[var(--cricket)]/20 p-3"
      style={{ background: 'color-mix(in srgb, var(--cricket) 6%, var(--surface))' }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <Text size="sm" weight="bold" color="cricket">
          Over {data.overNumber}
        </Text>
        <Text size="sm" weight="bold" tabular>
          {data.totalRuns} runs
        </Text>
      </div>

      {/* Body — batsmen + bowler */}
      <div className="flex gap-4">
        {/* Batsmen */}
        <div className="flex-1 space-y-0.5">
          {data.batsmen.map((b, i) => (
            <div key={i} className="flex items-center gap-2">
              <Text size="xs" weight="medium" truncate className="flex-1">
                {b.name}
              </Text>
              <Text size="xs" weight="semibold" tabular>
                {b.runs} ({b.balls})
              </Text>
            </div>
          ))}
        </div>

        {/* Divider */}
        <div className="w-px bg-[var(--border)]" />

        {/* Bowler */}
        <div className="flex-1 space-y-0.5">
          <div className="flex items-center gap-1">
            <Text size="2xs" weight="medium" color="muted">Bowler:</Text>
            <Text size="xs" weight="semibold">{data.bowlerName}</Text>
          </div>
          <Text size="2xs" weight="medium" color="muted" tabular>{data.bowlerFigures}</Text>
          <Text size="2xs" weight="medium" color="muted" tabular>Run Rate: {data.runRate}</Text>
        </div>
      </div>

      {/* Team score */}
      <div className="mt-2 pt-2 border-t border-[var(--border)]">
        <Text size="xs" weight="bold" tabular>
          {data.teamName}: {data.teamScore}
        </Text>
      </div>
    </div>
  );
}

function RetirementCard({ data }: { data: RetirementData }) {
  return (
    <div className="mx-2 my-1 px-3 py-2 rounded-xl border border-teal-500/30 bg-teal-500/5">
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-teal-500/15 flex-shrink-0">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-teal-500">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <Text as="p" size="xs" weight="semibold" className="text-teal-500">
            {data.playerName} retired ({data.runs} runs, {data.balls}b)
          </Text>
          <Text as="p" size="2xs" color="muted">
            {data.replacementName} comes in
          </Text>
        </div>
      </div>
    </div>
  );
}

interface BallByBallLogProps {
  timeline: TimelineEntry[];
}

function MatchResultCard({ data }: { data: MatchResultData }) {
  return (
    <div
      className="mx-1 my-3 rounded-xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))' }}
    >
      <div className="px-4 py-4">
        <Text size="2xs" weight="semibold" color="white" uppercase tracking="wider" className="opacity-70">
          Match Result
        </Text>
        <Text as="p" size="md" weight="bold" color="white" className="mt-1">
          {data.result}
        </Text>
        <div className="mt-3 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <Text size="sm" weight="medium" color="white">{data.team1.name}</Text>
            <Text size="sm" weight="bold" color="white" tabular>
              {data.team1.runs}/{data.team1.wickets} <Text size="xs" color="white" className="opacity-60">({data.team1.overs})</Text>
            </Text>
          </div>
          <div className="flex items-center justify-between">
            <Text size="sm" weight="medium" color="white">{data.team2.name}</Text>
            <Text size="sm" weight="bold" color="white" tabular>
              {data.team2.runs}/{data.team2.wickets} <Text size="xs" color="white" className="opacity-60">({data.team2.overs})</Text>
            </Text>
          </div>
        </div>
      </div>
    </div>
  );
}

function InningsBreakCard({ data }: { data: InningsBreakData }) {
  return (
    <div
      className="mx-1 my-3 rounded-xl overflow-hidden"
      style={{ background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))' }}
    >
      <div className="px-4 py-3 text-center">
        <Text size="2xs" weight="semibold" color="white" uppercase tracking="wider" className="opacity-70">
          End of 1st Innings
        </Text>
        <Text as="p" size="lg" weight="bold" color="white" tabular className="mt-1">
          {data.teamName} {data.totalRuns}/{data.totalWickets}
        </Text>
        <Text size="xs" color="white" className="opacity-70" tabular>
          ({data.totalOvers} overs)
        </Text>
        <div className="mt-2 pt-2 border-t border-white/20">
          <Text size="xs" weight="semibold" color="white">
            Target: {data.target}
          </Text>
        </div>
      </div>
    </div>
  );
}

function BallByBallLog({ timeline }: BallByBallLogProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Scroll to top when new entries arrive (latest ball is at the top)
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = 0;
    }
  }, [timeline.length]);

  if (timeline.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center px-4" style={{}}>
        <Text size="sm" color="muted">No balls bowled yet</Text>
      </div>
    );
  }

  // Render in reverse (most recent at top)
  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-2"
      style={{}}
    >
      <div className="space-y-0.5 py-1">
        {[...timeline].reverse().map((entry, i) => {
          if (entry.kind === 'ball') {
            return <BallRow key={i} entry={entry.data} />;
          }
          if (entry.kind === 'inningsBreak') {
            return <InningsBreakCard key={i} data={entry.data} />;
          }
          if (entry.kind === 'matchResult') {
            return <MatchResultCard key={i} data={entry.data} />;
          }
          if (entry.kind === 'retirement') {
            return <RetirementCard key={i} data={entry.data} />;
          }
          return <OverSummaryCard key={i} data={entry.data} />;
        })}
      </div>
    </div>
  );
}

export { BallByBallLog };
export type { BallEntry, OverSummary, TimelineEntry };
