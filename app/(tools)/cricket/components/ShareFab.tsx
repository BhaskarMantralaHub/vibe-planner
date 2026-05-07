'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareButton from './ShareButton';

/**
 * Floating action button for sharing season stats / standings.
 * Replaces the previous "Share" tab in the bottom-pill nav — Share is an
 * action (opens a sheet), not a navigation tab, so it belongs as a FAB
 * anchored above the pill.
 */
export default function ShareFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        aria-label="Share"
        onClick={() => setOpen(true)}
        className="fixed right-4 z-50 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
        style={{
          bottom: 'calc(max(1.5rem, env(safe-area-inset-bottom)) + 5rem)',
          background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
          boxShadow: '0 10px 28px color-mix(in srgb, var(--cricket) 40%, transparent), 0 4px 10px rgba(0,0,0,0.15)',
        }}
      >
        <Share2 size={22} strokeWidth={2.25} />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40 bg-black/40 animate-fade-in" onClick={() => setOpen(false)} />
          <div
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-2xl p-5 pb-8 animate-[slideUp_0.2s]"
            style={{ background: 'var(--card)', border: '1px solid var(--border)' }}
          >
            <div className="flex justify-center mb-4">
              <div className="w-10 h-1 rounded-full" style={{ background: 'var(--border)' }} />
            </div>
            <ShareButton />
          </div>
        </>
      )}
    </>
  );
}
