import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { RollingNumber } from '@/components/ui/rolling-number';

/** The 0-9 strips, left to right. */
function strips(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>('.roll-strip'));
}

describe('RollingNumber', () => {
  it('reads as the plain figure to assistive tech, never the digit strips', () => {
    // Step 1: render a currency figure
    const { container } = render(<RollingNumber value="$1,240.50" />);
    // Step 2: the only text not hidden from AT is the real value
    const spoken = Array.from(container.querySelectorAll('span'))
      .filter((el) => !el.closest('[aria-hidden]') && el.childElementCount === 0)
      .map((el) => el.textContent);
    expect(spoken).toEqual(['$1,240.50']);
  });

  it('parks each strip on its digit and leaves separators static', () => {
    // Step 1: render a figure with $, comma and decimal point
    const { container } = render(<RollingNumber value="$1,240.50" />);
    // Step 2: only the six digits get strips, each translated to its digit
    expect(strips(container).map((s) => s.style.transform)).toEqual(
      [1, 2, 4, 0, 5, 0].map((d) => `translateY(${-d * 100}%)`),
    );
  });

  it('keys columns from the right, so a new leading digit does not remount the rest', () => {
    // Step 1: render $9.99 and keep a handle on the cents strip
    const { container, rerender } = render(<RollingNumber value="$9.99" />);
    const centsBefore = strips(container).at(-1);
    // Step 2: roll over to $10.00, which adds a digit on the left
    rerender(<RollingNumber value="$10.00" />);
    // Step 3: the cents strip is the same element, now moved to 0 (so it animates)
    const centsAfter = strips(container).at(-1);
    expect(centsAfter).toBe(centsBefore);
    expect(centsAfter?.style.transform).toBe('translateY(0%)');
    expect(strips(container)).toHaveLength(4);
  });

  it('staggers from the right: the units lead, columns to the left follow', () => {
    // Step 1: render a three-digit figure
    const { container } = render(<RollingNumber value="123" />);
    // Step 2: delays grow right-to-left, scaled off the motion token (0ms under reduced motion)
    expect(strips(container).map((s) => s.style.transitionDelay)).toEqual([
      'calc(var(--duration-fast) * 0.7)',
      'calc(var(--duration-fast) * 0.35)',
      'calc(var(--duration-fast) * 0)',
    ]);
  });
});
