// build-cache-bust 2026-05-07a
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { GeistMono } from 'geist/font/mono';

// Inter is cricbuzz's UI face — chosen for the app after user feedback that
// the previous type felt off. Self-hosted by next/font at build time (no
// runtime Google request, CSP-safe on the static export).
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});
import { Providers } from './providers';
import { Shell } from '@/components/Shell';
import './globals.css';

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export const metadata: Metadata = {
  title: "Viber's Toolkit",
  description: 'Personal productivity suite',
  icons: {
    icon: '/favicon.ico',
    apple: '/icons/icon-192.png',
  },
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: "Viber's Toolkit",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${inter.variable} ${GeistMono.variable} overflow-x-hidden`}>
      <head />
      <body className="font-sans antialiased overflow-x-hidden w-full">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
