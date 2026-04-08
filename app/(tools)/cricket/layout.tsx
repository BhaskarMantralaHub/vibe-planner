import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Cricket',
  icons: {
    icon: [
      { url: '/cricket-logo.png', sizes: '256x256', type: 'image/png' },
    ],
    shortcut: '/cricket-logo.png',
    apple: '/cricket-logo.png',
  },
};

export default function CricketLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
