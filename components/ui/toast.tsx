'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';

function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={(resolvedTheme as 'light' | 'dark') ?? 'light'}
      position="bottom-right"
      richColors
      toastOptions={{
        style: {
          background: 'var(--surface)',
          border: '1px solid var(--border)',
          color: 'var(--text)',
        },
      }}
    />
  );
}

export { Toaster };
