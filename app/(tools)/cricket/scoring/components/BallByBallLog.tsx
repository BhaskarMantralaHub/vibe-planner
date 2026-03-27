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

type TimelineEntry =
  | { kind: 'ball'; data: BallEntry }
  | { kind: 'overSummary'; data: OverSummary };

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
    return `${entry.bowler} to ${entry.batter}, ${entry.wicketText ?? 'OUT'}`;
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
            {isWicket ? `WICKET! ${entry.batter} ${entry.wicketText}` : tag}
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

interface BallByBallLogProps {
  timeline: TimelineEntry[];
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
      <div className="flex-1 flex items-center justify-center px-4" style={{ maxHeight: 400 }}>
        <Text size="sm" color="muted">No balls bowled yet</Text>
      </div>
    );
  }

  // Render in reverse (most recent at top)
  return (
    <div
      ref={scrollRef}
      className="flex-1 overflow-y-auto px-2"
      style={{ maxHeight: 400 }}
    >
      <div className="space-y-0.5 py-1">
        {[...timeline].reverse().map((entry, i) => {
          if (entry.kind === 'ball') {
            return <BallRow key={i} entry={entry.data} />;
          }
          return <OverSummaryCard key={i} data={entry.data} />;
        })}
      </div>
    </div>
  );
}

export { BallByBallLog };
export type { BallEntry, OverSummary, TimelineEntry };
