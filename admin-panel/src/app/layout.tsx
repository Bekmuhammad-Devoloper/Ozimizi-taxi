import './globals.css';
import { Providers } from '@/components/Providers';

// Public files live under the basePath (/admin in production).
const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export const metadata = {
  title: 'Moviy Taxi — Admin',
  applicationName: 'Moviy Taxi Admin',
  // "Add to home screen": Android / Chrome reads the manifest, iOS the
  // apple-* tags below.
  manifest: `${BASE}/manifest.json`,
  appleWebApp: {
    capable: true,
    title: 'Moviy Admin',
    statusBarStyle: 'black-translucent' as const,
  },
};

// Phone browsers: tint the browser bar to match the dark header.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#0a0a0a',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="uz">
      <head>
        {/* Telegram Mini App runtime. MUST load before React mounts so
            window.Telegram.WebApp + initData are ready in the /tg page's
            useEffect. next/script with strategy="beforeInteractive" was
            firing too late inside Telegram's in-app browser; a plain
            blocking <script> tag in <head> avoids the race entirely.
            Outside Telegram the file just sets up an inert shim. */}
        <script
          src="https://telegram.org/js/telegram-web-app.js"
          async={false}
        />
        {/* Home-screen icon on iPhone (PNG, 180×180). */}
        <link rel="apple-touch-icon" sizes="180x180" href={`${BASE}/apple-touch-icon.png`} />
        {/* apple-mobile-web-app-capable comes from metadata.appleWebApp;
            this is the Android/Chrome equivalent. */}
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
