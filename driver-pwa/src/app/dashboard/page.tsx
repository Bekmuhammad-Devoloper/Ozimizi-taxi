'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import {
  TrendingUp,
  Hash,
  Route,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  User as UserIcon,
} from 'lucide-react';
import { IOSSwitch } from '@/components/IOSSwitch';
import { Shell } from '@/components/Shell';
import { useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { OrderModel, useOrderStore } from '@/stores/order';

export default function DashboardPage() {
  return (
    <Shell>
      <DashboardInner />
    </Shell>
  );
}

function DashboardInner() {
  const driver = useAuthStore((s) => s.driver);
  const setDriver = useAuthStore((s) => s.setDriver);
  const setHistory = useOrderStore((s) => s.setHistory);
  const history = useOrderStore((s) => s.history);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api.get('/driver/me').then((r) => setDriver(r.data)).catch(() => {});
    api
      .get<OrderModel[]>('/driver/orders/history')
      .then((r) => setHistory(r.data))
      .catch(() => {});
  }, [setDriver, setHistory]);

  const todayStats = useMemo(() => computeToday(history), [history]);
  const yesterdayStats = useMemo(() => computeYesterday(history), [history]);
  const weekStats = useMemo(() => computeWeek(history), [history]);

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      if (!driver?.isOnline && 'geolocation' in navigator) {
        await new Promise<void>((resolve) =>
          navigator.geolocation.getCurrentPosition(
            () => resolve(),
            () => resolve(),
            { enableHighAccuracy: true },
          ),
        );
      }
      const { data } = await api.post('/driver/online');
      setDriver({ isOnline: data.isOnline });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Xato');
    } finally {
      setBusy(false);
    }
  };

  const online = driver?.isOnline ?? false;

  return (
    <>
      {/* HERO with inline TOGGLE */}
      <header className="relative bg-ink text-white px-6 pt-10 pb-8 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 80% 0%, rgba(250,204,21,0.45), transparent 60%)',
          }}
        />
        <div className="relative flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg overflow-hidden ring-1 ring-gold/50">
            <Image
              src="/logo.jpg"
              alt="OZIMIZNI TAXI"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 leading-tight min-w-0">
            <p className="text-[10px] tracking-widest text-neutral-400 uppercase">
              OZIMIZNI TAXI
            </p>
            <div className="flex items-center gap-2">
              <p className="text-sm font-semibold truncate">
                {driver?.fullName ?? '—'}
              </p>
              <Link
                href="/profile"
                aria-label="Profil"
                className="w-7 h-7 rounded-full bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-neutral-200 active:scale-95 shrink-0"
              >
                <UserIcon size={14} strokeWidth={2.2} />
              </Link>
            </div>
          </div>
        </div>

        <div className="relative flex items-end justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-wider text-neutral-400">
              Balans
            </p>
            <p className="mt-1 text-3xl font-extrabold tabular-nums leading-none">
              {fmt(driver?.balance ?? 0)}
              <span className="ml-2 text-sm font-normal text-neutral-400">
                so‘m
              </span>
            </p>
          </div>

          {driver?.isApproved === false ? (
            <span className="shrink-0 h-12 px-4 inline-flex items-center gap-2 rounded-xl bg-orange-100 text-orange-800 text-sm font-bold border border-orange-300">
              <AlertTriangle size={16} /> Tasdiq kutilmoqda
            </span>
          ) : driver?.profileComplete === false ? (
            <Link
              href="/profile"
              className="shrink-0 h-12 px-4 inline-flex items-center gap-2 rounded-xl bg-gold text-ink text-sm font-bold shadow-lg shadow-gold/30 active:scale-[0.98]"
            >
              <AlertTriangle size={16} /> Profilni to‘ldiring
            </Link>
          ) : (
            <div className="shrink-0 flex flex-col items-end gap-2">
              <span
                className={
                  'text-[10px] uppercase tracking-widest font-bold ' +
                  (online ? 'text-gold' : 'text-neutral-400')
                }
              >
                {online ? 'Online' : 'Offline'}
              </span>
              <IOSSwitch
                checked={online}
                onChange={toggle}
                disabled={busy}
                size="lg"
              />
            </div>
          )}
        </div>
        {err && <p className="relative mt-3 text-xs text-red-300">{err}</p>}
      </header>

      {online ? (
        <>
          {/* TODAY STATS */}
          <section className="px-6 mt-8">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-3">
              Bugungi natijalar
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                icon={<TrendingUp size={16} />}
                label="Daromad"
                value={fmt(todayStats.revenue)}
                unit="so‘m"
              />
              <StatCard
                icon={<Hash size={16} />}
                label="Buyurtma"
                value={String(todayStats.count)}
                unit=""
              />
              <StatCard
                icon={<Route size={16} />}
                label="Masofa"
                value={todayStats.km.toFixed(1)}
                unit="km"
              />
            </div>
          </section>

          {/* RECENT ORDERS */}
          <section className="px-6 mt-8">
            <div className="flex items-baseline justify-between mb-3">
              <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
                So‘nggi buyurtmalar
              </h2>
              <Link
                href="/orders"
                className="text-xs text-neutral-500 flex items-center gap-1"
              >
                Hammasi <ChevronRight size={12} />
              </Link>
            </div>
            {history.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-line p-6 text-center">
                <Sparkles size={20} className="mx-auto text-gold mb-2" />
                <p className="text-sm text-neutral-500">
                  Hozircha buyurtma yo‘q.
                  <br />
                  Birinchi buyurtmani kuting!
                </p>
              </div>
            ) : (
              <ul className="space-y-2">
                {history.slice(0, 3).map((o) => (
                  <li
                    key={o.id}
                    className="bg-white border border-line rounded-2xl p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <StatusBadge status={o.status} />
                        <p className="text-xs text-neutral-500 mt-2">
                          {fmtDateTime(o.createdAt)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums">
                        {o.price ? fmt(o.price) + ' so‘m' : '—'}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* TIPS */}
          <section className="px-6 mt-8 mb-6">
            <div className="bg-ink text-white rounded-2xl p-5 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gold/20 blur-2xl"
              />
              <p className="relative text-[10px] uppercase tracking-widest text-gold font-bold mb-2">
                Maslahat
              </p>
              <p className="relative text-sm leading-relaxed text-neutral-300">
                Markaziy hududda turish — buyurtmalar tezroq keladi. GPS yoqilgan
                bo‘lsin va batareya quvvati 30%dan kam bo‘lmasin.
              </p>
            </div>
          </section>
        </>
      ) : (
        /* OFFLINE — show yesterday + week summary */
        <>
          <section className="px-6 mt-8">
            <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-3">
              Kechagi natijalar
            </h2>
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                icon={<TrendingUp size={16} />}
                label="Daromad"
                value={fmt(yesterdayStats.revenue)}
                unit="so‘m"
              />
              <StatCard
                icon={<Hash size={16} />}
                label="Buyurtma"
                value={String(yesterdayStats.count)}
                unit=""
              />
              <StatCard
                icon={<Route size={16} />}
                label="Masofa"
                value={yesterdayStats.km.toFixed(1)}
                unit="km"
              />
            </div>
          </section>

          <section className="px-6 mt-6">
            <div className="bg-ink text-white rounded-2xl p-5 relative overflow-hidden">
              <div
                aria-hidden
                className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gold/20 blur-2xl"
              />
              <div className="relative flex items-center justify-between mb-3">
                <p className="text-[10px] uppercase tracking-widest text-gold font-bold">
                  Hafta bo‘yicha
                </p>
                <p className="text-[10px] text-neutral-400">
                  oxirgi 7 kun
                </p>
              </div>
              <div className="relative flex items-baseline gap-2">
                <p className="text-3xl font-extrabold tabular-nums">
                  {fmt(weekStats.revenue)}
                </p>
                <p className="text-sm text-neutral-400">so‘m</p>
              </div>
              <div className="relative flex gap-6 mt-3 text-xs text-neutral-300">
                <span>
                  <b className="text-white">{weekStats.count}</b> buyurtma
                </span>
                <span>
                  <b className="text-white">{weekStats.km.toFixed(1)}</b> km
                </span>
              </div>
            </div>
          </section>

          <section className="px-6 mt-6 mb-6">
            <Link
              href="/orders"
              className="flex items-center justify-between p-4 rounded-2xl border border-line bg-white"
            >
              <span className="text-sm font-semibold text-ink">
                Barcha buyurtmalar tarixi
              </span>
              <ChevronRight size={16} className="text-neutral-400" />
            </Link>
          </section>
        </>
      )}
    </>
  );
}

function StatCard({
  icon,
  label,
  value,
  unit,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  unit: string;
}) {
  return (
    <div className="bg-white border border-line rounded-2xl p-3">
      <div className="text-gold-dark mb-1">{icon}</div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums leading-tight">
        {value}
        {unit && (
          <span className="ml-1 text-[10px] font-normal text-neutral-500">
            {unit}
          </span>
        )}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETED: {
      label: 'Bajarildi',
      cls: 'bg-green-50 text-green-700 border-green-200',
    },
    CANCELLED: {
      label: 'Bekor',
      cls: 'bg-red-50 text-red-700 border-red-200',
    },
    IN_PROGRESS: {
      label: 'Yo‘lda',
      cls: 'bg-gold/10 text-gold-deep border-gold/40',
    },
    ACCEPTED: {
      label: 'Qabul',
      cls: 'bg-blue-50 text-blue-700 border-blue-200',
    },
  };
  const cfg = map[status] ?? {
    label: status,
    cls: 'bg-neutral-100 text-neutral-700 border-neutral-200',
  };
  return (
    <span
      className={
        'inline-block text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full font-semibold border ' +
        cfg.cls
      }
    >
      {cfg.label}
    </span>
  );
}

// Local-timezone YYYY-MM-DD. toISOString() returns UTC and silently shifts
// the "day" in UZ (UTC+5) for ~5 hours after local midnight, so we format
// in local time instead.
function localDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function computeToday(history: OrderModel[]) {
  const today = localDay(new Date());
  return summarize(history, (_, ts) => ts != null && localDay(ts) === today);
}

function computeYesterday(history: OrderModel[]) {
  const y = new Date();
  y.setDate(y.getDate() - 1);
  const day = localDay(y);
  return summarize(history, (_, ts) => ts != null && localDay(ts) === day);
}

function computeWeek(history: OrderModel[]) {
  const cutoff = Date.now() - 7 * 24 * 3600_000;
  return summarize(
    history,
    (_, ts) => ts != null && ts.getTime() >= cutoff,
  );
}

function summarize(
  history: OrderModel[],
  match: (dayStr: string, ts: Date | null) => boolean,
) {
  const matched = history.filter((o) => {
    if (o.status !== 'COMPLETED') return false;
    const day = (o.createdAt ?? '').slice(0, 10);
    const ts = o.createdAt ? new Date(o.createdAt) : null;
    return match(day, ts);
  });
  const revenue = matched.reduce(
    (s, o) => s + (Number(o.price ?? 0) - Number(o.commission ?? 0)),
    0,
  );
  const km = matched.reduce((s, o) => s + Number(o.distanceKm ?? 0), 0);
  return { revenue, count: matched.length, km };
}

function fmt(v: string | number) {
  return Number(v).toLocaleString('uz');
}
function fmtDateTime(s?: string) {
  if (!s) return '—';
  const d = new Date(s);
  return (
    d.toLocaleDateString('uz', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' })
  );
}
