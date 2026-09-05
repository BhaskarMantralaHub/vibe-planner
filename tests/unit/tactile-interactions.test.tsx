import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { RefreshButton } from '@/components/ui/refresh-button';
import { useAsyncAction } from '@/hooks/use-async-action';
import { __resetHapticThrottle } from '@/lib/haptics';

/**
 * The tactile layer's job is to be additive. Every test here is really asking
 * the same question: does the app still work exactly as it did when the
 * vibration never happens?
 *
 * That is the common case, not the edge case — no iOS browser implements the
 * Vibration API, so for a large share of this team's phones every haptic in
 * the app is a silent no-op.
 */

const originalNavigator = globalThis.navigator;

function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

/** An Android-like navigator that keeps the bits userEvent needs. */
function withVibrate(vibrate: ReturnType<typeof vi.fn>) {
  setNavigator(
    Object.assign(Object.create(Object.getPrototypeOf(originalNavigator)), originalNavigator, {
      vibrate,
    }),
  );
}

let vibrate: ReturnType<typeof vi.fn>;

beforeEach(() => {
  __resetHapticThrottle();
  vibrate = vi.fn().mockReturnValue(true);
  withVibrate(vibrate);
});

afterEach(() => {
  setNavigator(originalNavigator);
  vi.restoreAllMocks();
});

describe('Button — haptics are opt-in and never load-bearing', () => {
  it('performs its action when haptics are entirely unavailable', async () => {
    // The iOS case, and the reason haptics can never gate behaviour.
    setNavigator(
      Object.assign(Object.create(Object.getPrototypeOf(originalNavigator)), originalNavigator, {
        vibrate: undefined,
      }),
    );
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button haptic="light" onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not vibrate unless a pattern was asked for', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button onClick={onClick}>Cancel</Button>);

    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClick).toHaveBeenCalledTimes(1);
    // The whole "don't haptic everything" rule, asserted: a plain Button is
    // silent. If this ever fails, every button in the app has started buzzing.
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('vibrates with the requested pattern AND still calls onClick', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button haptic="medium" onClick={onClick}>Revoke</Button>);

    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(vibrate).toHaveBeenCalledWith(18);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT vibrate a disabled button', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button haptic="light" disabled onClick={onClick}>Save</Button>);

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does NOT vibrate a loading button (disabled by another name)', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button haptic="light" loading onClick={onClick}>Saving</Button>);

    await user.click(screen.getByRole('button', { name: /Saving/ }));
    expect(onClick).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('does NOT vibrate on focus or hover — only on activation', async () => {
    const user = userEvent.setup();
    render(<Button haptic="light">Save</Button>);
    const btn = screen.getByRole('button', { name: 'Save' });

    await user.hover(btn);
    act(() => btn.focus());
    await user.tab();

    expect(vibrate).not.toHaveBeenCalled();
  });

  it('still activates from the KEYBOARD, and that counts as activation', async () => {
    const onClick = vi.fn();
    const user = userEvent.setup();
    render(<Button haptic="light" onClick={onClick}>Save</Button>);

    act(() => screen.getByRole('button', { name: 'Save' }).focus());
    await user.keyboard('{Enter}');

    // Keyboard activation dispatches click, so behaviour is preserved. The
    // haptic riding along is correct: this is a real activation, not a focus.
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('keeps the press animation in the base class regardless of haptics', () => {
    render(<Button>Save</Button>);
    // Transform-based, so it cannot reflow neighbours.
    expect(screen.getByRole('button').className).toContain('active:scale-[0.97]');
  });

  it('does not leak the haptic prop onto the DOM', () => {
    render(<Button haptic="success">Save</Button>);
    expect(screen.getByRole('button').getAttribute('haptic')).toBeNull();
  });

  it('preserves asChild — a slotted link still navigates and can buzz', async () => {
    const user = userEvent.setup();
    render(
      <Button asChild haptic="light">
        <a href="#x">Go</a>
      </Button>,
    );
    const link = screen.getByRole('link', { name: 'Go' });
    expect(link.tagName).toBe('A');
    await user.click(link);
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('keeps type=submit working inside a form', async () => {
    const onSubmit = vi.fn((e: React.FormEvent) => e.preventDefault());
    const user = userEvent.setup();
    render(
      <form onSubmit={onSubmit}>
        <Button type="submit" haptic="light">Submit</Button>
      </form>,
    );
    await user.click(screen.getByRole('button', { name: 'Submit' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });
});

describe('reduced motion', () => {
  it('does not break interaction when the viewer prefers reduced motion', async () => {
    // The durations are zeroed by CSS custom properties at :root, so nothing
    // in JS branches on this — which is exactly what makes it safe. This test
    // pins that: a reduced-motion viewer still gets a working control.
    (window.matchMedia as unknown as ReturnType<typeof vi.fn>).mockImplementation(
      (query: string) => ({
        matches: query.includes('prefers-reduced-motion'),
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      }),
    );

    const onChange = vi.fn();
    const onClick = vi.fn();
    const user = userEvent.setup();

    render(
      <>
        <Button haptic="light" onClick={onClick}>Save</Button>
        <SegmentedControl
          options={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]}
          active="a"
          onChange={onChange}
        />
      </>,
    );

    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(onChange).toHaveBeenCalledWith('b');

    // Haptics deliberately survive reduced motion: with the animation gone it
    // is the ONLY feedback channel left, so suppressing it too would leave a
    // reduced-motion viewer with no confirmation at all.
    expect(vibrate).toHaveBeenCalled();
  });
});

describe('SegmentedControl', () => {
  it('vibrates only when the selection actually moves', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <SegmentedControl
        options={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]}
        active="a"
        onChange={onChange}
      />,
    );

    // Re-tapping the active segment is a no-op, and a no-op that vibrates
    // teaches people the buzz means nothing.
    await user.click(screen.getByRole('tab', { name: 'A' }));
    expect(onChange).toHaveBeenCalledWith('a');
    expect(vibrate).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'B' }));
    expect(vibrate).toHaveBeenCalledWith(8);
  });

  it('keeps aria-selected on the active tab', () => {
    render(
      <SegmentedControl
        options={[{ key: 'a', label: 'A' }, { key: 'b', label: 'B' }]}
        active="b"
        onChange={vi.fn()}
      />,
    );
    expect(screen.getByRole('tab', { name: 'B' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('tab', { name: 'A' })).toHaveAttribute('aria-selected', 'false');
  });
});

describe('useAsyncAction — success is only ever reported after success', () => {
  function Probe({ action, onError }: { action: () => Promise<void>; onError?: (e: unknown) => void }) {
    const a = useAsyncAction(action, { resetAfterMs: 0, onError });
    return (
      <>
        <button onClick={() => void a.run()}>Go</button>
        <span data-testid="status">{a.status}</span>
      </>
    );
  }

  it('shows pending while in flight and success only once resolved', async () => {
    let resolve!: () => void;
    const action = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const user = userEvent.setup();
    render(<Probe action={action} />);

    await user.click(screen.getByRole('button', { name: 'Go' }));

    // The action started immediately — nothing waits on an animation.
    expect(action).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status').textContent).toBe('pending');
    // Crucially NOT success yet.
    expect(vibrate).toHaveBeenCalledTimes(1);   // the tap only
    expect(vibrate).toHaveBeenCalledWith(10);

    // The 30ms rate limiter is a safety valve against a runaway caller, not
    // the behaviour under test here — a real tap and a server round-trip are
    // never 30ms apart. Cleared so this case cannot flake on machine speed.
    __resetHapticThrottle();
    await act(async () => { resolve(); });

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('success'));
    expect(vibrate).toHaveBeenLastCalledWith([9, 45, 14]);
  });

  it('does NOT show a success state when the action rejects', async () => {
    const onError = vi.fn();
    const action = vi.fn(() => Promise.reject(new Error('server said no')));
    const user = userEvent.setup();
    render(<Probe action={action} onError={onError} />);

    await user.click(screen.getByRole('button', { name: 'Go' }));

    await waitFor(() => expect(screen.getByTestId('status').textContent).toBe('error'));
    expect(onError).toHaveBeenCalledTimes(1);
    // Only the tap fired. No success pattern for a failed operation, and no
    // haptic for the failure either — a buzz is a reward signal.
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });

  it('absorbs the rejection so a control wired to run() cannot throw', async () => {
    const user = userEvent.setup();
    render(<Probe action={() => Promise.reject(new Error('boom'))} />);
    await expect(
      user.click(screen.getByRole('button', { name: 'Go' })),
    ).resolves.not.toThrow();
  });

  it('ignores a double-tap while the first run is still in flight', async () => {
    let resolve!: () => void;
    const action = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const user = userEvent.setup();
    render(<Probe action={action} />);

    const go = screen.getByRole('button', { name: 'Go' });
    await user.click(go);
    await user.click(go);

    // A ref guard, not state — state is a render behind, so two taps inside
    // one frame would otherwise both get through.
    expect(action).toHaveBeenCalledTimes(1);
    await act(async () => { resolve(); });
  });

  it('returns to idle after the reset window', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      function Timed() {
        const a = useAsyncAction(async () => {}, { resetAfterMs: 1000 });
        return (
          <>
            <button onClick={() => void a.run()}>Go</button>
            <span data-testid="status">{a.status}</span>
          </>
        );
      }
      render(<Timed />);
      await act(async () => {
        screen.getByRole('button', { name: 'Go' }).click();
      });
      expect(screen.getByTestId('status').textContent).toBe('success');

      await act(async () => { vi.advanceTimersByTime(1000); });
      expect(screen.getByTestId('status').textContent).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not leave a timer running after unmount', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const clearSpy = vi.spyOn(globalThis, 'clearTimeout');
      function Timed() {
        const a = useAsyncAction(async () => {}, { resetAfterMs: 5000 });
        return <button onClick={() => void a.run()}>Go</button>;
      }
      const { unmount } = render(<Timed />);
      await act(async () => {
        screen.getByRole('button', { name: 'Go' }).click();
      });
      unmount();
      expect(clearSpy).toHaveBeenCalled();
      // Nothing should throw when the window would have elapsed.
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('RefreshButton — three real states', () => {
  it('spins while refreshing, then shows a tick only on success', async () => {
    let resolve!: () => void;
    const onRefresh = vi.fn(() => new Promise<void>((r) => { resolve = r; }));
    const user = userEvent.setup();
    const { container } = render(<RefreshButton onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(container.querySelector('.animate-spin')).not.toBeNull();
    expect(container.querySelector('.animate-tactile-check')).toBeNull();

    await act(async () => { resolve(); });
    await waitFor(() =>
      expect(container.querySelector('.animate-tactile-check')).not.toBeNull(),
    );
  });

  it('shows NO tick when the refresh fails', async () => {
    const onRefresh = vi.fn(() => Promise.reject(new Error('offline')));
    const user = userEvent.setup();
    const { container } = render(<RefreshButton onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));

    await waitFor(() => expect(container.querySelector('.animate-spin')).toBeNull());
    expect(container.querySelector('.animate-tactile-check')).toBeNull();
  });

  it('works when haptics are unavailable', async () => {
    setNavigator(
      Object.assign(Object.create(Object.getPrototypeOf(originalNavigator)), originalNavigator, {
        vibrate: undefined,
      }),
    );
    const onRefresh = vi.fn(() => Promise.resolve());
    const user = userEvent.setup();
    render(<RefreshButton onRefresh={onRefresh} />);

    await user.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalledTimes(1);
  });
});

describe('a stateful control keeps working end to end', () => {
  // Guards the shape of the Copy → ✓ Copied pattern used on the Admin panel
  // and both settlement surfaces, without reaching for Supabase.
  function CopyProbe() {
    const [copied, setCopied] = useState(false);
    const a = useAsyncAction(
      async () => { setCopied(true); },
      { successHaptic: null, resetAfterMs: 0 },
    );
    return (
      <button onClick={() => void a.run()}>{copied ? 'Copied' : 'Copy invite link'}</button>
    );
  }

  it('swaps its label only after the write resolves', async () => {
    const user = userEvent.setup();
    render(<CopyProbe />);
    await user.click(screen.getByRole('button', { name: 'Copy invite link' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Copied' })).toBeTruthy());
    // One tap tick, and no success double-tick stacked on top of it.
    expect(vibrate).toHaveBeenCalledTimes(1);
    expect(vibrate).toHaveBeenCalledWith(10);
  });
});
