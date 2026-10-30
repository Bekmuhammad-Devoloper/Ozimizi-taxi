'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { Loader2, Send, RotateCcw, Phone } from 'lucide-react';
import { api, errMsg } from '@/lib/api';
import { initTelegramUi, openBot, telegramInitData } from '@/lib/telegram';
import { useAuthStore } from '@/stores/auth';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

/**
 * No token → /login. Reads the store after hydration to avoid a false redirect.
 * Inside the Telegram Mini App the signed initData logs the client in first
 * (POST /client/auth/telegram-webapp), so the bot button opens the app ready.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const setAuth = useAuthStore((s) => s.setAuth);
  const [ready, setReady] = useState(false);
  const [tg, setTg] = useState<'idle' | 'busy' | 'failed'>('idle');
  const [tgErr, setTgErr] = useState<string | null>(null);
  const tried = useRef(false);

  const tgLogin = useCallback(
    (initData: string) => {
      setTg('busy');
      setTgErr(null);
      api
        .post('/client/auth/telegram-webapp', { initData })
        .then(({ data }) => {
          setAuth(data.access_token, data.client);
          setTg('idle');
        })
        .catch((e) => {
          setTgErr(errMsg(e, 'Telegram orqali kirib bo‘lmadi'));
          setTg('failed');
        });
    },
    [setAuth],
  );

  useEffect(() => {
    initTelegramUi();
  }, []);

  useEffect(() => {
    const state = useAuthStore.getState();
    if (state.token) {
      setReady(true);
      return;
    }
    setReady(false);
    const initData = telegramInitData();
    if (initData) {
      if (!tried.current) {
        tried.current = true;
        tgLogin(initData);
      }
      return;
    }
    router.replace('/login');
  }, [token, router, tgLogin]);

  if (ready) return <>{children}</>;
  if (tg === 'busy') {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-paper text-sm text-neutral-500">
        <span className="w-16 h-16 rounded-3xl overflow-hidden ring-2 ring-gold/60 shadow-lg">
          <Image src={`${BASE}/logo.jpg`} alt="" width={64} height={64} className="w-full h-full object-cover" unoptimized priority />
        </span>
        <span className="flex items-center gap-2 font-semibold text-ink">
          <Loader2 size={16} className="animate-spin" /> Telegram orqali kirilmoqda…
        </span>
      </div>
    );
  }
  if (tg === 'failed') {
    return (
      <div className="min-h-[100dvh] bg-paper flex flex-col max-w-md mx-auto">
        <div className="bg-ink text-white px-6 pt-14 pb-8 rounded-b-[2rem] relative overflow-hidden text-center">
          <div aria-hidden className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-gold/20 blur-3xl" />
          <span className="relative mx-auto block w-20 h-20 rounded-3xl overflow-hidden ring-2 ring-gold/60 shadow-lg">
            <Image src={`${BASE}/logo.jpg`} alt="" width={80} height={80} className="w-full h-full object-cover" unoptimized priority />
          </span>
          <p className="relative mt-4 text-lg font-extrabold tracking-[0.2em]">
            MOVIY <span className="text-gold">TAXI</span>
          </p>
        </div>
        <div className="px-6 pt-6 pb-8 flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300">
          <h1 className="text-2xl font-extrabold">Avval botda ro‘yxatdan o‘ting</h1>
          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">
            Telegram’dagi <b>@Moviytaxibot</b> botiga o‘ting, <b>/start</b> tugmasini bosing va telefon raqamingizni yuboring. So‘ng shu oynani qayta oching —
            kirish avtomatik bo‘ladi.
          </p>
          {tgErr && <p className="mt-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-xs p-3">{tgErr}</p>}
          <div className="mt-auto pt-8 space-y-3">
            <button onClick={openBot} className="w-full h-14 rounded-2xl bg-[#229ED9] text-white font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition">
              <Send size={18} /> Botni ochish va /start bosish
            </button>
            <button
              onClick={() => {
                const d = telegramInitData();
                if (d) tgLogin(d);
              }}
              className="w-full h-12 rounded-2xl border border-line bg-white font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition"
            >
              <RotateCcw size={16} /> Qayta urinish
            </button>
            <button onClick={() => router.replace('/login')} className="w-full text-center text-sm text-neutral-500 flex items-center justify-center gap-1.5">
              <Phone size={13} /> Telefon raqam orqali kirish
            </button>
          </div>
        </div>
      </div>
    );
  }
  return null;
}
