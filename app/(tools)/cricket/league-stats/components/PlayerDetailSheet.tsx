'use client';

import type { JSX, ReactNode } from 'react';
import { useMemo } from 'react';
import { X, TrendingUp, Award, Calendar } from 'lucide-react';
import { Drawer, DrawerHandle, DrawerTitle, DrawerHeader, DrawerBody, DrawerClose, Text } from '@/components/ui';
import PlayerAvatar from './PlayerAvatar';
import Sparkline from './Sparkline';

// keep in sync with LeagueStatsView.tsx
type BattingMatchRow = {
  match_row_id: string; player_id: string | null; batting_team: string; innings_number: number;
  batting_position: number | null; runs: number; balls: number; fours: number; sixes: number;
  strike_rate: number | null; dismissal: string | null; not_out: boolean; did_not_bat: boolean;
};
// keep in sync with LeagueStatsView.tsx
type BowlingMatchRow = {
  match_row_id: string; player_id: string | null; bowling_team: string; overs: number;
  maidens: number; runs: number; wickets: number; economy: number | null;
};
// keep in sync with LeagueStatsView.tsx
type MatchLookup = Map<string, { opponent: string; date: string | null }>;

type Context = 'batting' | 'bowling' | 'allround' | 'catches';

export type PlayerDetailSheetProps = {
  open: boolean;
  onClose: () => void;
  context: Context;
  player: {
    player_id: string; name: string; photo_url?: string | null;
    summary?: {
      runs?: number; innings?: number; average?: number | null; strike_rate?: number | null;
      wickets?: number; economy?: number | null; best_wickets?: number; catches?: number;
    };
  };
  battingInnings: BattingMatchRow[];
  bowlingInnings: BowlingMatchRow[];
  catchesByMatch?: Map<string, number>;
  matchLookup: MatchLookup;
};

const ACCENT: Record<Context, string> = {
  batting: 'var(--stat-batting)', bowling: 'var(--stat-bowling)',
  allround: 'var(--stat-allround)', catches: 'var(--stat-catches)',
};
const LABEL: Record<Context, string> = {
  batting: 'Batting view', bowling: 'Bowling view', allround: 'All-Round view', catches: 'Catches view',
};

const formatMatchDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};
const shortenOpponent = (s: string): string => s.replace(/^MTCA\s+/i, '');
const formatFigures = (o: number, m: number, r: number, w: number): string =>
  `${o.toFixed(1)}-${m}-${r}-${w}`;
const fmtNum = (v: number | null | undefined, digits = 2): string =>
  v === null || v === undefined || Number.isNaN(v) ? '—' : v.toFixed(digits);

type Entry = { match_row_id: string; date: string | null; opponent: string; bat?: BattingMatchRow; bowl?: BowlingMatchRow; catches?: number };

export default function PlayerDetailSheet(props: PlayerDetailSheetProps): JSX.Element | null {
  const { open, onClose, context, player, battingInnings, bowlingInnings, catchesByMatch, matchLookup } = props;
  const accent = ACCENT[context];

  const timeline = useMemo<Entry[]>(() => {
    const map = new Map<string, Entry>();
    const ensure = (id: string) => {
      let e = map.get(id);
      if (!e) { const m = matchLookup.get(id); e = { match_row_id: id, date: m?.date ?? null, opponent: m?.opponent ?? '' }; map.set(id, e); }
      return e;
    };
    battingInnings.forEach((b) => { ensure(b.match_row_id).bat = b; });
    bowlingInnings.forEach((b) => { ensure(b.match_row_id).bowl = b; });
    catchesByMatch?.forEach((n, id) => { if (n > 0) ensure(id).catches = n; });
    return Array.from(map.values()).sort((a, b) => (b.date ?? '').localeCompare(a.date ?? ''));
  }, [battingInnings, bowlingInnings, catchesByMatch, matchLookup]);

  const byDateAsc = <T extends { match_row_id: string }>(arr: T[]) =>
    [...arr].sort((a, b) => (matchLookup.get(a.match_row_id)?.date ?? '').localeCompare(matchLookup.get(b.match_row_id)?.date ?? ''));
  const runsSeries = byDateAsc(battingInnings).filter((b) => !b.did_not_bat).slice(-8).map((b) => b.runs);
  const wktSeries = byDateAsc(bowlingInnings).slice(-8).map((b) => b.wickets);
  const econSeries = byDateAsc(bowlingInnings).slice(-8).map((b) => b.economy ?? 0);
  const catchSeries = timeline.slice().reverse().slice(-8).map((t) => t.catches ?? 0);

  const fifties = battingInnings.filter((b) => b.runs >= 50);
  const fivers = bowlingInnings.filter((b) => b.wickets >= 5);
  const bestBowling = bowlingInnings.reduce<{ w: number; r: number } | null>((acc, b) =>
    !acc || b.wickets > acc.w || (b.wickets === acc.w && b.runs < acc.r) ? { w: b.wickets, r: b.runs } : acc, null);
  const bestCatchHaul = catchesByMatch ? Math.max(0, ...Array.from(catchesByMatch.values())) : 0;
  const hasAchievements = fifties.length > 0 || fivers.length > 0 || (bestBowling && bestBowling.w > 0) || bestCatchHaul >= 2;

  if (!open) return null;

  return (
    <Drawer open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DrawerHandle />
      <DrawerTitle>{player.name}</DrawerTitle>

      <DrawerHeader className="sticky top-0 z-10 relative overflow-hidden">
        {/* Context-tinted gradient + stadium-light radial highlight sit
            absolutely behind the header content. This lets DrawerHeader keep
            its own padding/structure while we paint discipline depth on top. */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 14%, var(--card)) 0%, var(--card) 100%)`,
          }}
        />
        <div
          aria-hidden
          className="absolute -top-10 -left-8 w-40 h-40 rounded-full pointer-events-none opacity-60"
          style={{
            background: `radial-gradient(circle, color-mix(in srgb, ${accent} 28%, transparent) 0%, transparent 65%)`,
            filter: 'blur(8px)',
          }}
        />
        <div className="relative flex items-center gap-3">
          <PlayerAvatar name={player.name} photoUrl={player.photo_url} size={64} ringColor={accent} />
          <div className="flex-1 min-w-0">
            <Text as="div" size="lg" weight="bold" truncate>{player.name}</Text>
            <span className="inline-flex items-center mt-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
              style={{
                background: `color-mix(in srgb, ${accent} 22%, transparent)`,
                color: accent,
                border: `1px solid color-mix(in srgb, ${accent} 30%, transparent)`,
              }}>
              {LABEL[context]}
            </span>
          </div>
          <DrawerClose aria-label="Close" className="h-9 w-9 rounded-full flex items-center justify-center transition-colors"
            style={{ background: 'color-mix(in srgb, var(--border) 50%, transparent)' }}>
            <X className="h-4 w-4" />
          </DrawerClose>
        </div>
      </DrawerHeader>

      <DrawerBody>
        {/* Sections cascade in with the card-rise animation when the sheet
            opens — gives the deep-layer screen a "presenting itself" feel
            instead of appearing as a static page. Each block waits ~80ms
            longer than the previous; reduced-motion respected via globals. */}
        <div className="animate-card-rise" style={{ animationDelay: '0ms' }}>
          <SummaryStrip context={context} summary={player.summary} accent={accent} />
        </div>

        <div className="animate-card-rise" style={{ animationDelay: '80ms' }}>
          <Section icon={<TrendingUp className="h-4 w-4" style={{ color: accent }} />} title="Recent Form">
            <Trends context={context} accent={accent} runs={runsSeries} wickets={wktSeries} economy={econSeries} catches={catchSeries} />
          </Section>
        </div>

        <div className="animate-card-rise" style={{ animationDelay: '160ms' }}>
          <Section icon={<Calendar className="h-4 w-4" style={{ color: accent }} />} title="Match Timeline">
            <Timeline context={context} entries={timeline} />
          </Section>
        </div>

        {hasAchievements && (
          <div className="animate-card-rise" style={{ animationDelay: '240ms' }}>
            <Section icon={<Award className="h-4 w-4" style={{ color: accent }} />} title="Achievements">
              <div className="flex flex-wrap gap-1.5">
                {fifties.map((b) => <Pill key={`50-${b.match_row_id}`} accent="var(--stat-batting)">{b.runs}{b.not_out ? '*' : ''}</Pill>)}
                {fivers.map((b) => <Pill key={`5w-${b.match_row_id}`} accent="var(--stat-bowling)">{b.wickets}/{b.runs}</Pill>)}
                {bestBowling && bestBowling.w > 0 && <Pill accent="var(--stat-bowling)">Best: {bestBowling.w}/{bestBowling.r}</Pill>}
                {bestCatchHaul >= 2 && <Pill accent="var(--stat-catches)">{bestCatchHaul} catches in 1 match</Pill>}
              </div>
            </Section>
          </div>
        )}
      </DrawerBody>
    </Drawer>
  );
}

function Section({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }): JSX.Element {
  return (
    <section>
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <Text as="span" size="xs" weight="semibold" uppercase color="muted">{title}</Text>
      </div>
      {children}
    </section>
  );
}

function SummaryStrip({ context, summary, accent }:
  { context: Context; summary: PlayerDetailSheetProps['player']['summary']; accent: string }): JSX.Element {
  const s = summary ?? {};
  const stats: Array<{ label: string; value: string }> =
    context === 'batting' ? [
      { label: 'Runs', value: String(s.runs ?? 0) },
      { label: 'Avg', value: fmtNum(s.average ?? null, 2) },
      { label: 'SR', value: fmtNum(s.strike_rate ?? null, 1) },
      { label: 'Inns', value: String(s.innings ?? 0) },
    ] : context === 'bowling' ? [
      { label: 'Wkts', value: String(s.wickets ?? 0) },
      { label: 'Econ', value: fmtNum(s.economy ?? null, 2) },
      { label: 'Best', value: s.best_wickets ? `${s.best_wickets}w` : '—' },
      { label: 'Inns', value: String(s.innings ?? 0) },
    ] : context === 'allround' ? [
      { label: 'Runs', value: String(s.runs ?? 0) },
      { label: 'Wkts', value: String(s.wickets ?? 0) },
      { label: 'Catches', value: String(s.catches ?? 0) },
      { label: 'Inns', value: String(s.innings ?? 0) },
    ] : [
      { label: 'Catches', value: String(s.catches ?? 0) },
      { label: 'Inns', value: String(s.innings ?? 0) },
    ];

  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}>
      {stats.map((stat, idx) => (
        <div
          key={stat.label}
          className="rounded-xl px-2 py-2.5 text-center animate-chip-pop"
          style={{
            // Accent-tinted gradient tile — mirrors the leaderboard card
            // surface language so the sheet feels like a "zoom in" of the
            // card, not a different visual world.
            background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 10%, var(--card)) 0%, var(--card) 100%)`,
            border: `1px solid color-mix(in srgb, ${accent} 18%, var(--border))`,
            animationDelay: `${idx * 50}ms`,
          }}
        >
          <div
            className="text-[22px] font-black tabular-nums leading-tight"
            style={{
              color: accent,
              textShadow: `0 2px 10px color-mix(in srgb, ${accent} 30%, transparent)`,
            }}
          >
            {stat.value}
          </div>
          <div className="text-[10px] uppercase tracking-wider font-bold mt-1" style={{ color: 'var(--muted)' }}>{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

function Trends({ context, accent, runs, wickets, economy, catches }:
  { context: Context; accent: string; runs: number[]; wickets: number[]; economy: number[]; catches: number[] }): JSX.Element {
  if (context === 'batting') return <TrendRow label="Runs / innings" latest={runs.at(-1)} data={runs} color={accent} />;
  if (context === 'bowling') return (
    <div className="space-y-2">
      <TrendRow label="Wickets / innings" latest={wickets.at(-1)} data={wickets} color={accent} />
      <TrendRow label="Economy / innings" latest={economy.at(-1)} data={economy} color={accent} digits={2} />
    </div>
  );
  if (context === 'catches') return <TrendRow label="Catches / match" latest={catches.at(-1)} data={catches} color={accent} />;
  return (
    <div className="grid grid-cols-3 gap-2">
      <TrendRow compact label="Runs" latest={runs.at(-1)} data={runs} color="var(--stat-batting)" />
      <TrendRow compact label="Wkts" latest={wickets.at(-1)} data={wickets} color="var(--stat-bowling)" />
      <TrendRow compact label="Catches" latest={catches.at(-1)} data={catches} color="var(--stat-catches)" />
    </div>
  );
}

function TrendRow({ label, latest, data, color, compact, digits = 0 }:
  { label: string; latest: number | undefined; data: number[]; color: string; compact?: boolean; digits?: number }): JSX.Element {
  const latestStr = latest === undefined ? '—' : digits > 0 ? latest.toFixed(digits) : String(latest);
  return (
    <div
      className={compact ? 'rounded-xl p-2' : 'rounded-xl p-3 flex items-center justify-between gap-3'}
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${color} 8%, var(--card)) 0%, var(--card) 100%)`,
        border: `1px solid color-mix(in srgb, ${color} 16%, var(--border))`,
      }}
    >
      <div className={compact ? '' : 'flex-1 min-w-0'}>
        <div className="text-[10px] uppercase tracking-wider font-bold" style={{ color: 'var(--muted)' }}>{label}</div>
        <div className="text-sm font-extrabold tabular-nums mt-0.5" style={{ color }}>{latestStr}</div>
      </div>
      <div className={compact ? 'mt-1' : ''} style={{ color }}>
        <Sparkline data={data} color={color} width={compact ? 80 : 120} height={28} ariaLabel={`${label} trend`} />
      </div>
    </div>
  );
}

function Timeline({ context, entries }: { context: Context; entries: Entry[] }): JSX.Element {
  const filtered = context === 'catches' ? entries.filter((e) => (e.catches ?? 0) > 0) : entries;
  if (filtered.length === 0) return <div className="text-sm py-3 text-center" style={{ color: 'var(--muted)' }}>No matches yet</div>;
  const accent = ACCENT[context];
  return (
    <div
      className="rounded-xl divide-y overflow-hidden"
      style={{
        background: `linear-gradient(180deg, color-mix(in srgb, ${accent} 6%, var(--card)) 0%, var(--card) 100%)`,
        border: `1px solid color-mix(in srgb, ${accent} 14%, var(--border))`,
        borderColor: `color-mix(in srgb, ${accent} 14%, var(--border))`,
      }}
    >
      {filtered.map((e) => <TimelineRow key={e.match_row_id} entry={e} context={context} />)}
    </div>
  );
}

function TimelineRow({ entry, context }: { entry: Entry; context: Context }): JSX.Element {
  const dateStr = formatMatchDate(entry.date);
  const opp = shortenOpponent(entry.opponent || 'Unknown');
  const header = (
    <div className="flex items-center gap-1.5 text-[11px]" style={{ color: 'var(--muted)' }}>
      {dateStr && <span className="font-semibold">{dateStr}</span>}
      {dateStr && <span>vs</span>}
      <span className="truncate">{opp}</span>
    </div>
  );

  if (context === 'batting') {
    const b = entry.bat;
    return (
      <div className="px-3 py-2">{header}
        <div className="text-sm mt-0.5">
          {!b || b.did_not_bat ? <span style={{ color: 'var(--muted)' }}>Did not bat</span> : (
            <>
              <span className="font-bold tabular-nums">{b.runs}{b.not_out ? '*' : ''}</span>
              <span style={{ color: 'var(--muted)' }}> ({b.balls})</span>
              {b.strike_rate !== null && <span style={{ color: 'var(--muted)' }}> · SR {b.strike_rate.toFixed(1)}</span>}
              {(b.fours > 0 || b.sixes > 0) && <span style={{ color: 'var(--muted)' }}> · {b.fours}×4 {b.sixes}×6</span>}
            </>
          )}
        </div>
      </div>
    );
  }
  if (context === 'bowling') {
    const b = entry.bowl;
    return (
      <div className="px-3 py-2">{header}
        <div className="text-sm mt-0.5">
          {!b ? <span style={{ color: 'var(--muted)' }}>Did not bowl</span> : (
            <>
              <span className="font-bold tabular-nums">{formatFigures(b.overs, b.maidens, b.runs, b.wickets)}</span>
              {b.economy !== null && <span style={{ color: 'var(--muted)' }}> · Econ {b.economy.toFixed(2)}</span>}
            </>
          )}
        </div>
      </div>
    );
  }
  if (context === 'catches') {
    return <div className="px-3 py-2">{header}<div className="text-sm mt-0.5 font-bold tabular-nums">🧤 × {entry.catches ?? 0}</div></div>;
  }
  const b = entry.bat, bw = entry.bowl;
  const showBat = b && !b.did_not_bat;
  if (!showBat && !bw) return <div className="hidden" />;
  return (
    <div className="px-3 py-2 space-y-0.5">{header}
      {showBat && (
        <div className="text-sm">
          <span className="text-[10px] mr-1 uppercase tracking-wide" style={{ color: 'var(--stat-batting)' }}>Bat</span>
          <span className="font-bold tabular-nums">{b!.runs}{b!.not_out ? '*' : ''}</span>
          <span style={{ color: 'var(--muted)' }}> ({b!.balls})</span>
        </div>
      )}
      {bw && (
        <div className="text-sm">
          <span className="text-[10px] mr-1 uppercase tracking-wide" style={{ color: 'var(--stat-bowling)' }}>Bowl</span>
          <span className="font-bold tabular-nums">{formatFigures(bw.overs, bw.maidens, bw.runs, bw.wickets)}</span>
        </div>
      )}
    </div>
  );
}

function Pill({ children, accent }: { children: ReactNode; accent: string }): JSX.Element {
  return (
    <span
      className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-extrabold tabular-nums animate-chip-pop"
      style={{
        background: `linear-gradient(135deg, color-mix(in srgb, ${accent} 24%, var(--card)) 0%, color-mix(in srgb, ${accent} 12%, var(--card)) 100%)`,
        color: accent,
        border: `1px solid color-mix(in srgb, ${accent} 38%, transparent)`,
        boxShadow: `0 2px 8px color-mix(in srgb, ${accent} 18%, transparent), inset 0 1px 0 color-mix(in srgb, var(--card) 60%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}
