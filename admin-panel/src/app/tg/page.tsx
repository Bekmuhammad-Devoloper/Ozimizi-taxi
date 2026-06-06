'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import { LogIn } from 'lucide-react';
import { api } from '@/lib/api';

type Stage = 'booting' | 'authing' | 'needsLogin' | 'linking' | 'noWebApp';

/**
 * Telegram Mini App entry. Flow:
 *   1. Wait for window.Telegram.WebApp to be ready.
 *   2. Try /auth/telegram-webapp — succeeds if this chat is already
 *      linked to an admin row.
 *   3. On 401, show a username/password form. Submitting hits
 *      /auth/telegram-webapp/link which binds the chat and returns
 *      a JWT.
 *   4. Either way, set the admin_token cookie and bounce to the
 *      coordinator workspace.
 */
export default function TelegramEntryPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>('booting');
  const [initData, setInitData] = useState<string>('');
  const [err, setErr] = useState<string | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const tg = (window as any).Telegram?.WebApp;
    if (!tg) {
      setStage('noWebApp');
      return;
    }
    try {
      tg.ready?.();
      tg.expand?.();
    } catch {
      /* ignore */
    }
    if (!tg.initData) {
      setStage('noWebApp');
      return;
    }
    setInitData(tg.initData);
    setStage('authing');
    api
      .post('/auth/telegram-webapp', { initData: tg.initData })
      .then(({ data }) => {
        Cookies.set('admin_token', data.access_token, { expires: 7 });
        window.location.replace(
          data.admin?.role === 'admin' ? '/dashboard' : '/coordinator',
        );
      })
      .catch(() => {
        // Most common case: chat not linked yet — show login form.
        setStage('needsLogin');
      });
  }, [router]);

  const onLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setErr('Username va parol kerak');
      return;
    }
    setErr(null);
    setStage('linking');
    try {
      const { data } = await api.post('/auth/telegram-webapp/link', {
        initData,
        username: username.trim(),
        password,
      });
      Cookies.set('admin_token', data.access_token, { expires: 7 });
      window.location.replace(
        data.admin?.role === 'admin' ? '/dashboard' : '/coordinator',
      );
    } catch (e: any) {
      setErr(
        e?.response?.data?.message ?? e?.message ?? 'Kirib bo‘lmadi',
      );
      setStage('needsLogin');
    }
  };

  return (
    <main className="min-h-[100dvh] flex items-center justify-center px-6 bg-white">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <div className="w-16 h-16 mx-auto rounded-full bg-gold/15 ring-2 ring-gold/40 flex items-center justify-center text-2xl mb-3">
            🤖
          </div>
          <h1 className="text-lg font-bold">Wallet bot</h1>
          <p className="text-xs text-neutral-500 mt-1">
            Koordinator paneliga kirish
          </p>
        </div>

        {stage === 'booting' && (
          <p className="text-center text-sm text-neutral-500">
            Yuklanmoqda…
          </p>
        )}

        {stage === 'authing' && (
          <p className="text-center text-sm text-neutral-500">
            Telegram orqali kirilmoqda…
          </p>
        )}

        {stage === 'noWebApp' && (
          <p className="text-center text-sm text-red-600">
            Telegram WebApp aniqlanmadi. Iltimos, @OzimizniWaltbot dagi
            <b> 🌐 Koordinator paneli</b> tugmasi orqali kiring.
          </p>
        )}

        {(stage === 'needsLogin' || stage === 'linking') && (
          <form onSubmit={onLogin} className="space-y-4">
            <p className="text-xs text-neutral-500 text-center">
              Birinchi marta kirayapsiz — username va parolingizni
              kiriting, keyingi safar avtomatik kirasiz.
            </p>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                Username
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="mt-1 w-full h-11 px-3 border border-line rounded-lg outline-none focus:border-gold-dark"
                placeholder="kassir1"
              />
            </label>
            <label className="block">
              <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                Parol
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1 w-full h-11 px-3 border border-line rounded-lg outline-none focus:border-gold-dark"
              />
            </label>
            {err && <p className="text-sm text-red-600">{err}</p>}
            <button
              type="submit"
              disabled={stage === 'linking'}
              className="w-full h-11 bg-ink text-gold rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60"
            >
              <LogIn size={16} />
              {stage === 'linking' ? 'Kirilmoqda…' : 'Kirish va ulanish'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}
