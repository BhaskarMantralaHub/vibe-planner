'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toast';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" storageKey="vibe_theme">
      {children}
      <Toaster />
    </ThemeProvider>
  );
}
