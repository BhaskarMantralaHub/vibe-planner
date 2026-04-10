'use client';

import { ThemeProvider } from 'next-themes';
import { Toaster } from '@/components/ui/toast';
import { ServiceWorkerRegister } from '@/components/ServiceWorkerRegister';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="data-theme" defaultTheme="light" storageKey="vibe_theme">
      {children}
      <Toaster />
      <ServiceWorkerRegister />
    </ThemeProvider>
  );
}
