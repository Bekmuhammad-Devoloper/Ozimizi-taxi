'use client';
import { useEffect, useState } from 'react';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';

/**
 * When the admin panel is opened inside Telegram via the wallet bot's
 * Mini App button, the global window.Telegram.WebApp exposes initData.
 * Hand it to the backend once on mount and the backend issues a normal
 * admin_token cookie; the rest of the panel then behaves exactly like
 * a logged-in session in the browser.
 *
 * Outside Telegram this is a no-op.
 */
export function useTelegramWebApp() {
  const [state, setState] = useState<
    'idle' | 'authing' | 'ok' | 'error' | 'no-webapp'
  >('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as any).Telegram?.WebApp;
    if (!tg || !tg.initData) {
      setState('no-webapp');
      return;
    }
    try {
      tg.ready?.();
      tg.expand?.();
    } catch {
      /* ignore */
    }

    // Already authed inside this Telegram session — skip the round-trip.
    if (Cookies.get('admin_token')) {
      setState('ok');
      return;
    }

    setState('authing');
    api
      .post('/auth/telegram-webapp', { initData: tg.initData })
      .then(({ data }) => {
        Cookies.set('admin_token', data.access_token, { expires: 7 });
        setState('ok');
        // Force a soft reload so middleware-gated pages pick up the cookie.
        window.location.reload();
      })
      .catch((e: any) => {
        setError(
          e?.response?.data?.message ??
            e?.message ??
            'Telegram orqali kirib bo‘lmadi',
        );
        setState('error');
      });
  }, []);

  return { state, error };
}
