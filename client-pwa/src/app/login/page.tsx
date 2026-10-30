'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Phone, Send, ArrowLeft, Loader2, ShieldCheck } from 'lucide-react';
import { api, errMsg } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { BrandHeader } from '@/components/BrandHeader';

const BOT = 'https://t.me/Moviytaxibot';

function maskPhone(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  const withCc = digits.startsWith('998') ? digits : '998' + digits;
  const d = withCc.slice(0, 12);
  let out = '+998';
  if (d.length > 3) out += ' ' + d.slice(3, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 8);
  if (d.length > 8) out += ' ' + d.slice(8, 10);
  if (d.length > 10) out += ' ' + d.slice(10, 12);
  return out;
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [phone, setPhone] = useState('+998 ');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notRegistered, setNotRegistered] = useState(false);
  const [loading, setLoading] = useState(false);
  const [resendIn, setResendIn] = useState(0);
  const codeRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (useAuthStore.getState().token) router.replace('/home');
  }, [router]);

  useEffect(() => {
    if (resendIn <= 0) return;
    const t = setTimeout(() => setResendIn((v) => v - 1), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  const cleanPhone = phone.replace(/\s/g, '');

  const requestCode = async () => {
    setError(null);
    setNotRegistered(false);
    if (cleanPhone.length < 13) {
      setError('Telefon raqam to‘liq emas');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/client/auth/request-code', { phone: cleanPhone });
      setResendIn(Number(data?.resendIn ?? 30));
      setCode('');
      setStep('code');
      setTimeout(() => codeRef.current?.focus(), 80);
    } catch (e: any) {
      if (e?.response?.status === 404) setNotRegistered(true);
      setError(errMsg(e, 'Kod yuborib bo‘lmadi'));
    } finally {
      setLoading(false);
    }
  };

  const verify = async (value = code) => {
    if (value.length < 5) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.post('/client/auth/verify', { phone: cleanPhone, code: value });
      setAuth(data.access_token, data.client);
      router.replace('/home');
    } catch (e) {
      setError(errMsg(e, 'Kod noto‘g‘ri'));
      setCode('');
      setTimeout(() => codeRef.current?.focus(), 50);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-paper flex sm:items-center sm:justify-center sm:p-6">
      <div className="w-full sm:max-w-md sm:rounded-3xl sm:border sm:border-line sm:overflow-hidden sm:shadow-xl sm:bg-paper">
        <div className="px-6 pb-8 flex flex-col min-h-[100dvh] sm:min-h-0">
          <BrandHeader subtitle="Taksi chaqirish ilovasi" />

          {step === 'phone' ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void requestCode();
              }}
              className="flex-1 flex flex-col animate-in fade-in slide-in-from-bottom-2 duration-300"
            >
              <h1 className="text-2xl font-extrabold">Xush kelibsiz</h1>
              <p className="mt-1 text-sm text-neutral-600 leading-relaxed">
                Telegram botda ro‘yxatdan o‘tgan raqamingizni kiriting — kirish kodi botga keladi. Parol kerak emas.
              </p>
              <label className="mt-6 block">
                <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
                  <Phone size={13} /> Telefon raqam
                </span>
                <div className="mt-1.5 flex items-center h-14 rounded-2xl bg-white border border-line focus-within:border-ink focus-within:ring-2 focus-within:ring-gold/40 transition">
                  <span className="pl-4 pr-3 text-xl">🇺🇿</span>
                  <input
                    value={phone}
                    onChange={(e) => setPhone(maskPhone(e.target.value))}
                    inputMode="tel"
                    autoComplete="tel"
                    autoFocus
                    className="flex-1 h-full bg-transparent outline-none text-lg font-semibold tracking-wide pr-4"
                  />
                </div>
              </label>
              {error && (
                <div className="mt-4 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm p-3 animate-in fade-in">
                  {error}
                  {notRegistered && (
                    <a href={BOT} target="_blank" rel="noreferrer" className="mt-2 flex items-center gap-1.5 font-bold text-[#229ED9]">
                      <Send size={14} /> Botda ro‘yxatdan o‘tish →
                    </a>
                  )}
                </div>
              )}
              <div className="mt-auto pt-8 space-y-3">
                <button type="submit" disabled={loading} className="btn-primary h-14 text-base rounded-2xl flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? 'Yuborilmoqda…' : 'Kod olish'}
                </button>
                <a href={BOT} target="_blank" rel="noreferrer" className="block text-center text-sm text-neutral-500">
                  Hisobingiz yo‘qmi? <span className="font-semibold text-ink">@Moviytaxibot</span> da ro‘yxatdan o‘ting
                </a>
                <p className="text-center text-[11px] text-neutral-400 flex items-center justify-center gap-1">
                  <ShieldCheck size={12} /> Raqamingiz faqat kirish uchun ishlatiladi
                </p>
              </div>
            </form>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void verify();
              }}
              className="flex-1 flex flex-col animate-in fade-in slide-in-from-right-4 duration-300"
            >
              <button type="button" onClick={() => setStep('phone')} className="self-start text-sm text-neutral-500 flex items-center gap-1">
                <ArrowLeft size={14} /> {phone}
              </button>
              <h1 className="mt-3 text-2xl font-extrabold">Kodni kiriting</h1>
              <p className="mt-1 text-sm text-neutral-600 leading-relaxed">
                5 xonali kod Telegram’dagi <b>Moviy Taxi</b> botiga yuborildi.
              </p>

              {/* OTP cells */}
              <div className="mt-6 relative" onClick={() => codeRef.current?.focus()}>
                <div className="grid grid-cols-5 gap-2.5">
                  {[0, 1, 2, 3, 4].map((i) => {
                    const ch = code[i] ?? '';
                    const activeCell = code.length === i;
                    return (
                      <div
                        key={i}
                        className={
                          'h-16 rounded-2xl bg-white border-2 flex items-center justify-center text-2xl font-extrabold tabular-nums transition ' +
                          (activeCell ? 'border-ink ring-2 ring-gold/40' : ch ? 'border-gold' : 'border-line')
                        }
                      >
                        {ch || (activeCell ? <span className="w-0.5 h-7 bg-ink animate-pulse" /> : '')}
                      </div>
                    );
                  })}
                </div>
                <input
                  ref={codeRef}
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 5);
                    setCode(v);
                    if (v.length === 5) void verify(v);
                  }}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={5}
                  className="absolute inset-0 w-full h-full opacity-0"
                  aria-label="Kod"
                />
              </div>
              {error && <p className="mt-3 text-sm text-red-600 animate-in fade-in">{error}</p>}
              <a href={BOT} target="_blank" rel="noreferrer" className="mt-5 inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-[#229ED9]/10 text-[#229ED9] text-sm font-bold self-start">
                <Send size={15} /> Telegram’da kodni ko‘rish
              </a>
              <div className="mt-auto pt-8 space-y-3">
                <button type="submit" disabled={loading || code.length < 5} className="btn-primary h-14 text-base rounded-2xl flex items-center justify-center gap-2">
                  {loading ? <Loader2 size={18} className="animate-spin" /> : null}
                  {loading ? 'Tekshirilmoqda…' : 'Kirish'}
                </button>
                <button type="button" disabled={resendIn > 0 || loading} onClick={() => void requestCode()} className="block w-full text-center text-sm text-neutral-500 disabled:opacity-60">
                  {resendIn > 0 ? `Qayta yuborish (${resendIn} s)` : 'Kodni qayta yuborish'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
