import type { ComponentType, JSX } from 'react';
import { Trophy, Gauge, Hand, Award } from 'lucide-react';
import { GiTennisBall } from 'react-icons/gi';
import { Text } from '@/components/ui';
import Sparkline from './Sparkline';
import PlayerAvatar from './PlayerAvatar';

type IconCmp = ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;

export type TopPerformerCard = {
  category: 'runs' | 'wickets' | 'economy' | 'catches' | 'mvp';
  label: string;
  metric: string;
  unit: string;
  player_id: string;
  player_name: string;
  trend?: number[];
};

export type TopPerformersCarouselProps = {
  cards: TopPerformerCard[];
  photoUrlByPlayer?: Map<string, string | null>;
  onCardTap?: (player_id: string) => void;
};

const CATEGORY_META: Record<
  TopPerformerCard['category'],
  { Icon: IconCmp; accent: string }
> = {
  runs: { Icon: Trophy, accent: 'var(--stat-batting)' },
  wickets: { Icon: GiTennisBall, accent: 'var(--stat-bowling)' },
  economy: { Icon: Gauge, accent: 'var(--stat-bowling)' },
  catches: { Icon: Hand, accent: 'var(--stat-catches)' },
  mvp: { Icon: Award, accent: 'var(--stat-allround)' },
};

export default function TopPerformersCarousel({
  cards,
  photoUrlByPlayer,
  onCardTap,
}: TopPerformersCarouselProps): JSX.Element | null {
  if (cards.length === 0) return null;

  return (
    <div className="-mx-4 px-4">
      <div className="overflow-x-auto snap-x snap-mandatory flex gap-3 pb-1 scrollbar-hide" style={{ scrollPaddingInline: '1rem' }}>
        {cards.map((card) => {
          const { Icon, accent } = CATEGORY_META[card.category];
          const photoUrl = photoUrlByPlayer?.get(card.player_id) ?? null;
          const hasTrend = Array.isArray(card.trend) && card.trend.length > 0;

          return (
            <button
              key={`${card.category}-${card.player_id}`}
              type="button"
              onClick={() => onCardTap?.(card.player_id)}
              className="snap-start flex-shrink-0 w-[156px] rounded-2xl p-3 text-left transition-all active:scale-[0.98] hover:-translate-y-[1px] focus:outline-none focus-visible:ring-2"
              style={{
                background: `linear-gradient(160deg, color-mix(in srgb, ${accent} 14%, var(--card)) 0%, color-mix(in srgb, ${accent} 5%, var(--card)) 100%)`,
                border: `1px solid color-mix(in srgb, ${accent} 28%, var(--border))`,
                boxShadow: `0 4px 14px color-mix(in srgb, ${accent} 12%, transparent), inset 0 1px 0 color-mix(in srgb, var(--card) 80%, transparent)`,
              }}
              aria-label={`${card.label}: ${card.player_name}, ${card.metric} ${card.unit}`}
            >
              {/* Icon chip */}
              <div
                className="h-7 w-7 rounded-full flex items-center justify-center mb-2"
                style={{
                  background: `color-mix(in srgb, ${accent} 18%, transparent)`,
                  color: accent,
                }}
              >
                <Icon size={15} strokeWidth={2.4} />
              </div>

              {/* Eyebrow label */}
              <Text
                className="uppercase tracking-wider mb-2 truncate"
                style={{ fontSize: 10, color: 'var(--muted)' }}
              >
                {card.label}
              </Text>

              {/* Avatar */}
              <div className="mb-2">
                <PlayerAvatar name={card.player_name} photoUrl={photoUrl} size={48} />
              </div>

              {/* Metric */}
              <div className="flex items-baseline gap-1 mb-0.5">
                <span
                  className="font-black tabular-nums leading-none"
                  style={{
                    fontSize: 26,
                    color: accent,
                    // Same accent glow used on the leaderboard hero numeral —
                    // gives the carousel metric the same "lit up" feel and
                    // visually links carousel "Top X" with leaderboard rank #1.
                    textShadow: `0 2px 10px color-mix(in srgb, ${accent} 35%, transparent)`,
                  }}
                >
                  {card.metric}
                </span>
                <span style={{ fontSize: 11, color: 'var(--muted)' }}>{card.unit}</span>
              </div>

              {/* Player name */}
              <Text
                className="font-bold truncate"
                style={{ fontSize: 13, color: 'var(--fg)' }}
              >
                {card.player_name}
              </Text>

              {/* Sparkline (if data present) */}
              <div className="mt-1.5 h-[22px]">
                {hasTrend && (
                  <Sparkline
                    data={card.trend!}
                    width={140}
                    height={22}
                    color={accent}
                    fillOpacity={0.18}
                    showLastDot
                    ariaLabel={`${card.player_name} trend`}
                  />
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
