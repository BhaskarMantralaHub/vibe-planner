'use client';

import { useState } from 'react';
import { Share2 } from 'lucide-react';
import ShareButton from './ShareButton';
import CricketFab from './CricketFab';

/**
 * Floating action button for sharing season stats / standings.
 * Replaces the previous "Share" tab in the bottom-pill nav — Share is an
 * action (opens a sheet), not a navigation tab, so it belongs as a FAB
 * anchored above the pill.
 *
 * Placement/size/colour all come from CricketFab so this matches the Add
 * buttons on Matches, Umpiring and Moments. It used to sit at z-50, which put
 * it on top of open modal overlays.
 */
export default function ShareFab() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <CricketFab onClick={() => setOpen(true)} label="Share">
        <Share2 size={24} strokeWidth={2.25} />
      </CricketFab>

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
