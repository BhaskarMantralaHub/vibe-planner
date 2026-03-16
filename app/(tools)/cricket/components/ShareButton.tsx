'use client';

import { useState } from 'react';
import { useCricketStore } from '@/stores/cricket-store';

export default function ShareButton() {
  const { seasons, selectedSeasonId } = useCricketStore();
  const [copied, setCopied] = useState(false);

  const season = seasons.find((s) => s.id === selectedSeasonId);
  if (!season) return null;

  const shareUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/cricket/dues/${season.share_token}`
    : '';

  const handleCopy = async () => {
    await navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-5">
      <h3 className="mb-1 text-[16px] font-semibold text-[var(--text)]">Share with Team</h3>
      <p className="mb-3 text-[13px] text-[var(--muted)]">Anyone with this link can view dues — no login required</p>
      <div className="flex gap-2">
        <div className="flex-1 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2.5 text-[13px] text-[var(--muted)] truncate">
          {shareUrl}
        </div>
        <button
          onClick={handleCopy}
          className="rounded-xl bg-gradient-to-r from-[var(--orange)] to-[var(--red)] px-4 py-2.5 text-[13px] font-medium text-white cursor-pointer hover:opacity-90 transition-all"
        >
          {copied ? 'Copied!' : 'Copy Link'}
        </button>
      </div>
    </div>
  );
}
