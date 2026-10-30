'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Cookies from 'js-cookie';
import { Lock, User, Loader2, ShieldCheck } from 'lucide-react';
import { api } from '@/lib/api';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? '';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/admin/login', { username, password });
      const role = data?.admin?.role ?? 'admin';
      Cookies.set('admin_token', data.access_token, { expires: 7 });
      // Coordinators and kitchens get their own workspace (the middleware
      // walls the rest off); coordinators may also use the Telegram Mini App.
      router.replace(
        role === 'coordinator' ? '/coordinator' : role === 'kitchen' ? '/kitchen' : '/dashboard',
      );
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Kirib bo‘lmadi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr] bg-white">
      {/* brand panel */}
      <section className="relative overflow-hidden bg-ink text-white flex flex-col justify-between px-8 py-10 lg:px-14 lg:py-14">
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(55% 45% at 85% 15%, rgba(59,155,255,0.28), transparent 60%), radial-gradient(40% 40% at 10% 90%, rgba(59,155,255,0.12), transparent 60%)',
          }}
        />
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none opacity-[0.07]"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.4) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
            maskImage: 'radial-gradient(70% 60% at 50% 40%, black, transparent)',
            WebkitMaskImage: 'radial-gradient(70% 60% at 50% 40%, black, transparent)',
          }}
        />
        <div className="relative flex items-center gap-4 lg:flex-col lg:items-start">
          <div className="w-20 h-20 lg:w-36 lg:h-36 rounded-3xl overflow-hidden ring-2 ring-gold/60 shadow-[0_20px_60px_-20px_rgba(59,155,255,0.8)] shrink-0">
            <Image src={`${BASE}/logo.jpg`} alt="MOVIY TAXI" width={144} height={144} className="w-full h-full object-cover" priority />
          </div>
          <div>
            <p className="text-2xl lg:text-4xl font-extrabold tracking-[0.18em] lg:mt-6">
              MOVIY <span className="text-gold">TAXI</span>
            </p>
            <p className="mt-1 text-sm lg:text-base text-neutral-400">Tez · Qulay · Ishonchli</p>
          </div>
        </div>
        <div className="relative hidden lg:block">
          <p className="text-[11px] font-bold uppercase tracking-[0.3em] text-gold">Boshqaruv paneli</p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight max-w-md">Buyurtmalar, haydovchilar va pul aylanmasi — bitta joyda.</h2>
          <ul className="mt-6 space-y-2 text-sm text-neutral-300">
            <li className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-gold" /> 100 000 000 so‘mlik yopiq tizim nazorati
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-gold" /> Jonli buyurtmalar va haydovchilar xaritasi
            </li>
            <li className="flex items-center gap-2">
              <ShieldCheck size={16} className="text-gold" /> Tarif, promo, bonus va e’lonlar
            </li>
          </ul>
        </div>
        <p className="relative hidden lg:block text-xs text-neutral-500">© {new Date().getFullYear()} Moviy Taxi · moviytaxi.uz</p>
      </section>

      {/* form */}
      <section className="flex items-center justify-center px-6 py-10">
        <form onSubmit={submit} className="w-full max-w-sm">
          <h1 className="text-2xl font-extrabold">Kirish</h1>
          <p className="mt-1 text-sm text-neutral-500">Admin, koordinator yoki oshxona hisobingiz bilan kiring.</p>

          <div className="mt-8 space-y-5">
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1.5">
                <User size={13} /> Username
              </span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                className="mt-1.5 w-full h-12 px-4 rounded-xl bg-white border border-line outline-none focus:border-ink focus:ring-2 focus:ring-gold/40 transition"
                placeholder="admin"
              />
            </label>
            <label className="block">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold flex items-center gap-1.5">
                <Lock size={13} /> Parol
              </span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                className="mt-1.5 w-full h-12 px-4 rounded-xl bg-white border border-line outline-none focus:border-ink focus:ring-2 focus:ring-gold/40 transition"
              />
            </label>
          </div>

          {err && <p className="mt-5 text-sm text-red-600 rounded-xl bg-red-50 border border-red-200 px-3 py-2">{err}</p>}

          <button
            disabled={loading}
            className="mt-8 w-full h-12 bg-ink text-gold text-sm font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 shadow-[0_12px_30px_-12px_rgba(0,0,0,.6)] active:scale-[0.99] transition"
          >
            {loading ? <Loader2 size={16} className="animate-spin" /> : null}
            {loading ? 'Kuting…' : 'Kirish'}
          </button>
          <p className="mt-6 text-center text-xs text-neutral-400">Koordinatorlar Telegram Mini App orqali ham kirishi mumkin</p>
        </form>
      </section>
    </main>
  );
}
