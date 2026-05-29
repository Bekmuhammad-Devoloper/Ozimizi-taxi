'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Clock, LogOut, RefreshCw, CheckCircle2 } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

const POLL_MS = 8000;

export default function PendingApprovalPage() {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const driver = useAuthStore((s) => s.driver);
  const setDriver = useAuthStore((s) => s.setDriver);
  const logout = useAuthStore((s) => s.logout);
  const [checking, setChecking] = useState(false);
  const [tickAt, setTickAt] = useState<number>(Date.now());

  // Kick anyone without a token back to login; bounce approved drivers
  // straight to the dashboard so they don't get stuck here.
  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    if (driver?.isApproved) {
      router.replace('/dashboard');
    }
  }, [token, driver?.isApproved, router]);

  // Poll /driver/me; as soon as the admin flips isApproved, redirect.
  useEffect(() => {
    if (!token) return;
    const tick = async () => {
      try {
        setChecking(true);
        const { data } = await api.get('/driver/me');
        setDriver(data);
        setTickAt(Date.now());
        if (data?.isApproved) {
          router.replace('/dashboard');
        }
      } catch {
        // Silent: AuthGuard / api interceptor handles 401. Other errors are
        // transient — keep polling.
      } finally {
        setChecking(false);
      }
    };
    void tick();
    const id = setInterval(tick, POLL_MS);
    return () => clearInterval(id);
  }, [token, router, setDriver]);

  const onLogout = () => {
    logout();
    router.replace('/login');
  };

  const onRefresh = async () => {
    setChecking(true);
    try {
      const { data } = await api.get('/driver/me');
      setDriver(data);
      setTickAt(Date.now());
      if (data?.isApproved) router.replace('/dashboard');
    } catch {
      // ignore
    } finally {
      setChecking(false);
    }
  };

  return (
    <main className="min-h-[100dvh] bg-white flex flex-col">
      <div className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <div className="relative">
          <div className="absolute -inset-6 rounded-full bg-gold/10 animate-pulse" />
          <div className="relative w-24 h-24 rounded-full bg-gold/15 ring-2 ring-gold/40 flex items-center justify-center">
            <Clock size={42} className="text-gold-deep" strokeWidth={2.2} />
          </div>
        </div>

        <h1 className="mt-8 text-2xl font-extrabold tracking-tight">
          Admin tasdiqlashi kutilmoqda
        </h1>
        <p className="mt-2 text-sm text-neutral-500 max-w-xs leading-relaxed">
          Hisobingiz yaratildi. Foydalanishni boshlash uchun admin sizni
          tasdiqlashi kerak. Tasdiqlangach, bu sahifa avtomatik yangilanadi.
        </p>

        {driver && (
          <div className="mt-8 w-full max-w-xs bg-white border border-line rounded-2xl p-4 text-left">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
              Hisobingiz
            </p>
            <p className="mt-1 font-bold text-ink">{driver.fullName}</p>
            <p className="text-sm text-neutral-500">{driver.phone}</p>
          </div>
        )}

        <div className="mt-6 inline-flex items-center gap-2 text-xs text-neutral-400">
          <CheckCircle2 size={14} className="text-green-600" />
          Oxirgi tekshiruv: {new Date(tickAt).toLocaleTimeString('uz')}
        </div>

        <div className="mt-8 w-full max-w-xs space-y-3">
          <button
            onClick={onRefresh}
            disabled={checking}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl border border-line bg-white text-sm font-semibold disabled:opacity-50 active:scale-[0.98]"
          >
            <RefreshCw
              size={16}
              className={checking ? 'animate-spin' : ''}
            />
            {checking ? 'Tekshirilmoqda…' : 'Hozir tekshirish'}
          </button>
          <button
            onClick={onLogout}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-xl bg-ink text-gold text-sm font-semibold active:scale-[0.98]"
          >
            <LogOut size={16} />
            Chiqish
          </button>
        </div>
      </div>

      <p className="text-center text-[11px] text-neutral-400 pb-8 px-6">
        Tasdiqlanmaguncha buyurtmalarni qabul qilolmaysiz. Savol bo‘lsa
        admin bilan bog‘laning.
      </p>
    </main>
  );
}
