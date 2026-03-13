'use client';

import { useEffect, useState } from 'react';
import { isCloudMode } from '@/lib/supabase/client';

export function LocalBanner() {
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    if (isCloudMode()) {
      setDismissed(true);
      return;
    }
    const wasDismissed = sessionStorage.getItem('local_banner_dismissed') === '1';
    setDismissed(wasDismissed);
  }, []);

  if (dismissed) return null;

  function handleDismiss() {
    sessionStorage.setItem('local_banner_dismissed', '1');
    setDismissed(true);
  }

  function handleExport() {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith('vibe_'));
    const data: Record<string, string | null> = {};
    keys.forEach((k) => (data[k] = localStorage.getItem(k)));

    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `vibe-backup-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="animate-slide-in flex items-center gap-3 bg-gradient-to-r from-amber-500/15 to-orange-500/15 border-b border-amber-500/25 px-4 py-2 text-sm">
      <span className="font-medium text-[var(--orange)]">Local Mode</span>
      <span className="text-[var(--muted)]">&mdash; Your data is saved in this browser only.</span>
      <div className="ml-auto flex items-center gap-2">
        <button
          onClick={handleExport}
          className="cursor-pointer rounded-md bg-[var(--orange)]/15 px-2.5 py-1 text-xs font-medium text-[var(--orange)] transition-colors hover:bg-[var(--orange)]/25"
        >
          Export Backup
        </button>
        <button
          onClick={handleDismiss}
          className="cursor-pointer rounded-md px-2 py-1 text-xs text-[var(--muted)] transition-colors hover:text-[var(--text)]"
          aria-label="Dismiss banner"
        >
          &#10005;
        </button>
      </div>
    </div>
  );
}
