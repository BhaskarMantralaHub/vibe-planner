'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { initSentry } from '@/lib/sentry';
import { tryRecoverFromStaleChunk } from '@/lib/stale-chunk';

export function SentryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentry();
  }, []);

  return (
    <Sentry.ErrorBoundary
      fallback={({ error }) => {
        // Stale-chunk errors after a redeploy land here (the loaded HTML asks
        // for a JS chunk hash that no longer exists). resetError() just
        // re-renders the same missing import and can never recover — a full
        // reload re-fetches fresh HTML. The shared helper auto-recovers AT MOST
        // ONCE per cooldown (so a genuinely broken deploy surfaces instead of
        // looping) and is storage-safe (won't throw inside this fallback).
        // Sentry's ErrorBoundary has already captured the error before this
        // renders, so the signal is retained even when we reload.
        const message = (error as { message?: string } | undefined)?.message;
        if (tryRecoverFromStaleChunk(message)) {
          // Blank screen while the reload fetches fresh HTML — avoids a flash
          // of the error UI. FallbackRender must return an element (not null).
          return <div style={{ minHeight: '100vh', background: '#0F0F1A' }} />;
        }
        return (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: '100vh', padding: 24, fontFamily: '-apple-system, sans-serif',
            background: '#0F0F1A', color: '#E0E0F0',
          }}>
            <div style={{ textAlign: 'center', maxWidth: 360 }}>
              <div style={{ fontSize: 48, marginBottom: 16 }}>😵</div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 8 }}>Something went wrong</h1>
              <p style={{ fontSize: 14, color: '#9CA3AF', lineHeight: 1.5, marginBottom: 24 }}>
                The error has been reported automatically.
              </p>
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: '#4DBBEB', color: '#fff', border: 'none',
                  borderRadius: 10, padding: '12px 24px', fontSize: 14,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                Reload
              </button>
            </div>
          </div>
        );
      }}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
