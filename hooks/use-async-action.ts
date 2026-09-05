'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { haptic, type HapticPattern } from '@/lib/haptics';

/**
 * One tap → one async operation → a state that tells the truth about it.
 *
 * The whole point of this hook is the ORDERING, which every hand-rolled
 * `copied`/`refreshing` pair in this repo got subtly differently:
 *
 *   1. the tap haptic fires IMMEDIATELY, before any awaiting, so the control
 *      feels answered at the moment of contact;
 *   2. the action starts immediately too — nothing waits on an animation;
 *   3. `success` (and the success haptic) happen ONLY after the promise
 *      resolves. Never optimistically. A copy that failed, a link that did
 *      not rotate, a fee that did not save must not show a green check;
 *   4. a rejection lands on `error`, which is a DIFFERENT state, not a
 *      quietly-successful one.
 *
 * THE TRAP THIS EXISTS TO CLOSE: a call site that try/catches internally and
 * toasts its own error returns a RESOLVED promise, so the hook would report
 * success for a failed operation. Such call sites must let the error
 * propagate and pass `onError` instead. That is why `onError` exists rather
 * than leaving error reporting to the caller's own catch block.
 *
 * Rejections are absorbed (not re-thrown) so a control wired directly to
 * `run` cannot produce an unhandled rejection; `error` carries the reason.
 */

export type AsyncActionStatus = 'idle' | 'pending' | 'success' | 'error';

interface UseAsyncActionOptions {
  /**
   * Haptic on activation. Defaults to 'light'.
   * Pass `null` for a control that should animate but not vibrate.
   */
  tapHaptic?: HapticPattern | null;
  /**
   * Haptic once the operation has actually succeeded. Defaults to 'success'.
   * Pass `null` where a second buzz right after the tap would be noise —
   * a copy button that completes in under a frame, for instance.
   */
  successHaptic?: HapticPattern | null;
  /**
   * How long `success`/`error` persist before returning to `idle`, in ms.
   * 2000 matches the existing "Copied" affordances in this codebase.
   * `0` keeps the terminal state until `reset()` is called.
   */
  resetAfterMs?: number;
  /** Called with the rejection reason. Do the toast here. */
  onError?: (error: unknown) => void;
}

export function useAsyncAction<A extends unknown[]>(
  action: (...args: A) => void | Promise<void>,
  options: UseAsyncActionOptions = {},
) {
  const {
    tapHaptic = 'light',
    successHaptic = 'success',
    resetAfterMs = 2000,
    onError,
  } = options;

  const [status, setStatus] = useState<AsyncActionStatus>('idle');
  const [error, setError] = useState<unknown>(null);

  // Refs, not deps: `run` must stay referentially stable so it can be handed
  // to a memoised child without invalidating it, while still calling the
  // latest closure. A stale `action` would submit a stale form.
  const actionRef = useRef(action);
  const onErrorRef = useRef(onError);
  actionRef.current = action;
  onErrorRef.current = onError;

  // Guards against the two ways this leaks: a timer that outlives the view,
  // and a setState after unmount (React 19 no longer warns, so it would just
  // silently do nothing — but the timer would still be pending).
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(true);
  // Reentrancy: `pending` in state is one render behind, so a double-tap
  // inside a single frame would fire the action twice. A ref is read synchronously.
  const runningRef = useRef(false);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const reset = useCallback(() => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus('idle');
    setError(null);
  }, []);

  const scheduleReset = useCallback((ms: number) => {
    if (ms <= 0) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      if (mountedRef.current) {
        setStatus('idle');
        setError(null);
      }
    }, ms);
  }, []);

  const run = useCallback(async (...args: A) => {
    if (runningRef.current) return;
    runningRef.current = true;

    // Before the await: this is the "that button responded" moment.
    if (tapHaptic) haptic(tapHaptic);

    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    setStatus('pending');
    setError(null);

    try {
      await actionRef.current(...args);
      if (!mountedRef.current) return;
      // Only here. Not a line earlier.
      if (successHaptic) haptic(successHaptic);
      setStatus('success');
      scheduleReset(resetAfterMs);
    } catch (e) {
      if (!mountedRef.current) return;
      // Deliberately no haptic on failure: a buzz is a reward signal, and
      // the error state plus the caller's toast already carry the news.
      setError(e);
      setStatus('error');
      onErrorRef.current?.(e);
      scheduleReset(resetAfterMs);
    } finally {
      runningRef.current = false;
    }
  }, [tapHaptic, successHaptic, resetAfterMs, scheduleReset]);

  return {
    run,
    status,
    error,
    pending: status === 'pending',
    succeeded: status === 'success',
    failed: status === 'error',
    reset,
  };
}

export default useAsyncAction;
