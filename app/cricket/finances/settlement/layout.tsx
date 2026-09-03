import type { Metadata } from 'next';

/**
 * Link-preview metadata for the public settlement report.
 *
 * This page exists to be pasted into WhatsApp, and WhatsApp does NOT run
 * JavaScript — it scrapes the static HTML. So the page's own
 * `document.title` never reaches the preview card; without this file the
 * preview inherited the root layout and advertised the report as "Viber's
 * Toolkit / Personal productivity suite" behind the retired V TOOLKIT icon.
 *
 * The club is named, the money is not. Every scraper that touches this link
 * (Meta, Slack, iMessage) keeps whatever is here, and it is shown to anyone
 * who merely SEES the message rather than opening it — so a card reading
 * "$312.19 outstanding" would publish the team's finances one forward too
 * early. The team name is public; the figures are the private part.
 *
 * Static, because a statically exported page cannot vary its metadata per
 * token. A second team would need its own route to get its own card.
 */
export const metadata: Metadata = {
  metadataBase: new URL('https://viberstoolkit.com'),
  title: 'Sunrisers Manteca',
  description: 'Team settlement report — a read-only summary of who pays whom this season.',
  openGraph: {
    type: 'website',
    siteName: 'Sunrisers Manteca',
    title: 'Sunrisers Manteca',
    description: 'Team settlement report — a read-only summary of who pays whom this season.',
    images: [{ url: '/sunrisers-logo.png', width: 256, height: 256, alt: '' }],
  },
  twitter: {
    card: 'summary',
    title: 'Sunrisers Manteca',
    description: 'Team settlement report — a read-only summary of who pays whom this season.',
    images: ['/sunrisers-logo.png'],
  },
  icons: {
    icon: '/sunrisers-logo.png',
    apple: '/sunrisers-logo.png',
  },
  // Belt and braces with the X-Robots-Tag in public/_headers: a link carrying
  // a live bearer token must never end up in a search index.
  robots: { index: false, follow: false },
};

export default function SettlementReportLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
