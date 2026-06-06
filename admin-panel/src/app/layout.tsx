import './globals.css';
import { Providers } from '@/components/Providers';

export const metadata = {
  title: 'Tezkor Taxi — Admin',
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
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
