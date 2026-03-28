'use client';

import { useState, useEffect } from 'react';
import { useScoringStore } from '@/stores/scoring-store';
import { Text, SegmentedControl, Skeleton, Card } from '@/components/ui';
import type { LeaderboardEntry } from '@/types/scoring';
import { MdSportsCricket } from 'react-icons/md';
import { GiTennisBall, GiGloves } from 'react-icons/gi';
import { nameToGradient } from '@/lib/avatar';

const MAX_ROWS = 10;

const CATEGORIES = [
  { key: 'batting', label: 'Batting' },
  { key: 'bowling', label: 'Bowling' },
  { key: 'fielding', label: 'Fielding' },
  { key: 'allround', label: 'All-Round' },
];

/* ── Rank badge ── */
function RankBadge({ rank }: { rank: number }) {
  const s = rank === 1 ? { bg: 'linear-gradient(135deg, #FFD700, #FFA500)', text: '#7C5300' }
    : rank === 2 ? { bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', text: '#3A3A3A' }
    : rank === 3 ? { bg: 'linear-gradient(135deg, #CD7F32, #A0522D)', text: '#fff' }
    : { bg: 'var(--surface)', text: 'var(--muted)' };
  return (
    <div className="flex-shrink-0 w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold"
      style={{ background: s.bg, color: s.text, border: rank > 3 ? '1px solid var(--border)' : 'none' }}>
      {rank}
    </div>
  );
}

/* ── Player cell with avatar ── */
function PlayerCell({ entry }: { entry: LeaderboardEntry }) {
  const [g1, g2] = nameToGradient(entry.name);
  return (
    <div className="flex items-center gap-2 min-w-0">
      {entry.photo_url ? (
        <img src={entry.photo_url} alt={entry.name}
          className="flex-shrink-0 h-7 w-7 rounded-full object-cover ring-1 ring-[var(--border)]" />
      ) : (
        <div className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
          {entry.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
      )}
      <Text size="xs" weight="medium" truncate>
        {entry.name}
        {entry.is_guest && <Text as="span" size="2xs" color="dim" weight="normal"> (G)</Text>}
      </Text>
    </div>
  );
}

/* ── Table header cell ── */
function TH({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return <Text as="span" size="2xs" weight="semibold" color="dim" uppercase className={`${className} tracking-wider`}>{children}</Text>;
}

/* ── Stat cell ── */
function Stat({ value, bold }: { value: string | number; bold?: boolean }) {
  return <Text size="xs" weight={bold ? 'bold' : 'normal'} tabular className="text-right">{value}</Text>;
}

/* ── Loading skeleton ── */
function TableSkeleton() {
  return (
    <div className="px-3 py-2 space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-1">
          <Skeleton className="h-5 w-5 rounded-full" />
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-3 w-24 rounded" />
          <div className="flex-1" />
          <Skeleton className="h-3 w-8 rounded" />
          <Skeleton className="h-3 w-8 rounded" />
          <Skeleton className="h-3 w-8 rounded" />
        </div>
      ))}
    </div>
  );
}

/* ── Format overs from legal ball count ── */
function formatOvers(balls: number): string {
  return `${Math.floor(balls / 6)}.${balls % 6}`;
}

/* ── Category icon ── */
function CategoryIcon({ category }: { category: string }) {
  if (category === 'batting') return <MdSportsCricket size={16} style={{ color: 'var(--cricket)' }} />;
  if (category === 'bowling') return <GiTennisBall size={14} style={{ color: '#3B82F6' }} />;
  if (category === 'fielding') return <GiGloves size={14} style={{ color: '#16A34A' }} />;
  return <MdSportsCricket size={16} style={{ color: 'var(--cricket-accent)' }} />;
}

/* ── Category-specific table ── */
function StatsTable({ category, entries, loading }: { category: string; entries: LeaderboardEntry[]; loading: boolean }) {
  if (loading) return <TableSkeleton />;
  if (entries.length === 0) return (
    <div className="px-3 py-8 text-center">
      <Text size="xs" color="muted">No {category} stats yet</Text>
      <Text as="p" size="2xs" color="dim" className="mt-1">Complete a match to see stats</Text>
    </div>
  );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[340px]">
        <thead>
          <tr className="border-b border-[var(--border)]/30">
            <th className="px-2 py-2 text-left w-8"><TH>#</TH></th>
            <th className="px-1 py-2 text-left"><TH>Player</TH></th>
            <th className="px-1.5 py-2 text-right"><TH>M</TH></th>
            {category === 'batting' && <>
              <th className="px-1.5 py-2 text-right"><TH>R</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>B</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>SR</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>4s</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>6s</TH></th>
            </>}
            {category === 'bowling' && <>
              <th className="px-1.5 py-2 text-right"><TH>W</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>O</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>Econ</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>Wd</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>Nb</TH></th>
            </>}
            {category === 'fielding' && <>
              <th className="px-1.5 py-2 text-right"><TH>Ct</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>RO</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>St</TH></th>
            </>}
            {category === 'allround' && <>
              <th className="px-1.5 py-2 text-right"><TH>Runs</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>Wkts</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>Ct</TH></th>
              <th className="px-1.5 py-2 text-right"><TH>Pts</TH></th>
            </>}
          </tr>
        </thead>
        <tbody>
          {entries.slice(0, MAX_ROWS).map((e, i) => (
            <tr key={e.player_id} className="border-b border-[var(--border)]/20 hover:bg-[var(--hover-bg)] transition-colors">
              <td className="px-2 py-1.5"><RankBadge rank={i + 1} /></td>
              <td className="px-1 py-1.5"><PlayerCell entry={e} /></td>
              <td className="px-1.5 py-1.5"><Stat value={e.matches ?? 0} /></td>
              {category === 'batting' && <>
                <td className="px-1.5 py-1.5"><Stat value={e.total_runs ?? 0} bold /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.balls_faced ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.strike_rate?.toFixed(1) ?? '0'} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.fours ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.sixes ?? 0} /></td>
              </>}
              {category === 'bowling' && <>
                <td className="px-1.5 py-1.5"><Stat value={e.total_wickets ?? 0} bold /></td>
                <td className="px-1.5 py-1.5"><Stat value={formatOvers(e.legal_balls ?? 0)} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.economy?.toFixed(2) ?? '0'} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.wides ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.no_balls ?? 0} /></td>
              </>}
              {category === 'fielding' && <>
                <td className="px-1.5 py-1.5"><Stat value={e.total_catches ?? 0} bold /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.total_runouts ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.total_stumpings ?? 0} /></td>
              </>}
              {category === 'allround' && <>
                <td className="px-1.5 py-1.5"><Stat value={e.total_runs ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.total_wickets ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.total_catches ?? 0} /></td>
                <td className="px-1.5 py-1.5"><Stat value={e.score ?? 0} bold /></td>
              </>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ══════════════════════════════════════════════ */
/* ── Main Component                           ── */
/* ══════════════════════════════════════════════ */
export default function PracticeLeaderboard() {
  const { leaderboard, leaderboardLoading, fetchLeaderboard } = useScoringStore();
  const [category, setCategory] = useState('batting');

  useEffect(() => {
    if (!leaderboard[category]) {
      fetchLeaderboard(category);
    }
  }, [category, leaderboard, fetchLeaderboard]);

  const entries = leaderboard[category] ?? [];
  const isLoading = leaderboardLoading && !leaderboard[category];

  return (
    <div>
      {/* Category tabs */}
      <SegmentedControl
        options={CATEGORIES}
        active={category}
        onChange={setCategory}
        className="mb-3"
      />

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        <StatsTable category={category} entries={entries} loading={isLoading} />
      </Card>
    </div>
  );
}
