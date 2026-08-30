'use client';

import type { ReactNode } from 'react';

/**
 * The one floating action button for the cricket app.
 *
 * Every cricket screen with a primary create/share action uses this, so the
 * button lands in the same place, at the same size, in the same colour, on
 * every page. Before this existed the four call sites (Home share, Matches
 * add, Umpiring add duty, Moments new post) had drifted into four different
 * buttons: two sizes, two colours, two vertical offsets 28px apart, and three
 * z-indexes — one of which put the button *behind* the nav pill.
 *
 * Three rules this component exists to hold:
 *
 * 1. **Vertical position comes from --cricket-fab-bottom, never a local
 *    guess.** That token is derived from the nav pill's real geometry in
 *    globals.css. The old hand-computed `60px + safe + 16px` cleared the pill
 *    by 2px on an iPhone — visually touching it.
 *
 * 2. **z-30, deliberately below every overlay.** Dialog, Drawer and
 *    ComposerModal all sit at z-40+, so a FAB can never float on top of an
 *    open modal. It does not need to out-rank the nav (z-40) because correct
 *    geometry already keeps them apart; racing the nav on z-index would only
 *    hide the bug of them overlapping.
 *
 * 3. **One colour.** The cricket gradient, always — Moments used to render a
 *    near-black button from var(--text), which read as a different app.
 */
interface CricketFabProps {
  /** Fires on tap. */
  onClick: () => void;
  /**
   * Screen-reader name and the action's plain-language label, e.g. "Add duty".
   * Required — an icon-only button is unusable without it.
   */
  label: string;
  /** Icon element, sized by the caller (24px is the house size). */
  children: ReactNode;
}

export default function CricketFab({ onClick, label, children }: CricketFabProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg transition-transform active:scale-95"
      style={{
        bottom: 'var(--cricket-fab-bottom)',
        background: 'linear-gradient(135deg, var(--cricket), var(--cricket-accent))',
        boxShadow:
          '0 10px 28px color-mix(in srgb, var(--cricket) 40%, transparent), 0 4px 10px rgba(0,0,0,0.15)',
      }}
    >
      {children}
    </button>
  );
}
