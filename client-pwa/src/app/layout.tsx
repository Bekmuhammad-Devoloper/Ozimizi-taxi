import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { TG_CAPTURE_SCRIPT } from '@/lib/telegram';

// Self-hosted Inter (variable): no network needed at build time.
const inter = localFont({
  src: '../fonts/InterVariable.ttf',
  weight: '100 900',
  display: 'swap',
  variable: '--font-inter',
});

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export const metadata: Metadata = {
  title: 'Moviy Taxi',
  description: 'Moviy Taxi — taksi chaqirish ilovasi',
  manifest: `${BASE}/manifest.json`,
  appleWebApp: { capable: true, statusBarStyle: 'black-translucent', title: 'Moviy Taxi' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  themeColor: '#0a0a0a',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uz" className={inter.variable}>
      <head>
        {/* Telegram Mini App: keep the signed initData from the URL hash
            (#tgWebAppData=…) before the router can drop it, then load the
            WebApp runtime without blocking first paint. Outside Telegram
            both are inert. See src/lib/telegram.ts. */}
        <script dangerouslySetInnerHTML={{ __html: TG_CAPTURE_SCRIPT }} />
        <script src="https://telegram.org/js/telegram-web-app.js" async />
      </head>
      <body>{children}</body>
    </html>
  );
}
