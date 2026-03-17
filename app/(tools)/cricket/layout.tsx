import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sunrisers Manteca',
  icons: {
    icon: '/cricket-logo.png',
  },
};

export default function CricketLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
