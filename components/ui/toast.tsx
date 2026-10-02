'use client';

import { Toaster as SonnerToaster } from 'sonner';
import { useTheme } from 'next-themes';

function Toaster() {
  const { resolvedTheme } = useTheme();

  return (
    <SonnerToaster
      theme={(resolvedTheme as 'light' | 'dark') ?? 'light'}
      position="bottom-right"
      // On phones (<600px, where sonner applies mobileOffset) toasts sit just
      // above the 56px floating + button so they never cover it. The token is
      // :root-scoped, so this is valid on non-cricket pages too.
      mobileOffset={{ bottom: 'calc(var(--cricket-fab-bottom) + 56px + 12px)' }}
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
