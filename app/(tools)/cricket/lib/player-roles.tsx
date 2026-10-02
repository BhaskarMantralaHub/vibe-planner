import { MdSportsCricket } from 'react-icons/md';
import { GiTennisBall, GiGloves } from 'react-icons/gi';

/**
 * One role vocabulary for the Roster list, the Add/Edit form and
 * PlayerProfile. Colours are theme tokens (see `--role-*` in globals.css),
 * contrast-checked as 12px text on --card in both themes.
 */
export const ROLE_META: Record<string, { label: string; color: string; desc: string; icon: (size: number) => React.ReactNode }> = {
  batsman: { label: 'Batsman', color: 'var(--role-bat)', desc: 'Run scorer', icon: (s) => <MdSportsCricket size={s} /> },
  bowler: { label: 'Bowler', color: 'var(--role-bowl)', desc: 'Wicket taker', icon: (s) => <GiTennisBall size={s - 1} /> },
  'all-rounder': {
    label: 'All-Rounder', color: 'var(--role-allround)', desc: 'Bat & ball',
    icon: (s) => <><MdSportsCricket size={s - 1} /><GiTennisBall size={s - 3} /></>,
  },
  keeper: { label: 'Keeper', color: 'var(--role-keep)', desc: 'Behind stumps', icon: (s) => <GiGloves size={s} /> },
};

/// Mix a colour with transparent; works with CSS variables and hex.
export function colorAlpha(color: string, pct: number): string {
  return `color-mix(in srgb, ${color} ${pct}%, transparent)`;
}
