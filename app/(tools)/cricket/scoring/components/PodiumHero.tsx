'use client';

import { Text } from '@/components/ui';
import { nameToGradient } from '@/lib/avatar';
import { Hand, Trophy, type LucideIcon } from 'lucide-react';
import { GiTennisBall, GiCricketBat } from 'react-icons/gi';
import { motion } from 'motion/react';

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  batting: GiCricketBat as unknown as LucideIcon,
  bowling: GiTennisBall as unknown as LucideIcon,
  fielding: Hand,
  allround: Trophy,
};
import type { LeaderboardEntry } from '@/types/scoring';

const MEDAL_STYLES = [
  {
    ring: '#FFD700',
    avatarGlow: '0 0 0 3px #FFD700, 0 0 14px rgba(255,215,0,0.35)',
    bg: 'linear-gradient(160deg, color-mix(in srgb, #FFD700 18%, var(--card)) 0%, color-mix(in srgb, #FFA500 8%, var(--card)) 100%)',
    border: 'rgba(255,215,0,0.6)',
    glow: '0 0 0 2px rgba(255,215,0,0.35), 0 8px 32px rgba(255,215,0,0.22), 0 2px 8px rgba(0,0,0,0.12)',
  },
  {
    ring: '#C0C8D8',
    avatarGlow: '0 0 0 2.5px #C0C8D8, 0 0 10px rgba(192,200,216,0.25)',
    bg: 'color-mix(in srgb, #C0C8D8 10%, var(--card))',
    border: 'color-mix(in srgb, #C0C8D8 40%, transparent)',
    glow: '0 0 8px rgba(192,200,216,0.12)',
  },
  {
    ring: '#CD7F32',
    avatarGlow: '0 0 0 2.5px #CD7F32, 0 0 10px rgba(205,127,50,0.22)',
    bg: 'color-mix(in srgb, #CD7F32 10%, var(--card))',
    border: 'color-mix(in srgb, #CD7F32 40%, transparent)',
    glow: '0 0 8px rgba(205,127,50,0.12)',
  },
];

function getPrimaryStat(entry: LeaderboardEntry, category: string): { value: number; label: string } {
  switch (category) {
    case 'batting':  return { value: entry.total_runs ?? 0, label: 'RUNS' };
    case 'bowling':  return { value: entry.total_wickets ?? 0, label: 'WICKETS' };
    case 'fielding': return { value: entry.total_dismissals ?? ((entry.total_catches ?? 0) + (entry.total_runouts ?? 0) + (entry.total_stumpings ?? 0)), label: 'DISMISSALS' };
    case 'allround': return { value: entry.score ?? 0, label: 'POINTS' };
    default:         return { value: 0, label: '' };
  }
}

function getSecondaryStat(entry: LeaderboardEntry, category: string): string {
  switch (category) {
    case 'batting':  return `SR ${entry.strike_rate?.toFixed(1) ?? '0'}`;
    case 'bowling':  return `Econ ${entry.economy?.toFixed(2) ?? '0'}`;
    case 'fielding': return `${entry.total_catches ?? 0} Ct · ${entry.total_runouts ?? 0} RO`;
    case 'allround': return `${entry.total_runs ?? 0}R · ${entry.total_wickets ?? 0}W`;
    default:         return '';
  }
}

function Avatar({ entry, size, shadow }: { entry: LeaderboardEntry; size: number; shadow: string }) {
  const [g1, g2] = nameToGradient(entry.name);
  const fontSize = size >= 60 ? 22 : 14;

  if (entry.photo_url) {
    return (
      <img
        src={entry.photo_url}
        alt={entry.name}
        className="rounded-full object-cover"
        style={{ width: size, height: size, boxShadow: shadow }}
      />
    );
  }
  return (
    <div
      className="rounded-full flex items-center justify-center font-bold text-white"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${g1}, ${g2})`, boxShadow: shadow, fontSize }}
    >
      {entry.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase()}
    </div>
  );
}

/* ── Category icon for 1st place ── */
function CategoryIcon({ category }: { category: string }) {
  const Icon = CATEGORY_ICONS[category] ?? Trophy;
  return <Icon size={24} strokeWidth={2.5} style={{ color: 'var(--cricket)' }} />;
}

/* ── Scroll-triggered pop-up + tap press feedback ── */
const popUpVariants = {
  offscreen: { opacity: 0, y: 30, scale: 0.9 },
  onscreen: (delay: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 260,
      damping: 20,
      delay: delay / 1000,
    },
  }),
};

function PodiumCard({ entry, rank, category, delay }: { entry: LeaderboardEntry; rank: number; category: string; delay: number }) {
  const style = MEDAL_STYLES[rank];
  const primary = getPrimaryStat(entry, category);
  const secondary = getSecondaryStat(entry, category);
  const isFirst = rank === 0;
  const firstName = entry.name.split(' ')[0];

  if (isFirst) {
    return (
      <motion.div
        className="flex flex-col items-center flex-[1.25]"
        variants={popUpVariants}
        custom={delay}
        initial="offscreen"
        whileInView="onscreen"
        viewport={{ once: true, amount: 0.3 }}
        whileTap={{ scale: 0.96, y: 2 }}
      >
        {/* Category icon floating above 1st place */}
        <div
          className="mb-1 flex items-center justify-center"
          aria-hidden="true"
        >
          <CategoryIcon category={category} />
        </div>

        {/* Gold card with pulse + shimmer */}
        <div
          className="w-full flex flex-col items-center rounded-2xl px-3 py-4 relative overflow-hidden animate-gold-pulse"
          style={{ background: style.bg, border: `2px solid ${style.border}` }}
        >
          {/* Shimmer streak */}
          <div
            className="absolute inset-0 pointer-events-none animate-shimmer"
            style={{ background: 'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }}
          />

          <div className="relative mb-2 z-10">
            <Avatar entry={entry} size={68} shadow={style.avatarGlow} />
          </div>

          <Text as="p" size="sm" weight="bold" truncate className="max-w-full text-center z-10">
            {firstName}
            {entry.is_guest && <Text as="span" size="2xs" color="dim"> (G)</Text>}
          </Text>

          <Text as="p" size="4xl" weight="bold" tabular className="mt-1 z-10 leading-none"
            style={{ color: 'var(--cricket)', textShadow: '0 0 20px var(--cricket-glow)' }}>
            {primary.value}
          </Text>

          <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider" className="mt-0.5 z-10">
            {primary.label}
          </Text>

          <Text as="p" size="2xs" color="muted" className="mt-1 z-10">
            {secondary}
          </Text>
        </div>
      </motion.div>
    );
  }

  /* 2nd and 3rd — pop up on scroll, press feedback on tap */
  return (
    <motion.div
      className="flex flex-col items-center flex-1 rounded-2xl px-2.5 py-3"
      variants={popUpVariants}
      custom={delay}
      initial="offscreen"
      whileInView="onscreen"
      viewport={{ once: true, amount: 0.3 }}
      whileTap={{ scale: 0.95, y: 3 }}
      style={{
        background: style.bg,
        border: `1.5px solid ${style.border}`,
        boxShadow: style.glow,
      }}
    >
      {/* Spacer to align bottom-baseline with 1st place */}
      <div className="h-9" />

      <div className="relative mb-2">
        <Avatar entry={entry} size={44} shadow={style.avatarGlow} />
      </div>

      <Text as="p" size="xs" weight="semibold" truncate className="max-w-full text-center">
        {firstName}
        {entry.is_guest && <Text as="span" size="2xs" color="dim"> (G)</Text>}
      </Text>

      <Text as="p" size="2xl" weight="bold" tabular className="mt-1"
        style={{ color: 'var(--cricket)' }}>
        {primary.value}
      </Text>

      <Text as="p" size="2xs" color="dim" weight="semibold" uppercase tracking="wider" className="mt-0.5">
        {primary.label}
      </Text>

      <Text as="p" size="2xs" color="muted" className="mt-1">
        {secondary}
      </Text>
    </motion.div>
  );
}

interface PodiumHeroProps {
  entries: LeaderboardEntry[];
  category: string;
}

function PodiumHero({ entries, category }: PodiumHeroProps) {
  if (entries.length < 3) return null;

  const podiumOrder = [entries[1], entries[0], entries[2]];
  const rankOrder = [1, 0, 2];
  const delays = [100, 0, 150];

  return (
    <div className="flex items-end gap-2 mb-4">
      {podiumOrder.map((entry, i) => (
        <PodiumCard
          key={entry.player_id}
          entry={entry}
          rank={rankOrder[i]}
          category={category}
          delay={delays[i]}
        />
      ))}
    </div>
  );
}

export default PodiumHero;
