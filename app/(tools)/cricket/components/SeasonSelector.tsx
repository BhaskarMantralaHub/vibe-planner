'use client';

import { useMemo, useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';
import { SEASON_TYPES } from '../lib/constants';
import { Drawer, DrawerHandle, DrawerTitle, DrawerBody, Text } from '@/components/ui';
import { Check, ChevronDown } from 'lucide-react';

/**
 * Season picker.
 *
 * Rendered on four screens: the cricket dashboard, League Schedule, Umpiring,
 * and League Stats. Changing it changes what every number on those pages means,
 * so it is deliberately a modal bottom sheet rather than a dropdown.
 *
 * ── Why it stopped being a dropdown ────────────────────────────────────────
 *  1. CLIPPING. The old menu was `absolute top-full` and on League Stats it
 *     renders inside a card with `overflow: hidden`. Two options fitted with
 *     12px to spare, which is why nobody noticed; a third needed 132px in
 *     104px of space and got cut off. z-index could not rescue it — the
 *     surrounding hero created its own stacking context.
 *  2. A TAP OUTSIDE COULD FAIL TO CLOSE IT. The old close handler listened for
 *     `mousedown` only, and iOS Safari does not reliably synthesise mouse
 *     events for a tap on non-interactive background, so the menu could stick
 *     open. A sheet gets a real overlay by construction.
 *  3. TOUCH TARGETS. The trigger was 38px and the rows 40px, against a 44px
 *     minimum — on what is about to become the most-tapped control here.
 *  4. It also deletes an effect that measured the trigger's rect against a
 *     hardcoded 300px estimate to flip the menu left or right — solving a
 *     horizontal problem when the one that actually bit was vertical.
 *
 * A sheet also has room for the roster count under each season, which is the
 * context that makes picking one a considered act rather than a guess.
 *
 * The shared Drawer is already responsive (`sm:max-w-md sm:mx-auto`), so this
 * is one implementation for phone and desktop rather than two.
 *
 * NOTE: the "New Season" form that used to live here — dead-coded behind a
 * literal `false` since 2026-05-05 — has been removed. It could not have
 * worked: `addSeason` inserts without `is_active`, the column defaults to
 * true, and `uniq_cricket_seasons_one_active_per_team` would have rejected it
 * while another season was active, with no error handling to notice. Season
 * creation needs rebuilding, not un-hiding. See docs/fall-2026-season.sql.
 */

const SEASON_ICON: Record<string, string> = { spring: '🌱', summer: '☀️', fall: '🍂' };
const SEASON_ORDER: Record<string, number> = { spring: 0, summer: 1, fall: 2 };

export default function SeasonSelector() {
  const { seasons, seasonPlayers, selectedSeasonId, setSelectedSeason } = useCricketStore();
  const [open, setOpen] = useState(false);

  // Newest year first, then spring → summer → fall within a year.
  const sorted = useMemo(
    () => [...seasons].sort((a, b) =>
      b.year - a.year
      || (SEASON_ORDER[a.season_type] ?? 0) - (SEASON_ORDER[b.season_type] ?? 0),
    ),
    [seasons],
  );

  const selected = sorted.find((s) => s.id === selectedSeasonId);

  /** Roster size per season — the one piece of context available without a
   *  further query, and the most useful one for picking a season. */
  const rosterCount = useMemo(() => {
    const counts = new Map<string, number>();
    for (const sp of seasonPlayers) {
      if (sp.left_at !== null) continue;
      counts.set(sp.season_id, (counts.get(sp.season_id) ?? 0) + 1);
    }
    return counts;
  }, [seasonPlayers]);

  // Short form for the trigger — the stored name runs to "2026 MTCA Spring
  // League · Division D", far too long for a pill. The sheet shows it in full.
  const shortLabel = (s: typeof seasons[number] | undefined) => {
    if (!s) return 'No seasons';
    const type = SEASON_TYPES.find((t) => t.key === s.season_type)?.label ?? s.season_type;
    return `${type} ${s.year}`;
  };

  const icon = selected ? (SEASON_ICON[selected.season_type] ?? '📅') : '📅';

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={sorted.length === 0}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={selected ? `Season: ${shortLabel(selected)}. Change season` : 'No seasons'}
        // min-h-11 = 44px. Elevated chip, not a bordered pill — the season is
        // a floating contextual control, so it separates by shadow and tone.
        // Visually subordinate to the team name beside it: 13px semibold,
        // tighter padding, restrained shadow, plain dim chevron.
        className="flex min-h-11 items-center gap-1.5 rounded-full bg-[var(--elevated)] shadow-[0_1px_2px_rgba(16,24,40,0.05),0_2px_8px_rgba(16,24,40,0.06)] pl-2.5 pr-2 text-[var(--text)] transition-all active:scale-[0.98] active:shadow-[0_1px_3px_rgba(16,24,40,0.08)] disabled:opacity-50"
      >
        {/* Remounts when the season changes so the new label plays the
            standard view-in rise — the transition lives in the chip, never
            the page. */}
        <span key={selected?.id ?? 'none'} className="flex items-center gap-1.5 animate-view-in">
          <span className="text-[15px] leading-none" aria-hidden>{icon}</span>
          <Text size="sm" weight="semibold">{shortLabel(selected)}</Text>
        </span>
        <ChevronDown size={14} className="flex-shrink-0 text-[var(--dim)]" aria-hidden />
      </button>

      <Drawer open={open} onOpenChange={setOpen}>
        <DrawerHandle />
        <DrawerTitle>Choose a season</DrawerTitle>
        <DrawerBody className="!px-0 !pt-2">
          <Text
            as="p"
            size="2xs"
            color="muted"
            weight="bold"
            uppercase
            tracking="wider"
            className="px-5 pb-1"
          >
            Season
          </Text>

          <div className="flex flex-col">
            {sorted.map((s) => {
              const isActive = s.id === selectedSeasonId;
              const players = rosterCount.get(s.id) ?? 0;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => { setSelectedSeason(s.id); setOpen(false); }}
                  aria-current={isActive ? 'true' : undefined}
                  // min-h-14 = 56px, comfortably over the 44px floor and with
                  // room for the second line.
                  className="flex min-h-14 w-full items-center gap-3 border-t border-[var(--border)] px-5 py-2.5 text-left transition-colors active:bg-[var(--hover-bg)]"
                  style={isActive
                    ? { background: 'color-mix(in srgb, var(--cricket) 7%, transparent)' }
                    : undefined}
                >
                  <span className="text-[19px] leading-none" aria-hidden>
                    {SEASON_ICON[s.season_type] ?? '📅'}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    {/* Full stored name here — the pill could only show two words */}
                    <Text as="p" size="sm" weight="bold" truncate>{s.name}</Text>
                    <Text as="p" size="2xs" color="muted">
                      {players > 0
                        ? `${players} ${players === 1 ? 'player' : 'players'}`
                        : 'No players on this season yet'}
                      {s.is_active && ' · Current season'}
                    </Text>
                  </span>
                  {isActive && (
                    <Check size={17} className="flex-shrink-0 text-[var(--cricket)]" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </DrawerBody>
      </Drawer>
    </>
  );
}
