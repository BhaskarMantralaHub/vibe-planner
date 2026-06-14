'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { isStaleChunkError, tryRecoverFromStaleChunk, reloadForSwUpdate } from '@/lib/stale-chunk';

export function ServiceWorkerRegister() {
  useEffect(() => {
    // Recover from stale-chunk errors that escape React (a rejected dynamic
    // import surfaces as 'error' / 'unhandledrejection', not via the boundary).
    // The shared helper is self-guarding (one reload per cooldown), so there is
    // intentionally NO "clear guard on mount" here — that re-armed the guard on
    // the same load that showed the error and caused an infinite loop.
    //
    // Unlike the React boundary (which captures before its fallback renders),
    // this path has no implicit capture — so report to Sentry BEFORE reloading,
    // otherwise an auto-recovered stale-chunk error leaves zero telemetry. The
    // browser transport uses fetch keepalive, so the event survives the reload.
    const recover = (error: unknown, message: string) => {
      if (!isStaleChunkError(message)) return;
      Sentry.captureException(error ?? new Error(message));
      tryRecoverFromStaleChunk(message);
    };
    const onError = (e: ErrorEvent) => recover(e.error, e.message ?? '');
    const onRejection = (e: PromiseRejectionEvent) => {
      const reason = e.reason as { message?: string } | undefined;
      recover(e.reason, reason?.message ?? String(e.reason ?? ''));
    };
    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);

    const cleanups: Array<() => void> = [
      () => window.removeEventListener('error', onError),
      () => window.removeEventListener('unhandledrejection', onRejection),
    ];

    if ('serviceWorker' in navigator) {
      // Reload once, only AFTER a NEW worker takes control. Reloading on
      // 'statechange' raced on iOS Safari (old worker still controlling →
      // re-served stale HTML → loop). `hadController` is false on the very
      // first install (clients.claim also fires controllerchange), so we don't
      // reload a first-time visitor.
      const hadController = !!navigator.serviceWorker.controller;
      let refreshing = false;
      const onControllerChange = () => {
        if (refreshing || !hadController) return;
        refreshing = true;
        // Cooldown-guarded (persisted) so a misbehaving SW that re-activates on
        // every load can't loop independently of the in-memory `refreshing`
        // latch (which resets each load).
        reloadForSwUpdate();
      };
      navigator.serviceWorker.addEventListener('controllerchange', onControllerChange);
      cleanups.push(() =>
        navigator.serviceWorker.removeEventListener('controllerchange', onControllerChange),
      );

      navigator.serviceWorker
        .register('/sw.js')
        .then((registration) => {
          // Check for updates every 60 minutes (long-running standalone PWA).
          const interval = setInterval(() => registration.update(), 60 * 60 * 1000);
          cleanups.push(() => clearInterval(interval));

          registration.addEventListener('updatefound', () => {
            const newWorker = registration.installing;
            if (!newWorker) return;
            newWorker.addEventListener('statechange', () => {
              // Tell a freshly-installed worker to activate. Unconditional (no
              // `&& controller` check) so it doesn't depend on the SW self-
              // skipping; the controllerchange + hadController guard above is
              // what decides whether to reload.
              if (newWorker.state === 'installed') {
                newWorker.postMessage({ type: 'SKIP_WAITING' });
              }
            });
          });
        })
        .catch((err) => {
          console.error('[SW] Registration failed:', err);
        });
    }

    return () => cleanups.forEach((fn) => fn());
  }, []);

  return null;
}
