import type { Metadata } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import { Providers } from './providers';
import { Shell } from '@/components/Shell';
import './globals.css';

export const metadata: Metadata = {
  title: "Viber's Toolkit",
  description: 'Personal productivity suite',
  icons: {
    icon: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning className={`${GeistSans.variable} ${GeistMono.variable} overflow-x-hidden`}>
      <head />
      <body className="font-sans antialiased overflow-x-hidden w-full">
        <Providers>
          <Shell>{children}</Shell>
        </Providers>
      </body>
    </html>
  );
}
