import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { haptic, canVibrate, cancelHaptic, __resetHapticThrottle } from '@/lib/haptics';

/**
 * The contract these tests defend is "never breaks anything, anywhere".
 *
 * Haptics reach a population where the API mostly does NOT exist — every iOS
 * browser, and every desktop browser without a motor. So the important
 * assertions here are the negative ones: no throw, no crash, and a falsy
 * return that a caller could not mistake for a failure worth reporting.
 */

const originalNavigator = globalThis.navigator;

/** jsdom's `navigator` is non-configurable in places, so replace wholesale. */
function setNavigator(value: unknown) {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('lib/haptics', () => {
  beforeEach(() => {
    __resetHapticThrottle();
  });

  afterEach(() => {
    setNavigator(originalNavigator);
    vi.restoreAllMocks();
  });

  describe('when navigator is unavailable (SSR / static export prerender)', () => {
    beforeEach(() => setNavigator(undefined));

    it('does nothing and does not throw', () => {
      expect(() => haptic('light')).not.toThrow();
      expect(haptic('light')).toBe(false);
    });

    it('reports that it cannot vibrate', () => {
      expect(canVibrate()).toBe(false);
    });

    it('cancels safely', () => {
      expect(() => cancelHaptic()).not.toThrow();
    });
  });

  describe('when vibrate is unsupported (iOS Safari, iOS Chrome, most desktop)', () => {
    beforeEach(() => setNavigator({ userAgent: 'iPhone' }));

    it('does nothing and does not throw', () => {
      expect(() => haptic('success')).not.toThrow();
      expect(haptic('success')).toBe(false);
    });

    it('reports that it cannot vibrate', () => {
      expect(canVibrate()).toBe(false);
    });
  });

  describe('when vibrate is supported (Android Chrome)', () => {
    let vibrate: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      vibrate = vi.fn().mockReturnValue(true);
      setNavigator({ vibrate });
    });

    it('detects support', () => {
      expect(canVibrate()).toBe(true);
    });

    it('dispatches the expected SHORT pattern for each preset', () => {
      const seen: Record<string, unknown> = {};
      for (const pattern of ['light', 'medium', 'selection', 'success'] as const) {
        __resetHapticThrottle();
        vibrate.mockClear();
        expect(haptic(pattern)).toBe(true);
        expect(vibrate).toHaveBeenCalledTimes(1);
        seen[pattern] = vibrate.mock.calls[0][0];
      }

      expect(seen).toEqual({
        light: 10,
        medium: 18,
        selection: 8,
        success: [9, 45, 14],
      });
    });

    it('keeps every duration conservative — nothing reads as a buzz', () => {
      for (const pattern of ['light', 'medium', 'selection', 'success'] as const) {
        __resetHapticThrottle();
        vibrate.mockClear();
        haptic(pattern);
        const arg = vibrate.mock.calls[0][0] as number | number[];
        // Only the ON pulses are capped; the gap inside `success` is silence.
        const pulses = Array.isArray(arg) ? arg.filter((_, i) => i % 2 === 0) : [arg];
        for (const ms of pulses) expect(ms).toBeLessThanOrEqual(20);
      }
    });

    it('defaults to light', () => {
      haptic();
      expect(vibrate).toHaveBeenCalledWith(10);
    });

    it('rate-limits a pathological caller so a tick cannot become a hum', () => {
      expect(haptic('light')).toBe(true);
      // A second call inside the throttle window is dropped — this is the
      // guard against a haptic wired into a scroll or effect loop.
      expect(haptic('light')).toBe(false);
      expect(vibrate).toHaveBeenCalledTimes(1);
    });

    it('swallows a throw from vibrate (no user activation, hostile impl)', () => {
      setNavigator({ vibrate: vi.fn(() => { throw new Error('needs user gesture'); }) });
      expect(() => haptic('light')).not.toThrow();
      expect(haptic('medium')).toBe(false);
    });

    it('does not record a fire when the browser refuses, so the next tap still tries', () => {
      const refusing = vi.fn().mockReturnValue(false);
      setNavigator({ vibrate: refusing });
      expect(haptic('light')).toBe(false);
      expect(haptic('light')).toBe(false);
      expect(refusing).toHaveBeenCalledTimes(2);
    });

    it('cancels with 0', () => {
      cancelHaptic();
      expect(vibrate).toHaveBeenCalledWith(0);
    });
  });
});
