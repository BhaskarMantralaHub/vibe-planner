'use client';

import { useState, useEffect, useRef } from 'react';
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

/* ── Player cell with avatar — first name + last name stacked if needed ── */
function PlayerCell({ entry }: { entry: LeaderboardEntry }) {
  const [g1, g2] = nameToGradient(entry.name);
  const parts = entry.name.split(' ');
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

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
      <div className="min-w-0">
        <Text as="p" size="xs" weight="bold" truncate>
          {firstName}{entry.is_guest && <Text as="span" size="2xs" color="dim" weight="normal"> (G)</Text>}
        </Text>
        {lastName && (
          <Text as="p" size="2xs" color="muted" weight="normal" truncate>{lastName}</Text>
        )}
      </div>
    </div>
  );
}

/* ── Shared column class for stat cells — fixed width, right-aligned ── */
const SC = 'w-9 text-right';      // stat column (narrow: M, R, B, 4s, 6s, W, O, Wd, Nb, Ct, RO, St)
const SCW = 'w-11 text-right';    // wide stat column (SR, Econ, Runs, Wkts, Pts, Dis)

/* ── Table header cell ── */
function TH({ children }: { children: React.ReactNode }) {
  return <Text as="p" size="2xs" weight="semibold" color="dim" uppercase tracking="wider">{children}</Text>;
}

/* ── Stat cell ── */
function Stat({ value, bold }: { value: string | number; bold?: boolean }) {
  return <Text as="p" size="xs" weight={bold ? 'bold' : 'normal'} tabular>{value}</Text>;
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

/* ── Column legends per category ── */
const LEGENDS: Record<string, [string, string][]> = {
  batting:  [['M','Matches'],['R','Runs'],['B','Balls Faced'],['SR','Strike Rate'],['4s','Fours'],['6s','Sixes']],
  bowling:  [['M','Matches'],['W','Wickets'],['O','Overs'],['Econ','Economy Rate'],['Wd','Wides'],['Nb','No Balls']],
  fielding: [['M','Matches'],['Dis','Dismissals'],['Ct','Catches'],['RO','Run Outs'],['St','Stumpings']],
  allround: [['M','Matches'],['Runs','Runs Scored'],['Wkts','Wickets Taken'],['Ct','Catches'],['Pts','Points (R + W x 25 + Ct x 10)']],
};

/* ── Legend footer ── */
function Legend({ category }: { category: string }) {
  const items = LEGENDS[category] ?? [];
  return (
    <div className="px-3 py-2.5 border-t border-[var(--border)]/20 flex flex-wrap gap-x-3 gap-y-1">
      {items.map(([abbr, full]) => (
        <Text key={abbr} as="span" size="2xs" color="dim">
          <Text as="span" size="2xs" weight="semibold" color="muted">{abbr}</Text> = {full}
        </Text>
      ))}
    </div>
  );
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
    <>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-[var(--border)]/40" style={{ background: 'color-mix(in srgb, var(--surface) 80%, var(--border))' }}>
              <th className="pl-2 pr-1 py-2 text-left w-7"><TH>#</TH></th>
              <th className="px-1 py-2 text-left"><TH>Player</TH></th>
              <th className={`py-2 ${SC}`}><TH>M</TH></th>
              {category === 'batting' && <>
                <th className={`py-2 ${SC}`}><TH>R</TH></th>
                <th className={`py-2 ${SC}`}><TH>B</TH></th>
                <th className={`py-2 ${SCW}`}><TH>SR</TH></th>
                <th className={`py-2 ${SC}`}><TH>4s</TH></th>
                <th className={`py-2 pr-2 ${SC}`}><TH>6s</TH></th>
              </>}
              {category === 'bowling' && <>
                <th className={`py-2 ${SC}`}><TH>W</TH></th>
                <th className={`py-2 ${SC}`}><TH>O</TH></th>
                <th className={`py-2 ${SCW}`}><TH>Econ</TH></th>
                <th className={`py-2 ${SC}`}><TH>Wd</TH></th>
                <th className={`py-2 pr-2 ${SC}`}><TH>Nb</TH></th>
              </>}
              {category === 'fielding' && <>
                <th className={`py-2 ${SC}`}><TH>Dis</TH></th>
                <th className={`py-2 ${SC}`}><TH>Ct</TH></th>
                <th className={`py-2 ${SC}`}><TH>RO</TH></th>
                <th className={`py-2 pr-2 ${SC}`}><TH>St</TH></th>
              </>}
              {category === 'allround' && <>
                <th className={`py-2 ${SCW}`}><TH>Runs</TH></th>
                <th className={`py-2 ${SCW}`}><TH>Wkts</TH></th>
                <th className={`py-2 ${SC}`}><TH>Ct</TH></th>
                <th className={`py-2 pr-2 ${SC}`}><TH>Pts</TH></th>
              </>}
            </tr>
          </thead>
          <tbody>
            {entries.slice(0, MAX_ROWS).map((e, i) => (
              <tr key={e.player_id} className={`border-b border-[var(--border)]/15 hover:bg-[var(--hover-bg)] transition-colors ${i % 2 === 1 ? 'bg-[var(--surface)]/40' : ''}`}>
                <td className="pl-2 pr-1 py-1.5"><RankBadge rank={i + 1} /></td>
                <td className="px-1 py-1.5"><PlayerCell entry={e} /></td>
                <td className={`py-1.5 ${SC}`}><Stat value={e.matches ?? 0} /></td>
                {category === 'batting' && <>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.total_runs ?? 0} bold /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.balls_faced ?? 0} /></td>
                  <td className={`py-1.5 ${SCW}`}><Stat value={e.strike_rate?.toFixed(1) ?? '0'} /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.fours ?? 0} /></td>
                  <td className={`py-1.5 pr-2 ${SC}`}><Stat value={e.sixes ?? 0} /></td>
                </>}
                {category === 'bowling' && <>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.total_wickets ?? 0} bold /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={formatOvers(e.legal_balls ?? 0)} /></td>
                  <td className={`py-1.5 ${SCW}`}><Stat value={e.economy?.toFixed(2) ?? '0'} /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.wides ?? 0} /></td>
                  <td className={`py-1.5 pr-2 ${SC}`}><Stat value={e.no_balls ?? 0} /></td>
                </>}
                {category === 'fielding' && <>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.total_dismissals ?? ((e.total_catches ?? 0) + (e.total_runouts ?? 0) + (e.total_stumpings ?? 0))} bold /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.total_catches ?? 0} /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.total_runouts ?? 0} /></td>
                  <td className={`py-1.5 pr-2 ${SC}`}><Stat value={e.total_stumpings ?? 0} /></td>
                </>}
                {category === 'allround' && <>
                  <td className={`py-1.5 ${SCW}`}><Stat value={e.total_runs ?? 0} /></td>
                  <td className={`py-1.5 ${SCW}`}><Stat value={e.total_wickets ?? 0} /></td>
                  <td className={`py-1.5 ${SC}`}><Stat value={e.total_catches ?? 0} /></td>
                  <td className={`py-1.5 pr-2 ${SC}`}><Stat value={e.score ?? 0} bold /></td>
                </>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Legend category={category} />
    </>
  );
}

/* ══════════════════════════════════════════════ */
/* ── Main Component                           ── */
/* ══════════════════════════════════════════════ */
const MATCH_FILTERS = [
  { key: 'all', label: 'All' },
  { key: '5', label: 'Last 5' },
  { key: '10', label: 'Last 10' },
  { key: '20', label: 'Last 20' },
];

export default function PracticeLeaderboard() {
  const { leaderboard, leaderboardLoading, fetchLeaderboard, leaderboardMatchLimit, setLeaderboardMatchLimit } = useScoringStore();
  const [category, setCategory] = useState('batting');
  const matchFilter = leaderboardMatchLimit === null ? 'all' : String(leaderboardMatchLimit);

  // Always fetch on mount (fresh data), then use cache for tab switches
  const mountedRef = useRef(false);
  useEffect(() => {
    if (!mountedRef.current) {
      mountedRef.current = true;
      fetchLeaderboard(category);
    } else if (!leaderboard[category]) {
      fetchLeaderboard(category);
    }
  }, [category, leaderboard, fetchLeaderboard]);

  const handleFilterChange = (key: string) => {
    const limit = key === 'all' ? null : parseInt(key, 10);
    setLeaderboardMatchLimit(limit);
  };

  // Re-fetch when match limit changes
  useEffect(() => {
    if (mountedRef.current) {
      fetchLeaderboard(category);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leaderboardMatchLimit]);

  const entries = leaderboard[category] ?? [];
  const isLoading = leaderboardLoading && !leaderboard[category];

  return (
    <div>
      {/* Category tabs */}
      <SegmentedControl
        options={CATEGORIES}
        active={category}
        onChange={setCategory}
        className="mb-2"
      />

      {/* Match filter */}
      <SegmentedControl
        options={MATCH_FILTERS}
        active={matchFilter}
        onChange={handleFilterChange}
        className="mb-3"
      />

      {/* Table */}
      <Card padding="none" className="overflow-hidden">
        <StatsTable category={category} entries={entries} loading={isLoading} />
      </Card>
    </div>
  );
}
