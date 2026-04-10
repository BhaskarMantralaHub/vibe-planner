'use client';

import { useEffect } from 'react';
import * as Sentry from '@sentry/react';
import { initSentry } from '@/lib/sentry';

export function SentryProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    initSentry();
  }, []);

  return (
    <Sentry.ErrorBoundary
      fallback={({ error, resetError }) => (
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
              onClick={resetError}
              style={{
                background: '#4DBBEB', color: '#fff', border: 'none',
                borderRadius: 10, padding: '12px 24px', fontSize: 14,
                fontWeight: 600, cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        </div>
      )}
    >
      {children}
    </Sentry.ErrorBoundary>
  );
}
