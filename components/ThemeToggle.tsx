'use client';

import { useTheme } from 'next-themes';
import { useSyncExternalStore } from 'react';
import { Moon, Sun } from 'lucide-react';

/** Same 44px round, line-icon treatment as the other app-bar controls. */
const HEADER_ICON_BUTTON =
  'flex h-11 w-11 cursor-pointer items-center justify-center rounded-full text-[var(--text)] transition-colors active:bg-[var(--hover-bg)]';

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  // false on the server and during hydration, true after — without a
  // setState-in-effect re-render.
  const mounted = useSyncExternalStore(noopSubscribe, () => true, () => false);

  // Reserve the slot before hydration so the bar doesn't shift.
  if (!mounted) return <span className="h-11 w-11" aria-hidden />;

  // `theme` can be the literal string 'system' — a visitor who never set an
  // explicit preference has a resolved (rendered) theme that follows their
  // OS, but `theme === 'dark'` is false for them, so the first tap silently
  // set an explicit 'dark' with no visible change: a dead first click for
  // anyone whose system is dark. `resolvedTheme` is what's actually on
  // screen, so toggling off of it always flips the visible state.
  const isDark = resolvedTheme === 'dark';

  return (
    <button
      onClick={() => setTheme(isDark ? 'light' : 'dark')}
      className={HEADER_ICON_BUTTON}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title="Toggle theme"
    >
      {isDark ? <Sun size={21} aria-hidden /> : <Moon size={20} aria-hidden />}
    </button>
  );
}
