'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
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

  const isDark = theme === 'dark';

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
