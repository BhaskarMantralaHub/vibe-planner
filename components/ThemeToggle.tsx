'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return (
      <button
        className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 text-base"
        aria-label="Toggle theme"
      >
        <span className="opacity-0">--</span>
      </button>
    );
  }

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
      className="cursor-pointer rounded-lg border border-[var(--border)] bg-[var(--card)] p-1.5 text-base transition-colors hover:border-[var(--muted)]"
      aria-label="Toggle theme"
    >
      {isDark ? '\u2600\uFE0F' : '\uD83C\uDF19'}
    </button>
  );
}
