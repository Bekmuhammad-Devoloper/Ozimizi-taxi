import Script from 'next/script';
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
      <body>
        {/* Telegram Mini App runtime — populates window.Telegram.WebApp
            when the panel is opened inside the wallet bot. Harmless
            outside Telegram (script just sets up the shim). */}
        <Script
          src="https://telegram.org/js/telegram-web-app.js"
          strategy="beforeInteractive"
        />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
