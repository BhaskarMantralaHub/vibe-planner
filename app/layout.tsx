import type { Metadata } from 'next';
import { Providers } from './providers';
import { Shell } from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: "Viber's Toolkit",
  description: 'Personal productivity suite',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body className="antialiased">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
