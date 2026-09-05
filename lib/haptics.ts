/**
 * Haptic feedback — the one place vibration patterns are defined.
 *
 * This is PROGRESSIVE ENHANCEMENT and nothing else. Every call is a no-op on
 * hardware or browsers that cannot vibrate, which today is most of them:
 *
 *   - iOS Safari / iOS Chrome / any iOS browser: `navigator.vibrate` does not
 *     exist at all (WebKit has never shipped the Vibration API, and on iOS
 *     every browser is WebKit). So on iPhone the tactile layer is carried
 *     entirely by the press animation, and that is fine — it is the reason
 *     the animation is not allowed to depend on haptics landing.
 *   - Android Chrome / Firefox / Samsung Internet: supported, and this is
 *     where the vibration is actually felt.
 *   - Desktop: `vibrate` may EXIST while there is no vibration motor, in
 *     which case the call silently does nothing. That is the correct outcome,
 *     so it is not worth trying to detect.
 *
 * Consequently a caller must NEVER branch on the return value to decide
 * whether to perform the action, and must never surface a failure to the
 * user. `haptic()` returns a boolean only so tests can assert dispatch.
 *
 * WHY A MODULE AND NOT AN INLINE navigator.vibrate CALL: patterns kept in one
 * table stay consistent and stay conservative. Durations invented per call
 * site is how an app ends up with a 200ms buzz on a filter chip.
 */

/** The complete vocabulary. Deliberately small — see `docs/DESIGN_SYSTEM.md`. */
export type HapticPattern = 'light' | 'medium' | 'selection' | 'success';

/**
 * Durations in milliseconds, as either a single pulse or an
 * on/off/on sequence.
 *
 * These are SHORT on purpose. A phone motor takes a few ms to spin up, so
 * ~8-10ms reads as a crisp tick while ~30ms+ already reads as a buzz. The
 * ceiling here is 18ms for a single pulse; anything longer stops feeling like
 * feedback and starts feeling like a notification.
 */
const PATTERNS: Record<HapticPattern, number | number[]> = {
  /** Tap on a primary action — Save, Confirm, Copy, Share. */
  light: 10,
  /** Meaningful or destructive commitment — Revoke, Delete, Refresh a link. */
  medium: 18,
  /** Picking one of a set — segmented control, season row, filter, toggle. */
  selection: 8,
  /**
   * An operation SUCCEEDED. Two quick ticks with a short gap, which reads as
   * "done" rather than as a single "registered". The gap is what carries the
   * meaning, so it is not collapsible into one longer pulse.
   */
  success: [9, 45, 14],
};

/**
 * Rate limit. `navigator.vibrate` replaces any in-flight pattern rather than
 * queueing, so ordinary fast tapping is already self-limiting — this exists
 * to stop a pathological caller (a haptic wired into a scroll or resize
 * handler, an effect that re-fires each render) from turning a tick into a
 * continuous hum. 30ms still allows deliberate fast tapping to feel per-tap.
 */
const MIN_INTERVAL_MS = 30;
let lastFiredAt = 0;

/** Feature detection, safe during SSR/static export where `navigator` is undefined. */
export function canVibrate(): boolean {
  return (
    typeof navigator !== 'undefined'
    && typeof (navigator as Navigator).vibrate === 'function'
  );
}

/**
 * Fire a haptic pattern. Safe to call anywhere, including during SSR.
 *
 * @returns whether a vibration was actually dispatched. For tests and
 *          diagnostics only — never gate UI behaviour on this.
 */
export function haptic(pattern: HapticPattern = 'light'): boolean {
  if (!canVibrate()) return false;

  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  if (now - lastFiredAt < MIN_INTERVAL_MS) return false;

  try {
    // Some browsers throw (rather than return false) when called without a
    // user activation, or reject a malformed pattern. A thrown error here must
    // never reach the click handler that asked for the haptic.
    const fired = navigator.vibrate(PATTERNS[pattern]);
    if (fired) lastFiredAt = now;
    return fired;
  } catch {
    return false;
  }
}

/** Cancel any in-flight vibration. Used when a view unmounts mid-pattern. */
export function cancelHaptic(): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(0);
  } catch {
    /* nothing to report — see the module note */
  }
}

/** Test seam: reset the rate-limiter between cases. Not for app code. */
export function __resetHapticThrottle(): void {
  lastFiredAt = 0;
}
