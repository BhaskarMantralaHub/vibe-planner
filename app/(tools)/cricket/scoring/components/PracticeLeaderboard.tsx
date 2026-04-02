'use client';

import { useState, useEffect, useRef } from 'react';
import { useScoringStore } from '@/stores/scoring-store';
import { useCricketStore } from '@/stores/cricket-store';
import { useAuthStore } from '@/stores/auth-store';
import { isCloudMode } from '@/lib/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'motion/react';
import { Text, SegmentedControl, Skeleton, Card, RefreshButton, EmptyState, Drawer, DrawerHandle, DrawerTitle, DrawerBody } from '@/components/ui';
import type { LeaderboardEntry } from '@/types/scoring';
import { Target, Hand, Trophy } from 'lucide-react';
import { nameToGradient } from '@/lib/avatar';
import { useRouter } from 'next/navigation';
import PodiumHero from './PodiumHero';

const CricketBatIcon = ({ size = 28, color = '#FFD700', className }: { size?: number; color?: string; className?: string }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill={color} className={className}>
    <path d="M21.7 2.3a1 1 0 0 0-1.4 0l-2.6 2.6-1.3-1.3a1 1 0 1 0-1.4 1.4l1.3 1.3-9.9 9.9a2 2 0 0 0 0 2.8l.7.7a2 2 0 0 0 2.8 0l9.9-9.9 1.3 1.3a1 1 0 0 0 1.4-1.4l-1.3-1.3 2.6-2.6a1 1 0 0 0 0-1.4z"/>
  </svg>
);

const MAX_ROWS = 10;

const CATEGORIES = [
  { key: 'batting', label: 'Batting' },
  { key: 'bowling', label: 'Bowling' },
  { key: 'fielding', label: 'Fielding' },
  { key: 'allround', label: 'All-Round' },
];

/* ── Rank badge — larger for top 3, with shimmer ── */
function RankBadge({ rank }: { rank: number }) {
  if (rank <= 3) {
    const s = rank === 1
      ? { bg: 'linear-gradient(105deg, #FFD700 0%, #FFF9C4 40%, #FFA500 60%, #FFD700 100%)', text: '#7C5300', ring: 'rgba(255,215,0,0.4)' }
      : rank === 2
        ? { bg: 'linear-gradient(135deg, #C0C0C0, #A0A0A0)', text: '#1A1A1A', ring: 'rgba(192,192,192,0.4)' }
        : { bg: 'linear-gradient(135deg, #CD7F32, #A0522D)', text: '#fff', ring: 'rgba(205,127,50,0.35)' };
    return (
      <div
        className="animate-badge-shine flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-extrabold"
        style={{ background: s.bg, color: s.text, boxShadow: `0 0 0 2px ${s.ring}` }}
        aria-label={`Rank ${rank}`}
      >
        {rank}
      </div>
    );
  }
  return (
    <div className="flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-semibold"
      style={{ color: 'var(--dim)' }} aria-label={`Rank ${rank}`}>
      {rank}
    </div>
  );
}

/* ── Player cell with avatar ── */
function PlayerCell({ entry }: { entry: LeaderboardEntry }) {
  const [g1, g2] = nameToGradient(entry.name);
  const parts = entry.name.split(' ');
  const firstName = parts[0];
  const lastName = parts.length > 1 ? parts.slice(1).join(' ') : null;

  return (
    <div className="flex items-center gap-2.5 min-w-0">
      {entry.photo_url ? (
        <img src={entry.photo_url} alt={`${entry.name} avatar`}
          className="flex-shrink-0 h-9 w-9 rounded-full object-cover ring-2 ring-[var(--border)]/50" />
      ) : (
        <div
          role="img"
          aria-label={`${entry.name} avatar`}
          className="flex-shrink-0 h-9 w-9 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
          style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}
        >
          <span aria-hidden="true">
            {entry.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
          </span>
        </div>
      )}
      <div className="min-w-0">
        <Text as="p" size="sm" weight="bold" truncate>
          {firstName}{entry.is_guest && <Text as="span" size="2xs" color="dim" weight="normal"> (G)</Text>}
        </Text>
        {lastName && (
          <Text as="p" size="2xs" color="muted" weight="normal" truncate>{lastName}</Text>
        )}
      </div>
    </div>
  );
}

/* ── Column widths ── */
const SC = 'w-9 text-right';
const SCW = 'w-11 text-right';

/* ── Table header cell with abbr for screen readers ── */
function TH({ children, title }: { children: React.ReactNode; title?: string }) {
  return (
    <Text as="p" size="xs" weight="semibold" color="muted" uppercase tracking="wider" tabular>
      {title ? <abbr title={title} style={{ textDecoration: 'none' }}>{children}</abbr> : children}
    </Text>
  );
}

/* ── Stat cell — primary stats get accent color for top 3 ── */
function Stat({ value, bold, rank }: { value: string | number; bold?: boolean; rank?: number }) {
  if (bold && rank !== undefined && rank <= 3) {
    return (
      <span className="inline-block px-1.5 py-0.5 rounded text-[12px] font-bold tabular-nums"
        style={{ background: 'color-mix(in srgb, var(--cricket) 15%, transparent)', color: 'var(--cricket)', border: '1px solid color-mix(in srgb, var(--cricket) 30%, transparent)' }}>
        {value}
      </span>
    );
  }
  if (bold) {
    return <Text as="p" size="sm" weight="bold" color="cricket" tabular>{value}</Text>;
  }
  return <Text as="p" size="xs" weight="normal" color="muted" tabular>{value}</Text>;
}

/* ── Loading skeleton mirroring table structure ── */
function TableSkeleton() {
  return (
    <div className="px-3 py-2 space-y-1">
      {/* Header skeleton */}
      <div className="flex items-center gap-2 py-2.5 px-1" style={{ background: 'var(--table-header-bg)', borderRadius: 8 }}>
        <Skeleton className="h-3 w-5 rounded" />
        <Skeleton className="h-3 w-16 rounded" />
        <div className="flex-1" />
        <Skeleton className="h-3 w-6 rounded" />
        <Skeleton className="h-3 w-6 rounded" />
        <Skeleton className="h-3 w-6 rounded" />
        <Skeleton className="h-3 w-8 rounded" />
      </div>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-2 py-2.5 px-1">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-8 w-8 rounded-full" />
          <Skeleton className="h-3.5 w-24 rounded" />
          <div className="flex-1" />
          <Skeleton className="h-3 w-6 rounded" />
          <Skeleton className="h-3 w-6 rounded" />
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

/* ── Column legends per category ── */
const LEGENDS: Record<string, [string, string][]> = {
  batting:  [['M','Matches'],['R','Runs'],['B','Balls Faced'],['SR','Strike Rate'],['4s','Fours'],['6s','Sixes']],
  bowling:  [['M','Matches'],['W','Wickets'],['O','Overs'],['Econ','Economy Rate'],['Wd','Wides'],['Nb','No Balls']],
  fielding: [['M','Matches'],['Dis','Dismissals'],['Ct','Catches'],['RO','Run Outs'],['St','Stumpings']],
  allround: [['M','Matches'],['Runs','Runs Scored'],['Wkts','Wickets Taken'],['Ct','Catches'],['Pts','Points (R + W×25 + Ct×10)']],
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

/* ── Category-specific table (starts at rank 4 when podium is shown) ── */
function StatsTable({ category, entries, loading, myPlayerId, onPlayerTap, startRank }: {
  category: string;
  entries: LeaderboardEntry[];
  loading: boolean;
  myPlayerId: string | null;
  onPlayerTap: (entry: LeaderboardEntry, rank: number) => void;
  startRank: number;
}) {
  if (loading) return <TableSkeleton />;
  if (entries.length === 0) return null; // handled by parent

  return (
    <>
      <div className="overflow-x-auto" style={{ WebkitOverflowScrolling: 'touch' }}>
        <table className="w-full" role="table">
          <thead>
            <tr style={{ background: 'var(--table-header-bg)', borderBottom: '2px solid color-mix(in srgb, var(--cricket) 20%, var(--border))' }}>
              <th scope="col" className="pl-3 pr-1 py-3 text-left w-9"><TH title="Rank">#</TH></th>
              <th scope="col" className="px-1 py-3 text-left min-w-[120px]"><TH>Player</TH></th>
              <th scope="col" className={`py-3 ${SC} hidden sm:table-cell`}><TH title="Matches">M</TH></th>
              {category === 'batting' && <>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Runs">R</TH></th>
                <th scope="col" className={`py-3 ${SC} hidden sm:table-cell`}><TH title="Balls Faced">B</TH></th>
                <th scope="col" className={`py-3 ${SCW}`}><TH title="Strike Rate">SR</TH></th>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Fours">4s</TH></th>
                <th scope="col" className={`py-3 pr-3 ${SC}`}><TH title="Sixes">6s</TH></th>
              </>}
              {category === 'bowling' && <>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Wickets">W</TH></th>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Overs">O</TH></th>
                <th scope="col" className={`py-3 ${SCW}`}><TH title="Economy Rate">Econ</TH></th>
                <th scope="col" className={`py-3 ${SC} hidden sm:table-cell`}><TH title="Wides">Wd</TH></th>
                <th scope="col" className={`py-3 pr-3 ${SC} hidden sm:table-cell`}><TH title="No Balls">Nb</TH></th>
              </>}
              {category === 'fielding' && <>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Dismissals">Dis</TH></th>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Catches">Ct</TH></th>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Run Outs">RO</TH></th>
                <th scope="col" className={`py-3 pr-3 ${SC}`}><TH title="Stumpings">St</TH></th>
              </>}
              {category === 'allround' && <>
                <th scope="col" className={`py-3 ${SCW}`}><TH title="Runs Scored">Runs</TH></th>
                <th scope="col" className={`py-3 ${SCW}`}><TH title="Wickets Taken">Wkts</TH></th>
                <th scope="col" className={`py-3 ${SC}`}><TH title="Catches">Ct</TH></th>
                <th scope="col" className={`py-3 pr-3 ${SC}`}><TH title="Points (R + W×25 + Ct×10)">Pts</TH></th>
              </>}
            </tr>
          </thead>
          <tbody>
              {entries.slice(0, MAX_ROWS).map((e, i) => {
                const rank = startRank + i;
                const isMe = myPlayerId === e.player_id;
                return (
                  <motion.tr
                    key={e.player_id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: i * 0.04, ease: 'easeOut' }}
                    className={cn(
                      'transition-colors cursor-pointer active:opacity-80',
                      isMe ? 'border-l-3 border-l-[var(--cricket)]' : '',
                    )}
                    style={{
                      background: isMe
                        ? 'var(--highlight-bg)'
                        : i % 2 === 0
                          ? 'var(--card)'
                          : 'var(--row-alt)',
                      borderBottom: '1px solid color-mix(in srgb, var(--border) 25%, transparent)',
                    }}
                    onClick={() => onPlayerTap(e, rank)}
                  >
                    <td className="pl-3 pr-1 py-2.5"><RankBadge rank={rank} /></td>
                    <td className="px-1 py-2.5"><PlayerCell entry={e} /></td>
                    <td className={`py-2.5 ${SC} hidden sm:table-cell`}><Stat value={e.matches ?? 0} /></td>
                    {category === 'batting' && <>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.total_runs ?? 0} bold rank={rank} /></td>
                      <td className={`py-2.5 ${SC} hidden sm:table-cell`}><Stat value={e.balls_faced ?? 0} /></td>
                      <td className={`py-2.5 ${SCW}`}><Stat value={e.strike_rate?.toFixed(1) ?? '0'} /></td>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.fours ?? 0} /></td>
                      <td className={`py-2.5 pr-3 ${SC}`}><Stat value={e.sixes ?? 0} /></td>
                    </>}
                    {category === 'bowling' && <>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.total_wickets ?? 0} bold rank={rank} /></td>
                      <td className={`py-2.5 ${SC}`}><Stat value={formatOvers(e.legal_balls ?? 0)} /></td>
                      <td className={`py-2.5 ${SCW}`}><Stat value={e.economy?.toFixed(2) ?? '0'} /></td>
                      <td className={`py-2.5 ${SC} hidden sm:table-cell`}><Stat value={e.wides ?? 0} /></td>
                      <td className={`py-2.5 pr-3 ${SC} hidden sm:table-cell`}><Stat value={e.no_balls ?? 0} /></td>
                    </>}
                    {category === 'fielding' && <>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.total_dismissals ?? ((e.total_catches ?? 0) + (e.total_runouts ?? 0) + (e.total_stumpings ?? 0))} bold rank={rank} /></td>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.total_catches ?? 0} /></td>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.total_runouts ?? 0} /></td>
                      <td className={`py-2.5 pr-3 ${SC}`}><Stat value={e.total_stumpings ?? 0} /></td>
                    </>}
                    {category === 'allround' && <>
                      <td className={`py-2.5 ${SCW}`}><Stat value={e.total_runs ?? 0} /></td>
                      <td className={`py-2.5 ${SCW}`}><Stat value={e.total_wickets ?? 0} /></td>
                      <td className={`py-2.5 ${SC}`}><Stat value={e.total_catches ?? 0} /></td>
                      <td className={`py-2.5 pr-3 ${SC}`}><Stat value={e.score ?? 0} bold rank={rank} /></td>
                    </>}
                  </motion.tr>
                );
              })}
          </tbody>
        </table>
      </div>
      <Legend category={category} />
    </>
  );
}

/* ── Player Detail Drawer ── */
function PlayerDrawer({ entry, open, onOpenChange, category }: {
  entry: LeaderboardEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: string;
}) {
  if (!entry) return null;
  const [g1, g2] = nameToGradient(entry.name);

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerHandle />
      <DrawerTitle>{entry.name} Stats</DrawerTitle>
      <DrawerBody>
        {/* Header — avatar + name */}
        <div className="flex items-center gap-4 mb-4">
          {entry.photo_url ? (
            <img src={entry.photo_url} alt={entry.name}
              className="h-16 w-16 rounded-full object-cover ring-2 ring-[var(--cricket)]/50" />
          ) : (
            <div className="h-16 w-16 rounded-full flex items-center justify-center text-xl font-bold text-white"
              style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
              {entry.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <Text as="h3" size="lg" weight="bold">{entry.name}</Text>
            {entry.is_guest && <Text as="p" size="2xs" color="dim">Guest Player</Text>}
            {entry.matches !== undefined && (
              <Text as="p" size="xs" color="muted">{entry.matches} matches played</Text>
            )}
          </div>
        </div>

        {/* Divider */}
        <div className="h-px w-full" style={{ background: 'var(--border)' }} />

        {/* Stats rows by category */}
        <div className="space-y-3 mt-4">
          {/* Batting */}
          {(entry.total_runs !== undefined || category === 'batting' || category === 'allround') && (
            <div>
              <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider" className="mb-1.5">
                <CricketBatIcon size={16} color="var(--cricket)" className="inline mr-1" />
                Batting
              </Text>
              <div className="flex gap-4 flex-wrap">
                <StatPill label="Runs" value={entry.total_runs ?? 0} highlight={category === 'batting'} />
                <StatPill label="SR" value={entry.strike_rate?.toFixed(1) ?? '—'} />
                <StatPill label="4s" value={entry.fours ?? 0} />
                <StatPill label="6s" value={entry.sixes ?? 0} />
              </div>
            </div>
          )}

          {/* Bowling */}
          {(entry.total_wickets !== undefined || category === 'bowling' || category === 'allround') && (
            <div>
              <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider" className="mb-1.5">
                <Target className="inline mr-1" size={14} color="#3B82F6" />
                Bowling
              </Text>
              <div className="flex gap-4 flex-wrap">
                <StatPill label="Wkts" value={entry.total_wickets ?? 0} highlight={category === 'bowling'} />
                <StatPill label="Econ" value={entry.economy?.toFixed(2) ?? '—'} />
                <StatPill label="Overs" value={entry.legal_balls !== undefined ? formatOvers(entry.legal_balls) : '—'} />
              </div>
            </div>
          )}

          {/* Fielding */}
          {(entry.total_catches !== undefined || category === 'fielding' || category === 'allround') && (
            <div>
              <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider" className="mb-1.5">
                <Hand className="inline mr-1" size={14} color="#16A34A" />
                Fielding
              </Text>
              <div className="flex gap-4 flex-wrap">
                <StatPill label="Dis" value={entry.total_dismissals ?? ((entry.total_catches ?? 0) + (entry.total_runouts ?? 0) + (entry.total_stumpings ?? 0))} highlight={category === 'fielding'} />
                <StatPill label="Ct" value={entry.total_catches ?? 0} />
                <StatPill label="RO" value={entry.total_runouts ?? 0} />
                <StatPill label="St" value={entry.total_stumpings ?? 0} />
              </div>
            </div>
          )}

          {/* All-round score */}
          {entry.score !== undefined && (
            <div>
              <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider" className="mb-1.5">All-Round Score</Text>
              <Text as="p" size="xl" weight="bold" color="cricket" tabular>{entry.score}</Text>
              <Text as="p" size="2xs" color="dim">R + W×25 + Ct×10</Text>
            </div>
          )}
        </div>
      </DrawerBody>
    </Drawer>
  );
}

function StatPill({ label, value, highlight }: { label: string; value: string | number; highlight?: boolean }) {
  return (
    <div className="flex flex-col items-center min-w-[48px]">
      <Text
        as="p"
        size={highlight ? 'lg' : 'md'}
        weight={highlight ? 'bold' : 'semibold'}
        color={highlight ? 'cricket' : 'default'}
        tabular
      >
        {value}
      </Text>
      <Text as="p" size="2xs" color="dim">{label}</Text>
    </div>
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
  const { players, loadAll } = useCricketStore();
  const { user } = useAuthStore();
  const [category, setCategory] = useState('batting');
  const [drawerEntry, setDrawerEntry] = useState<LeaderboardEntry | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const router = useRouter();

  // Swipe gesture state
  const touchStart = useRef<number>(0);

  // Ensure players are loaded (needed for current user highlighting)
  useEffect(() => {
    if (isCloudMode() && user && players.length === 0) {
      loadAll(user.id);
    }
  }, [user, players.length, loadAll]);
  const matchFilter = leaderboardMatchLimit === null ? 'all' : String(leaderboardMatchLimit);

  // Find current user's cricket_players ID for row highlighting
  const myPlayerId = (() => {
    if (!user) return null;
    const byUserId = players.find((p) => p.user_id === user.id && p.is_active);
    if (byUserId) return byUserId.id;
    const email = user.email?.toLowerCase();
    if (email) {
      const byEmail = players.find((p) => p.email?.toLowerCase() === email && p.is_active);
      if (byEmail) return byEmail.id;
    }
    return null;
  })();

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

  // Podium: show top 3 separately, table starts at rank 4
  const hasPodium = entries.length >= 3 && !isLoading;
  const tableEntries = hasPodium ? entries.slice(3) : entries;
  const tableStartRank = hasPodium ? 4 : 1;

  const handlePlayerTap = (entry: LeaderboardEntry, _rank: number) => {
    setDrawerEntry(entry);
    setDrawerOpen(true);
  };

  // Swipe between categories
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = e.touches[0].clientX;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const delta = touchStart.current - e.changedTouches[0].clientX;
    const idx = CATEGORIES.findIndex(c => c.key === category);
    if (delta > 60 && idx < CATEGORIES.length - 1) setCategory(CATEGORIES[idx + 1].key);
    if (delta < -60 && idx > 0) setCategory(CATEGORIES[idx - 1].key);
  };

  return (
    <div>
      {/* Category tabs */}
      <SegmentedControl
        options={CATEGORIES}
        active={category}
        onChange={setCategory}
        className="mb-3"
      />

      {/* Swipe indicator dots */}
      <div className="flex justify-center gap-1 mb-3">
        {CATEGORIES.map(c => (
          <div key={c.key} className={cn(
            'rounded-full transition-all duration-200',
            c.key === category ? 'w-4 h-1.5' : 'w-1.5 h-1.5',
          )}
          style={{
            background: c.key === category ? 'var(--cricket)' : 'var(--border)',
          }}
          />
        ))}
      </div>

      {/* Match filter pills + refresh */}
      <div className="flex items-center gap-1.5 mb-3" role="group" aria-label="Filter by number of matches">
        {MATCH_FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => handleFilterChange(f.key)}
            aria-pressed={matchFilter === f.key}
            className={cn(
              'px-3 py-1.5 rounded-full cursor-pointer transition-all duration-200 text-[11px] font-semibold whitespace-nowrap active:scale-[0.93]',
              matchFilter === f.key
                ? 'text-white'
                : 'text-[var(--muted)] hover:text-[var(--cricket)]',
            )}
            style={matchFilter === f.key
              ? { background: 'var(--cricket)', boxShadow: '0 2px 8px var(--cricket-glow)' }
              : { background: 'color-mix(in srgb, var(--cricket) 6%, var(--surface))', border: '1px solid color-mix(in srgb, var(--cricket) 12%, var(--border))' }
            }
          >
            {f.label}
          </button>
        ))}
        <div className="flex-1" />
        <RefreshButton onRefresh={async () => { await fetchLeaderboard(category); toast.success('Stats refreshed'); }} variant="bordered" title="Refresh stats" />
      </div>

      {/* Podium hero — top 3 players */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`podium-${category}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, transition: { duration: 0.2 } }}
          exit={{ opacity: 0, transition: { duration: 0.1 } }}
        >
          {hasPodium && <PodiumHero entries={entries} category={category} />}
        </motion.div>
      </AnimatePresence>

      {/* Full standings label */}
      {hasPodium && tableEntries.length > 0 && (
        <div className="flex items-center gap-2 mb-2">
          <div className="flex-1 h-px" style={{ background: 'color-mix(in srgb, var(--border) 40%, transparent)' }} />
          <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider">Full Standings</Text>
          <div className="flex-1 h-px" style={{ background: 'color-mix(in srgb, var(--border) 40%, transparent)' }} />
        </div>
      )}

      {/* Table (swipeable) */}
      <div onTouchStart={handleTouchStart} onTouchEnd={handleTouchEnd}>
        <AnimatePresence mode="wait">
          <motion.div
            key={`table-${category}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1, transition: { duration: 0.15 } }}
            exit={{ opacity: 0, transition: { duration: 0.1 } }}
          >
            {isLoading ? (
              <Card padding="none" surface="gradient" className="overflow-hidden">
                <TableSkeleton />
              </Card>
            ) : entries.length === 0 ? (
              <EmptyState
                icon={<Trophy size={40} color="var(--cricket)" />}
                title={`No ${category} stats yet`}
                description="Complete a practice match to see stats appear here"
                brand="cricket"
                action={{ label: 'Start a Match', onClick: () => router.push('/cricket/scoring') }}
              />
            ) : tableEntries.length > 0 ? (
              <Card padding="none" surface="gradient" className="overflow-hidden">
                <StatsTable
                  category={category}
                  entries={tableEntries}
                  loading={false}
                  myPlayerId={myPlayerId}
                  onPlayerTap={handlePlayerTap}
                  startRank={tableStartRank}
                />
              </Card>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* "Your position" card when user is ranked but outside top 10 + podium */}
      {myPlayerId && entries.length > 0 && (() => {
        const myIdx = entries.findIndex((e) => e.player_id === myPlayerId);
        // Don't show if in podium (top 3) or in visible table rows
        if (myIdx < 0 || myIdx < (hasPodium ? 3 + MAX_ROWS : MAX_ROWS)) return null;
        const myEntry = entries[myIdx];
        const [g1, g2] = nameToGradient(myEntry.name);
        return (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: 'easeOut', delay: 0.15 }}
            className="mt-3 rounded-xl overflow-hidden flex"
            style={{ border: '1px solid color-mix(in srgb, var(--cricket) 30%, var(--border))' }}
          >
            {/* Accent bar */}
            <div className="w-1 flex-shrink-0" style={{ background: 'var(--cricket)' }} />
            <div className="flex items-center gap-2.5 px-3 py-2.5 flex-1"
              style={{ background: 'var(--highlight-bg)' }}>
              <Text size="2xs" color="dim" weight="semibold" uppercase>Your Rank</Text>
              <Text size="sm" weight="bold" style={{ color: 'var(--cricket)' }}>#{myIdx + 1}</Text>
              {myEntry.photo_url ? (
                <img src={myEntry.photo_url} alt={myEntry.name} className="flex-shrink-0 h-7 w-7 rounded-full object-cover ring-1 ring-[var(--border)]" />
              ) : (
                <div className="flex-shrink-0 h-7 w-7 rounded-full flex items-center justify-center text-[10px] font-bold text-white"
                  style={{ background: `linear-gradient(135deg, ${g1}, ${g2})` }}>
                  {myEntry.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
                </div>
              )}
              <Text size="xs" weight="semibold" truncate className="flex-1 min-w-0">{myEntry.name}</Text>
            </div>
          </motion.div>
        );
      })()}

      {/* Player detail drawer */}
      <PlayerDrawer
        entry={drawerEntry}
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        category={category}
      />
    </div>
  );
}
