'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';

function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={(resolvedTheme as 'light' | 'dark') ?? 'light'}
      position="bottom-right"
      // On phones (<600px, where sonner applies mobileOffset) toasts must
      // clear the cricket nav pill + safe area; the tokens are :root-scoped
      // so this is valid on non-cricket pages too (slight overshoot is fine).
      mobileOffset={{ bottom: 'calc(var(--cricket-nav-inset) + var(--cricket-nav-height) + 12px)' }}
      richColors
      duration={2000}
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
