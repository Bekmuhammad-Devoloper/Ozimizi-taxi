'use client';
import { useEffect, useMemo, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CarTaxiFront,
  TrendingUp,
  Hash,
  Route,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  User as UserIcon,
  XCircle,
} from 'lucide-react';
import { IOSSwitch } from '@/components/IOSSwitch';
import { Shell } from '@/components/Shell';
import { AnnouncementCard } from '@/components/AnnouncementCard';
import { DriverInfo, useAuthStore } from '@/stores/auth';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/date';
import { meterSession, orderFields } from '@/hooks/useMeter';
import { OrderModel, OrderStatus, useOrderStore } from '@/stores/order';
import {
  DeliveryView,
  isDeliveryLive,
  useDeliveryStore,
} from '@/stores/delivery';
import { FitText } from '@/components/FitText';
import { RIDE_STATUSES } from '@/lib/activeRide';

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
  const delivery = useDeliveryStore((s) => s.active);
  const setDelivery = useDeliveryStore((s) => s.setActive);
  const [deliveries, setDeliveries] = useState<DeliveryView[]>([]);
  const active = useOrderStore((s) => s.active);
  const router = useRouter();
  const liveOrder =
    active && active.status !== 'COMPLETED' && active.status !== 'CANCELLED' ? active : null;
  const streetRide = liveOrder?.source === 'street';

  // App restarted with a street ride running (Android may kill the app in
  // the background): go straight back to the taximeter — once per app start.
  useEffect(() => {
    if (meterSession.shown) return;
    meterSession.shown = true;
    const a = useOrderStore.getState().active;
    if (a?.source === 'street' && a.status === 'IN_PROGRESS') router.replace('/taximeter');
  }, [router]);

  useEffect(() => {
    api.get('/driver/me').then((r) => setDriver(r.data)).catch(() => {});
    api
      .get<OrderModel[]>('/driver/orders/history')
      .then((r) => setHistory(r.data))
      .catch(() => {});
    api
      .get<DeliveryView[]>('/driver/deliveries/history')
      .then((r) => setDeliveries(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [setDriver, setHistory]);

  // The summary of a finished delivery was left — forget it.
  useEffect(() => {
    if (useDeliveryStore.getState().active?.status === 'DELIVERED') setDelivery(null);
  }, [setDelivery]);

  // Taxi rides + food deliveries (the courier's fee counts as the price).
  const allOrders = useMemo<DashOrder[]>(
    () =>
      deliveries.length
        ? [...history, ...deliveries.map(deliveryAsOrder)].sort(
            (a, b) =>
              new Date(b.createdAt ?? 0).getTime() - new Date(a.createdAt ?? 0).getTime(),
          )
        : history,
    [history, deliveries],
  );

  const todayStats = useMemo(() => computeToday(allOrders), [allOrders]);
  const yesterdayStats = useMemo(() => computeYesterday(allOrders), [allOrders]);

  // A recent ride tapped: one still going becomes the current job (it may have
  // been accepted from the card over other apps); a finished one shows details.
  const openRecent = async (o: { id: string; status: string; deliveryNo?: number | null }) => {
    const id = String(o.id);
    if (id.startsWith('delivery-') || o.deliveryNo != null) {
      router.push(isDeliveryLive(useDeliveryStore.getState().active) ? '/delivery/active' : '/orders');
      return;
    }
    if (RIDE_STATUSES.includes(o.status)) {
      try {
        const { data } = await api.get(`/driver/orders/${id}`);
        if (data && RIDE_STATUSES.includes(data.status)) {
          const st = useOrderStore.getState();
          if (st.active?.id !== data.id) st.resetDistance();
          st.setActive({ id: data.id ?? id, ...orderFields(data) } as OrderModel);
          router.push(data.source === 'street' ? '/taximeter' : '/order/active');
          return;
        }
      } catch {
        /* offline — show the details */
      }
    }
    router.push(`/order/${id}`);
  };
  const weekStats = useMemo(() => computeWeek(allOrders), [allOrders]);

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
  const gpsStatus = useOrderStore((s) => s.gpsStatus);
  // Orders are broadcast by distance, so an online driver without a GPS fix
  // silently gets nothing — say so.
  const gpsWarning =
    online && gpsStatus !== 'ok'
      ? gpsStatus === 'denied'
        ? 'Joylashuvga ruxsat berilmagan — buyurtmalar kelmaydi. Brauzer sozlamalarida joylashuvga ruxsat bering.'
        : gpsStatus === 'unavailable'
          ? 'Joylashuv aniqlanmadi — buyurtmalar kelmaydi. GPS yoqilganini tekshiring.'
          : 'Joylashuv aniqlanmoqda… buyurtmalar GPS topilgach kela boshlaydi.'
      : null;

  return (
    <>
      {/* HERO with inline TOGGLE */}
      <header className="relative bg-ink text-white px-6 pt-10 pb-8 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 80% 0%, rgba(59,155,255,0.45), transparent 60%)',
          }}
        />
        <div className="relative flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-lg overflow-hidden ring-1 ring-gold/50">
            <Image
              src="/logo.jpg"
              alt="MOVIY TAXI"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 leading-tight min-w-0">
            <p className="text-[10px] tracking-widest text-neutral-400 uppercase">
              MOVIY TAXI
            </p>
            <p className="text-sm font-semibold truncate">
              {driver?.fullName ?? '—'}
            </p>
          </div>
          <Link
            href="/profile"
            aria-label="Profil"
            className="w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/15 flex items-center justify-center text-neutral-200 active:scale-95 shrink-0"
          >
            <UserIcon size={16} strokeWidth={2.2} />
          </Link>
        </div>

        <div className="relative flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p className="text-xs uppercase tracking-wider text-neutral-400">
              Balans
            </p>
            <FitText className="mt-1 text-3xl font-extrabold tabular-nums leading-none">
              {fmt(driver?.balance ?? 0)}
              <span className="ml-2 text-sm font-normal text-neutral-400">
                so‘m
              </span>
            </FitText>
          </div>

          {/* The switch only when the driver may go on the line; otherwise the
              reason goes under the balance, at full width. */}
          {driver?.isApproved === false || driver?.profileComplete === false ? null : (
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
        {driver?.isApproved === false ? (
          <div className="relative mt-4 rounded-2xl bg-orange-100 text-orange-900 border border-orange-300 p-3.5 flex items-start gap-3">
            <AlertTriangle size={20} className="shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-extrabold">Hisobingiz tasdiq kutmoqda</p>
              <p className="text-xs mt-0.5">Administrator tasdiqlagach liniyaga chiqa olasiz.</p>
            </div>
          </div>
        ) : driver?.profileComplete === false ? (
          <Link
            href="/profile"
            className="relative mt-4 rounded-2xl bg-gold text-ink p-3.5 flex items-center gap-3 shadow-lg shadow-gold/30 active:scale-[0.99]"
          >
            <AlertTriangle size={20} className="shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-extrabold">Liniyaga chiqish uchun profilni to‘ldiring</span>
              <span className="block text-xs mt-0.5">
                {missingProfile(driver).length
                  ? `Yetishmayapti: ${missingProfile(driver).join(', ')}`
                  : 'Profil sahifasini oching'}
              </span>
            </span>
            <ChevronRight size={18} className="shrink-0" />
          </Link>
        ) : null}
        {err && <p className="relative mt-3 text-xs text-red-300">{err}</p>}
      </header>

      {gpsWarning && (
        <div
          className={
            'mx-6 mt-3 rounded-xl px-3 py-2.5 text-xs font-medium flex items-start gap-2 border ' +
            (gpsStatus === 'searching'
              ? 'bg-neutral-100 text-neutral-700 border-line'
              : 'bg-orange-50 text-orange-800 border-orange-200')
          }
        >
          <AlertTriangle size={14} className="shrink-0 mt-0.5" />
          <span>{gpsWarning}</span>
        </div>
      )}

      {/* ACTIVE RIDE (taximeter or an order from the bot/app) */}
      {liveOrder && (
        <Link
          href={streetRide ? '/taximeter' : '/order/active'}
          className="mx-6 mt-3 flex items-center gap-3 rounded-2xl bg-gold text-ink p-4 shadow-lg shadow-gold/30 active:scale-[0.99]"
        >
          <span className="w-10 h-10 rounded-xl bg-ink text-gold flex items-center justify-center shrink-0">
            <CarTaxiFront size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-widest font-bold">
              {streetRide ? 'Taksometr ishlayapti' : 'Faol buyurtma'}
            </span>
            <span className="block text-sm font-semibold truncate">
              {streetRide
                ? 'Safar davom etmoqda — taksometrni ochish'
                : liveOrder.pickupAddress || 'Buyurtmani ochish'}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0" />
        </Link>
      )}

      {/* TAXIMETER: street pickup (taxi drivers, nothing else running) */}
      {driver?.kind !== 'courier' && !liveOrder && !isDeliveryLive(delivery) && (
        <Link
          href="/taximeter"
          className="mx-6 mt-4 flex items-center gap-4 rounded-2xl bg-ink text-white p-4 shadow-lg shadow-black/20 ring-1 ring-gold/30 active:scale-[0.99]"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/img/taximeter.png"
            alt=""
            width={64}
            height={64}
            className="w-16 h-16 shrink-0 object-contain drop-shadow-[0_6px_14px_rgba(59,155,255,0.35)]"
          />
          <span className="flex-1 min-w-0">
            <span className="block text-lg font-extrabold leading-tight">Taksometr</span>
            <span className="block text-xs text-neutral-400 mt-0.5">
              Ko‘chadan olingan mijoz uchun
            </span>
          </span>
          <ChevronRight size={20} className="shrink-0 text-gold" />
        </Link>
      )}

      {/* ACTIVE FOOD DELIVERY */}
      {isDeliveryLive(delivery) && (
        <Link
          href="/delivery/active"
          className="mx-6 mt-3 flex items-center gap-3 rounded-2xl bg-gold text-ink p-4 shadow-lg shadow-gold/30 active:scale-[0.99]"
        >
          <span className="w-10 h-10 rounded-xl bg-ink flex items-center justify-center text-lg shrink-0">
            🍽
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-widest font-bold">
              Faol yetkazish #{delivery.number}
            </span>
            <span className="block text-sm font-semibold truncate">
              {delivery.status === 'COOKING'
                ? `${delivery.kitchen?.name ?? 'Oshxona'} — tayyorlanmoqda`
                : delivery.status === 'READY'
                  ? 'Buyurtma tayyor — oshxonadan oling'
                  : `Mijozga yetkazing: ${delivery.address ?? ''}`}
            </span>
          </span>
          <ChevronRight size={18} className="shrink-0" />
        </Link>
      )}
      {delivery?.status === 'CANCELLED' && (
        <div className="mx-6 mt-3 rounded-2xl border border-red-200 bg-red-50 p-4 flex items-center gap-3">
          <XCircle size={18} className="text-red-600 shrink-0" />
          <p className="flex-1 text-sm font-semibold text-red-700">
            Yetkazish #{delivery.number} bekor qilindi
          </p>
          <button
            type="button"
            onClick={() => setDelivery(null)}
            className="h-9 px-4 rounded-xl bg-white border border-red-200 text-xs font-bold text-red-700 shrink-0"
          >
            OK
          </button>
        </div>
      )}

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
            {allOrders.length === 0 ? (
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
                {allOrders.slice(0, 3).map((o) => (
                  <li
                    key={o.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => void openRecent(o)}
                    className={
                      'bg-white border rounded-2xl p-4 cursor-pointer active:scale-[0.99] transition-transform ' +
                      (RIDE_STATUSES.includes(o.status) ? 'border-gold/50' : 'border-line')
                    }
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <StatusBadge status={o.status} />
                        {o.deliveryNo != null && (
                          <span className="ml-2 text-xs font-semibold text-neutral-600">
                            🍽 #{o.deliveryNo}
                          </span>
                        )}
                        <p className="text-xs text-neutral-500 mt-2">
                          {fmtDateTime(o.createdAt)}
                        </p>
                      </div>
                      <p className="text-sm font-semibold tabular-nums flex items-center gap-1">
                        {o.price ? fmt(o.price) + ' so‘m' : '—'}
                        <ChevronRight size={16} className="text-neutral-400" />
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <AnnouncementCard />
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
              <FitText className="relative text-3xl font-extrabold tabular-nums">
                {fmt(weekStats.revenue)}
                <span className="ml-2 text-sm font-normal text-neutral-400">so‘m</span>
              </FitText>
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

/** What the server still needs before going on the line (DriverService.isProfileComplete). */
function missingProfile(d: DriverInfo | null | undefined): string[] {
  if (!d) return [];
  const out: string[] = [];
  const empty = (v?: string | null) => !v || !String(v).trim();
  if (empty(d.avatarUrl)) out.push('rasmingiz');
  if (d.kind !== 'courier') {
    if (empty(d.carModel)) out.push('mashina modeli');
    if (empty(d.carColor)) out.push('rangi');
    if (empty(d.carPlate)) out.push('davlat raqami');
  }
  return out;
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
    <div className="bg-white border border-line rounded-2xl p-3 min-w-0">
      <div className="text-gold-dark mb-1">{icon}</div>
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </p>
      {/* The unit on its own line: the number gets the card's whole width. */}
      <FitText className="mt-1 text-lg font-bold tabular-nums leading-tight">{value}</FitText>
      <p className="text-[10px] text-neutral-500 leading-tight">{unit || ' '}</p>
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

type DashOrder = OrderModel & { deliveryNo?: number };

const DELIVERY_AS_ORDER_STATUS: Record<string, OrderStatus> = {
  DELIVERED: 'COMPLETED',
  CANCELLED: 'CANCELLED',
  REJECTED: 'CANCELLED',
  PICKED_UP: 'IN_PROGRESS',
};

/** A food delivery in the shape the stats / recent list use. */
function deliveryAsOrder(d: DeliveryView): DashOrder {
  return {
    id: `delivery-${d.id}`,
    status: DELIVERY_AS_ORDER_STATUS[d.status] ?? 'ACCEPTED',
    pickupLat: d.kitchen?.lat ?? d.lat,
    pickupLng: d.kitchen?.lng ?? d.lng,
    pickupAddress: d.kitchen?.name ?? null,
    distanceKm: d.distanceKm != null ? String(d.distanceKm) : null,
    price: String(d.deliveryFee ?? 0),
    commission: String(d.courierCommission ?? 0),
    createdAt: d.deliveredAt ?? d.createdAt ?? undefined,
    deliveryNo: d.number,
  };
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
