'use client';

import { useTheme } from 'next-themes';
import { useState, useSyncExternalStore, type MouseEvent } from 'react';
import { flushSync } from 'react-dom';
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
  // The icon spins in only after a tap, never on page load.
  const [toggled, setToggled] = useState(false);

  // Reserve the slot before hydration so the bar doesn't shift.
  if (!mounted) return <span className="h-11 w-11" aria-hidden />;

  // `theme` can be the literal string 'system' — a visitor who never set an
  // explicit preference has a resolved (rendered) theme that follows their
  // OS, but `theme === 'dark'` is false for them, so the first tap silently
  // set an explicit 'dark' with no visible change: a dead first click for
  // anyone whose system is dark. `resolvedTheme` is what's actually on
  // screen, so toggling off of it always flips the visible state.
  const isDark = resolvedTheme === 'dark';

  // The new theme spreads out of the button as a circle. Where View
  // Transitions are missing (Safari < 18) or motion is reduced, it just
  // switches.
  const toggle = (e: MouseEvent<HTMLButtonElement>) => {
    const next = isDark ? 'light' : 'dark';
    setToggled(true);
    const root = document.documentElement;
    if (!document.startViewTransition || window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setTheme(next);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const radius = Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y));
    root.setAttribute('data-theme-switching', '');
    const vt = document.startViewTransition(() => {
      // next-themes applies the attribute in an effect; set it here so the
      // "after" snapshot is already in the new theme.
      root.setAttribute('data-theme', next);
      root.style.colorScheme = next;
      flushSync(() => setTheme(next));
    });
    vt.ready
      .then(() => {
        root.animate(
          { clipPath: [`circle(0px at ${x}px ${y}px)`, `circle(${radius}px at ${x}px ${y}px)`] },
          { duration: 620, easing: 'cubic-bezier(0.16, 1, 0.3, 1)', pseudoElement: '::view-transition-new(root)' },
        );
      })
      .catch(() => {});
    vt.finished.catch(() => {}).finally(() => root.removeAttribute('data-theme-switching'));
  };

  return (
    <button
      onClick={toggle}
      className={HEADER_ICON_BUTTON}
      aria-label={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      title="Toggle theme"
    >
      {isDark
        ? <Sun key="sun" size={21} aria-hidden className={toggled ? 'animate-theme-icon-in' : undefined} />
        : <Moon key="moon" size={20} aria-hidden className={toggled ? 'animate-theme-icon-in' : undefined} />}
    </button>
  );
}
