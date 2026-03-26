'use client';

import { Button, Text } from '@/components/ui';

interface BatsmanStats {
  name: string;
  runs: number;
  balls: number;
  fours: number;
  sixes: number;
  strikeRate: string;
  howOut: string;
}

interface BowlerStats {
  name: string;
  overs: string;
  maidens: number;
  runs: number;
  wickets: number;
  economy: string;
}

interface PostMatchSummaryProps {
  result: string; // e.g. "SUN won by 24 runs"
  mvpName: string;
  mvpStats: string; // e.g. "54(32) & 2/18"
  battingScorecard: BatsmanStats[];
  bowlingScorecard: BowlerStats[];
  teamScore: string; // e.g. "156/4 (20 ov)"
  opponentScore: string; // e.g. "132/8 (20 ov)"
  onShareScorecard: () => void;
  onPostToMoments: () => void;
  onDone: () => void;
}

function PostMatchSummary({
  result,
  mvpName,
  mvpStats,
  battingScorecard,
  bowlingScorecard,
  teamScore,
  opponentScore,
  onShareScorecard,
  onPostToMoments,
  onDone,
}: PostMatchSummaryProps) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col overflow-y-auto"
      style={{ background: 'var(--bg)' }}
    >
      {/* Header */}
      <div
        className="px-4 py-6 text-center"
        style={{
          background: 'linear-gradient(135deg, var(--cricket-deep, #1B3A6B), var(--cricket))',
        }}
      >
        <Text as="h1" size="xl" weight="bold" color="white" tracking="tight">
          Match Complete
        </Text>
        <Text as="p" size="lg" weight="semibold" color="white" className="opacity-90 mt-2">
          {result}
        </Text>
        <div className="flex justify-center gap-6 mt-3">
          <Text size="sm" color="white" className="opacity-60" tabular>{teamScore}</Text>
          <Text size="sm" color="white" className="opacity-40">vs</Text>
          <Text size="sm" color="white" className="opacity-60" tabular>{opponentScore}</Text>
        </div>
      </div>

      {/* MVP */}
      <div className="mx-4 mt-4 px-4 py-3 rounded-xl border border-[var(--cricket)]/30 bg-[var(--cricket)]/5 text-center">
        <Text size="xs" color="muted" uppercase tracking="wider" weight="medium">
          Player of the Match
        </Text>
        <Text as="p" size="lg" weight="bold" className="mt-1">
          {mvpName}
        </Text>
        <Text as="p" size="sm" color="muted" tabular>
          {mvpStats}
        </Text>
      </div>

      {/* Batting Scorecard */}
      <div className="mx-4 mt-4">
        <Text as="h2" size="md" weight="semibold" className="mb-2">Batting</Text>
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="grid grid-cols-7 gap-0 px-3 py-2 bg-[var(--surface)]">
            <Text size="2xs" color="muted" weight="medium" className="col-span-2">Batter</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">R</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">B</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">4s</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">6s</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">SR</Text>
          </div>
          {battingScorecard.map((b, i) => (
            <div key={i} className="grid grid-cols-7 gap-0 px-3 py-2 border-t border-[var(--border)]">
              <div className="col-span-2">
                <Text size="sm" weight="medium" truncate>{b.name}</Text>
                <Text as="p" size="2xs" color="dim" truncate>{b.howOut}</Text>
              </div>
              <Text size="sm" tabular align="center" weight="semibold">{b.runs}</Text>
              <Text size="sm" tabular align="center" color="muted">{b.balls}</Text>
              <Text size="sm" tabular align="center">{b.fours}</Text>
              <Text size="sm" tabular align="center">{b.sixes}</Text>
              <Text size="sm" tabular align="center" color="muted">{b.strikeRate}</Text>
            </div>
          ))}
        </div>
      </div>

      {/* Bowling Scorecard */}
      <div className="mx-4 mt-4">
        <Text as="h2" size="md" weight="semibold" className="mb-2">Bowling</Text>
        <div className="rounded-xl border border-[var(--border)] overflow-hidden">
          <div className="grid grid-cols-7 gap-0 px-3 py-2 bg-[var(--surface)]">
            <Text size="2xs" color="muted" weight="medium" className="col-span-2">Bowler</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">O</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">M</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">R</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">W</Text>
            <Text size="2xs" color="muted" weight="medium" align="center">Econ</Text>
          </div>
          {bowlingScorecard.map((b, i) => (
            <div key={i} className="grid grid-cols-7 gap-0 px-3 py-2 border-t border-[var(--border)]">
              <Text size="sm" weight="medium" truncate className="col-span-2">{b.name}</Text>
              <Text size="sm" tabular align="center">{b.overs}</Text>
              <Text size="sm" tabular align="center">{b.maidens}</Text>
              <Text size="sm" tabular align="center">{b.runs}</Text>
              <Text size="sm" tabular align="center" weight="semibold">{b.wickets}</Text>
              <Text size="sm" tabular align="center" color="muted">{b.economy}</Text>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div className="flex flex-col gap-2.5 px-4 py-6 mt-auto">
        <Button brand="cricket" fullWidth onClick={onShareScorecard}>
          Share Scorecard
        </Button>
        <Button brand="cricket" variant="secondary" fullWidth onClick={onPostToMoments}>
          Post to Moments
        </Button>
        <Button variant="ghost" fullWidth onClick={onDone}>
          Done
        </Button>
      </div>
    </div>
  );
}

export { PostMatchSummary };
export type { PostMatchSummaryProps, BatsmanStats, BowlerStats };
