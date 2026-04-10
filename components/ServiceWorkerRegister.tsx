'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';

export function ServiceWorkerRegister() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').then((registration) => {
      // Check for updates every 60 minutes (for long-running standalone PWA sessions)
      setInterval(() => registration.update(), 60 * 60 * 1000);

      registration.addEventListener('updatefound', () => {
        const newWorker = registration.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            toast('New version available', {
              duration: Infinity,
              action: {
                label: 'Refresh',
                onClick: () => {
                  newWorker.postMessage({ type: 'SKIP_WAITING' });
                  window.location.reload();
                },
              },
            });
          }
        });
      });
    }).catch((err) => {
      console.error('[SW] Registration failed:', err);
    });
  }, []);

  return null;
}
