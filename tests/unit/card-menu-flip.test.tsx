import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useRef, useState, useEffect } from 'react';
import { CardMenu, type CardMenuItem } from '@/components/ui/card-menu';

/**
 * Regression tests for the CardMenu vertical flip.
 *
 * The popover used to position itself at `anchor.bottom + 4` unconditionally,
 * so a ⋮ menu on a row near the bottom of a phone screen opened OFF-SCREEN.
 * It now measures (44px per row) and flips above the anchor when opening
 * downward would overflow the viewport.
 */

const ITEMS: CardMenuItem[] = [
  { label: 'Edit', icon: null, color: 'var(--text)', onClick: vi.fn() },
  { label: 'Details', icon: null, color: 'var(--muted)', onClick: vi.fn() },
  { label: 'Delete', icon: null, color: 'var(--red)', onClick: vi.fn(), dividerBefore: true },
];

// Host that anchors the menu to a button whose rect we control.
function Host({ anchorTop, anchorBottom }: { anchorTop: number; anchorBottom: number }) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (btnRef.current) {
      vi.spyOn(btnRef.current, 'getBoundingClientRect').mockReturnValue({
        top: anchorTop,
        bottom: anchorBottom,
        left: 100,
        right: 140,
        width: 40,
        height: anchorBottom - anchorTop,
        x: 100,
        y: anchorTop,
        toJSON: () => ({}),
      } as DOMRect);
      setReady(true);
    }
  }, [anchorTop, anchorBottom]);

  return (
    <>
      <button ref={btnRef}>anchor</button>
      {ready && <CardMenu anchorRef={btnRef} items={ITEMS} onClose={vi.fn()} />}
    </>
  );
}

function menuTop(): number {
  // Structure: panel > per-item div > button. The panel carries the inline top.
  const btn = screen.getByRole('button', { name: 'Edit' });
  const panel = btn.parentElement!.parentElement as HTMLElement;
  return parseFloat(panel.style.top);
}

describe('CardMenu flip', () => {
  // jsdom window.innerHeight = 768. 3 items → estimatedHeight = 3*44 + 8 = 140.

  it('opens below the anchor when there is room', () => {
    render(<Host anchorTop={70} anchorBottom={100} />);
    // 100 + 4 + 140 = 244 < 760 → no flip
    expect(menuTop()).toBe(104);
  });

  it('flips above the anchor near the bottom of the viewport', () => {
    render(<Host anchorTop={670} anchorBottom={700} />);
    // 700 + 4 + 140 = 844 > 760 → flip: 670 - 4 - 140 = 526
    expect(menuTop()).toBe(526);
  });

  it('never positions above the top edge', () => {
    // Anchor crammed at the bottom with a tall viewport overflow — the flip
    // clamps at 8px rather than going negative.
    Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 160 });
    try {
      render(<Host anchorTop={100} anchorBottom={130} />);
      // 130 + 4 + 140 > 152 → flip: max(8, 100 - 4 - 140) = 8
      expect(menuTop()).toBe(8);
    } finally {
      Object.defineProperty(window, 'innerHeight', { writable: true, configurable: true, value: 768 });
    }
  });
});
