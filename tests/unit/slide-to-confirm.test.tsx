import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SlideToConfirm } from '@/components/ui/slide-to-confirm';

/**
 * SlideToConfirm guards the one irreversible action on the schedule screen
 * (permanent delete), so the behaviours worth pinning are the safeguard
 * itself:
 *
 *  • A short drag must NOT fire — the thumb springs back and nothing is
 *    confirmed. If this regresses, the control is just a wide button.
 *  • A drag to the end fires onConfirm exactly once, even if the pointer
 *    keeps moving afterwards.
 *  • The keyboard path (Enter on the focused thumb) fires too — the drag
 *    must never be the only way to confirm.
 *
 * jsdom reports clientWidth as 0, which would make the travel distance 0
 * and every drag "complete", so the track width is stubbed to 300px
 * (travel = 300 − 44 thumb − 8 padding = 248px; threshold ≈ 228px).
 */

const TRACK_WIDTH = 300;

function renderControl(onConfirm = vi.fn()) {
  const utils = render(<SlideToConfirm label="Slide to delete forever" onConfirm={onConfirm} />);
  const thumb = screen.getByRole('button', { name: /slide to delete forever/i });
  const track = thumb.parentElement as HTMLElement;
  Object.defineProperty(track, 'clientWidth', { configurable: true, value: TRACK_WIDTH });
  // jsdom has no pointer capture; the component calls it on the thumb.
  (thumb as unknown as { setPointerCapture: () => void }).setPointerCapture = () => {};
  return { ...utils, thumb, onConfirm };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SlideToConfirm', () => {
  it('does not fire on a short drag — it springs back', () => {
    const { thumb, onConfirm } = renderControl();
    fireEvent.pointerDown(thumb, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(thumb, { pointerId: 1, clientX: 100 }); // ~40% of travel
    fireEvent.pointerUp(thumb, { pointerId: 1, clientX: 100 });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(thumb.style.transform).toBe('translateX(0px)');
  });

  it('fires exactly once when dragged to the end', () => {
    const { thumb, onConfirm } = renderControl();
    fireEvent.pointerDown(thumb, { pointerId: 1, clientX: 0 });
    fireEvent.pointerMove(thumb, { pointerId: 1, clientX: 240 }); // past the 92% threshold
    fireEvent.pointerMove(thumb, { pointerId: 1, clientX: 248 });
    fireEvent.pointerUp(thumb, { pointerId: 1, clientX: 248 });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('fires from the keyboard with Enter', () => {
    const { thumb, onConfirm } = renderControl();
    fireEvent.keyDown(thumb, { key: 'Enter' });
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('does not fire when disabled', () => {
    const onConfirm = vi.fn();
    render(<SlideToConfirm label="Slide to delete forever" onConfirm={onConfirm} disabled />);
    const thumb = screen.getByRole('button', { name: /slide to delete forever/i });
    fireEvent.keyDown(thumb, { key: 'Enter' });
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
