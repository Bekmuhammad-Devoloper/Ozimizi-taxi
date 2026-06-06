'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';

/**
 * Telegram Mini App entry point. The wallet bot's "🌐 Koordinator paneli"
 * button targets this URL. We:
 *   1. wait for window.Telegram.WebApp to be ready,
 *   2. POST initData to the backend — backend HMAC-checks against the
 *      wallet bot token and returns a normal admin/coordinator JWT,
 *   3. set the admin_token cookie and bounce to /coordinator.
 */
export default function TelegramEntryPage() {
  const router = useRouter();
  const [msg, setMsg] = useState('Telegram orqali kirilmoqda…');
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      setErr(
        'Telegram WebApp ishlamadi. Iltimos, botning "Koordinator paneli" tugmasi orqali kiring.',
      );
      return;
    }
    try {
      tg.ready?.();
      tg.expand?.();
    } catch {
      /* ignore */
    }
    if (!tg.initData) {
      setErr('initData topilmadi. Botni qayta oching.');
      return;
    }
    api
      .post('/auth/telegram-webapp', { initData: tg.initData })
      .then(({ data }) => {
        Cookies.set('admin_token', data.access_token, { expires: 7 });
        setMsg('Muvaffaqiyatli. Yo‘naltirilmoqda…');
        // Use window.location so the cookie is picked up by middleware
        // on the next request.
        window.location.replace(
          data.admin?.role === 'admin' ? '/dashboard' : '/coordinator',
        );
      })
      .catch((e: any) => {
        setErr(
          e?.response?.data?.message ??
            e?.message ??
            'Telegram orqali kirib bo‘lmadi',
        );
      });
  }, [router]);

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6 bg-white">
      <div className="text-center max-w-sm">
        <div className="w-16 h-16 mx-auto rounded-full bg-gold/15 ring-2 ring-gold/40 flex items-center justify-center mb-4 text-2xl">
          🤖
        </div>
        <h1 className="text-lg font-bold mb-2">Wallet bot</h1>
        {err ? (
          <p className="text-sm text-red-600">{err}</p>
        ) : (
          <p className="text-sm text-neutral-500">{msg}</p>
        )}
      </div>
    </main>
  );
}
