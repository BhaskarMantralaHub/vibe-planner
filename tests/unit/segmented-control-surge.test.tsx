import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { useState } from 'react';
import { SegmentedControl, type SegmentOption } from '@/components/ui/segmented-control';

/**
 * The travelling surface in SegmentedControl STRETCHES toward the tab you
 * tapped: its leading edge leaves on the fast duration, its trailing edge hangs
 * on the slow one, and the gap between the two timings IS the stretch. There is
 * no keyframe and no measurement — which means the whole effect lives in two
 * strings, and a silent swap of those two strings is invisible in review and
 * near-invisible on screen (it just looks slightly wrong).
 *
 * So the thing worth pinning is the ASYMMETRY and its DIRECTION:
 *
 *  • Move right → the RIGHT edge is the head. Get this backwards and the
 *    surface stretches away from the tab you tapped, reading as recoil.
 *  • The glow lags on BOTH edges, which is what makes it a trail rather than
 *    a halo that travels in lockstep with the surface.
 *  • Under reduced motion the glow must not render at all — its opacity is
 *    driven by a JS timer, so unlike the edges it cannot be switched off by
 *    the zeroed `--duration-*` tokens in globals.css.
 */

const OPTIONS: SegmentOption[] = [
  { key: 'a', label: 'A' },
  { key: 'b', label: 'B' },
  { key: 'c', label: 'C' },
];

const HEAD = 'var(--duration-slow)';
const TAIL = 'var(--duration-slower)';

/** The tablist's aria-hidden children, in paint order: glow (when present),
 *  then the surface. Queried structurally because neither is reachable by
 *  role — they are decoration and are correctly hidden from the a11y tree. */
function decorations(): HTMLElement[] {
  const rail = screen.getByRole('tablist');
  return Array.from(rail.querySelectorAll<HTMLElement>(':scope > [aria-hidden="true"]'));
}

function surface(): HTMLElement {
  const d = decorations();
  return d[d.length - 1];
}

/**
 * How far along the rail an edge sits, as a fraction of the track.
 *
 * Read as a NUMBER rather than string-matched, because jsdom re-serialises the
 * authored `calc(4px + (100% - 8px) * 1 / 3)` into the equivalent
 * `calc(4px + 0.333… * (100% - 8px))`. Both forms are accepted so this keeps
 * testing the geometry rather than one engine's serialiser.
 */
function fraction(value: string): number {
  const collapsed = value.match(/^calc\(4px \+ ([\d.]+) ?\* ?\(100% - 8px\)\)$/);
  if (collapsed) return Number(collapsed[1]);
  const authored = value.match(/^calc\(4px \+ \(100% - 8px\) \* (\d+) \/ (\d+)\)$/);
  if (authored) return Number(authored[1]) / Number(authored[2]);
  throw new Error(`unrecognised edge value: ${value}`);
}

/** Which properties a transition list assigns the given duration token to. */
function edgeWith(el: HTMLElement, duration: string): string[] {
  return el.style.transition
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.includes(duration))
    .map((part) => part.split(/\s+/)[0]);
}

/** A host that owns the selection, so a click really re-renders the control
 *  the way a real screen does. The controlled `active` prop is the only input
 *  the surge reads — it derives direction by comparing renders. */
function Host({ initial = 'a' }: { initial?: string }) {
  const [active, setActive] = useState(initial);
  return <SegmentedControl options={OPTIONS} active={active} onChange={setActive} ariaLabel="View" />;
}

function reduceMotion(matches: boolean) {
  (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation((query: string) => ({
    matches: query.includes('reduced-motion') ? matches : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

afterEach(() => {
  reduceMotion(false);
  vi.useRealTimers();
});

describe('SegmentedControl surge — geometry', () => {
  it('places both edges from the cell count, with no measurement', () => {
    render(<Host initial="b" />);
    // Middle of three: one whole cell on each side of the 4px-inset track.
    expect(fraction(surface().style.left)).toBeCloseTo(1 / 3, 5);
    expect(fraction(surface().style.right)).toBeCloseTo(1 / 3, 5);
  });

  it('pins the first and last cells flush to the rail inset', () => {
    render(<Host initial="a" />);
    // Left edge sits ON the 4px inset; the right edge leaves two cells clear.
    expect(fraction(surface().style.left)).toBe(0);
    expect(fraction(surface().style.right)).toBeCloseTo(2 / 3, 5);
  });

  it('renders nothing when no option matches the active key', () => {
    render(<SegmentedControl options={OPTIONS} active="missing" onChange={vi.fn()} />);
    expect(decorations()).toHaveLength(0);
  });
});

describe('SegmentedControl surge — direction', () => {
  it('leads with the right edge when the selection moves right', () => {
    render(<Host initial="a" />);
    act(() => screen.getByRole('tab', { name: 'C' }).click());

    expect(edgeWith(surface(), HEAD)).toEqual(['right']);
    expect(edgeWith(surface(), TAIL)).toEqual(['left']);
  });

  it('leads with the left edge when the selection moves left', () => {
    render(<Host initial="c" />);
    act(() => screen.getByRole('tab', { name: 'A' }).click());

    expect(edgeWith(surface(), HEAD)).toEqual(['left']);
    expect(edgeWith(surface(), TAIL)).toEqual(['right']);
  });

  it('keeps the two edges on different durations — the stretch is the gap', () => {
    render(<Host initial="a" />);
    act(() => screen.getByRole('tab', { name: 'B' }).click());

    const head = edgeWith(surface(), HEAD);
    const tail = edgeWith(surface(), TAIL);
    expect(head).toHaveLength(1);
    expect(tail).toHaveLength(1);
    expect(head[0]).not.toBe(tail[0]);
  });
});

describe('SegmentedControl surge — the trail', () => {
  it('lights the glow on a move and puts it out once the surface settles', () => {
    vi.useFakeTimers();
    render(<Host initial="a" />);

    const glow = decorations()[0];
    expect(glow.style.opacity).toBe('0');

    act(() => screen.getByRole('tab', { name: 'B' }).click());
    expect(decorations()[0].style.opacity).toBe('1');

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(decorations()[0].style.opacity).toBe('0');
  });

  it('restarts the glow timer when a second tap lands mid-flight', () => {
    vi.useFakeTimers();
    render(<Host initial="a" />);

    act(() => screen.getByRole('tab', { name: 'B' }).click());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // Second tap with 100ms left on the first timer.
    act(() => screen.getByRole('tab', { name: 'C' }).click());
    act(() => {
      vi.advanceTimersByTime(400);
    });
    // The original deadline has passed; the glow must still be lit.
    expect(decorations()[0].style.opacity).toBe('1');

    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(decorations()[0].style.opacity).toBe('0');
  });

  it('lags the glow on BOTH edges so it trails rather than travels', () => {
    render(<Host initial="a" />);
    act(() => screen.getByRole('tab', { name: 'C' }).click());

    const glow = decorations()[0];
    expect(edgeWith(glow, TAIL).sort()).toEqual(['left', 'right']);
    // The fast token is spent on the fade, never on an edge — a glow with a
    // head edge would arrive with the surface and read as a halo, not a trail.
    expect(edgeWith(glow, HEAD)).toEqual(['opacity']);
  });

  it('does not render the glow under reduced motion', () => {
    reduceMotion(true);
    render(<Host initial="a" />);
    // Surface only — the glow's opacity is timer-driven, so unlike the edge
    // durations it cannot be zeroed by the tokens in globals.css.
    expect(decorations()).toHaveLength(1);
    expect(surface().style.background).toContain('color-mix');
  });
});
