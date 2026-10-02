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
 *    guess.** That token owns the safe-area maths in globals.css.
 *
 * 2. **z-30, deliberately below every overlay.** Dialog, Drawer,
 *    ComposerModal and the menu all sit at z-40+, so a FAB can never float
 *    on top of an open modal.
 *
 * 3. **One colour.** The solid brand fill, always — Moments used to render a
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
      className="fixed right-4 z-30 flex h-14 w-14 items-center justify-center rounded-full transition-transform active:scale-95"
      style={{
        bottom: 'var(--cricket-fab-bottom)',
        // Solid brand fill; --cricket-on is the glyph colour on it.
        background: 'var(--cricket)',
        color: 'var(--cricket-on)',
        // Neutral lift, not a coloured glow: the fill already says "brand".
        boxShadow: '0 6px 18px rgba(0,0,0,0.16), 0 2px 6px rgba(0,0,0,0.10)',
      }}
    >
      {children}
    </button>
  );
}
