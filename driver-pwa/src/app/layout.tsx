import { LangBridge } from '@/components/Lang';
import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

// Self-hosted Inter (variable): no network needed at build time.
const inter = localFont({
  src: '../fonts/InterVariable.ttf',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

export const metadata: Metadata = {
  title: 'Moviy Taxi',
  description: 'Moviy Taxi — Haydovchi ilovasi',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Moviy Taxi',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz" className={inter.variable}>
      <body>
        <LangBridge />
        {children}
      </body>
    </html>
  );
}
