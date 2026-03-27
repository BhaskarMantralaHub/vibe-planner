'use client';

import { useRef, useEffect, useMemo } from 'react';
import { Text } from '@/components/ui';
import { cn } from '@/lib/utils';

type BallType = 'dot' | '1' | '2' | '3' | '4' | '6' | 'W' | 'Wd' | 'NB' | 'B' | 'LB';

interface BallResult {
  type: BallType;
  label?: string;
}

interface OverTimelineProps {
  balls: BallResult[];
  previousOverRuns?: number;
}

/* ── Minimal 3-tone palette: gray (runs), theme (boundaries), red (wicket), warm (extras) ── */
const ballColors: Record<BallType, { bg: string; text: string; label: string }> = {
  dot:  { bg: '#9CA3AF', text: 'white',   label: '\u00B7' },   // light gray
  '1':  { bg: '#6B7280', text: 'white',   label: '1' },        // medium gray
  '2':  { bg: '#6B7280', text: 'white',   label: '2' },
  '3':  { bg: '#6B7280', text: 'white',   label: '3' },
  '4':  { bg: '#1A75A8', text: 'white',   label: '4' },        // cricket theme
  '6':  { bg: '#1A75A8', text: 'white',   label: '6' },        // cricket theme (same)
  W:    { bg: '#DC2626', text: 'white',   label: 'W' },        // red — only hot color
  Wd:   { bg: '#D97706', text: 'white',   label: 'Wd' },       // warm amber (all extras)
  NB:   { bg: '#D97706', text: 'white',   label: 'NB' },       // same amber
  B:    { bg: '#D97706', text: 'white',   label: 'B' },        // same amber
  LB:   { bg: '#D97706', text: 'white',   label: 'LB' },       // same amber
};

const BALL_SIZE = 36;

function BallCircle({ ball }: { ball: BallResult }) {
  const c = ballColors[ball.type];
  const label = ball.label ?? c.label;
  const isDot = ball.type === 'dot';
  const isSmallLabel = label.length >= 2;
  return (
    <div
      className="flex-shrink-0 flex items-center justify-center rounded-full"
      style={{ width: BALL_SIZE, height: BALL_SIZE, backgroundColor: c.bg }}
    >
      <span
        className="font-bold tabular-nums leading-none"
        style={{
          color: c.text,
          fontSize: isDot ? 22 : isSmallLabel ? 11 : 14,
        }}
      >
        {label}
      </span>
    </div>
  );
}

function OverTimeline({ balls, previousOverRuns }: OverTimelineProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to the latest ball
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
    }
  }, [balls.length]);

  // Calculate total runs this over
  const overRuns = useMemo(() => {
    return balls.reduce((sum, b) => {
      if (b.type === 'dot' || b.type === 'W') return sum;
      const n = parseInt(b.label ?? ballColors[b.type].label, 10);
      return sum + (isNaN(n) ? 0 : n);
    }, 0);
  }, [balls]);

  const legalBalls = balls.filter(b => !['Wd', 'NB'].includes(b.type)).length;
  const emptySlots = Math.max(0, 6 - legalBalls);

  return (
    <div
      className="mx-4 rounded-xl border border-[var(--border)] px-3 py-2"
      style={{ background: 'var(--surface)' }}
    >
      {/* Header row */}
      <div className="flex items-center justify-between mb-2">
        <Text size="2xs" weight="semibold" color="muted" uppercase tracking="wider">
          This Over
        </Text>
        <Text size="xs" weight="semibold" tabular>
          {overRuns} runs
        </Text>
      </div>

      {/* Ball circles */}
      <div
        ref={scrollRef}
        className="flex items-center gap-2 overflow-x-auto scrollbar-hide"
      >
        {balls.map((ball, i) => (
          <BallCircle key={i} ball={ball} />
        ))}

        {/* Empty slots for remaining balls */}
        {Array.from({ length: emptySlots }).map((_, i) => (
          <div
            key={`empty-${i}`}
            className="flex-shrink-0 rounded-full border-2 border-dashed border-[var(--border)]"
            style={{ width: BALL_SIZE, height: BALL_SIZE }}
          />
        ))}
      </div>
    </div>
  );
}

export { OverTimeline };
export type { OverTimelineProps, BallResult, BallType };
