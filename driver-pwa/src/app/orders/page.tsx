'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Inbox, MapPin, Clock, Check, ChevronRight, ChefHat } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtDateTime, fmtDayLabel, fmtTime, localDayKey } from '@/lib/date';
import { OrderModel, OrderStatus, useOrderStore } from '@/stores/order';
import { useAuthStore } from '@/stores/auth';
import {
  DeliveryOffer,
  DeliveryView,
  acceptDelivery as acceptDeliveryReq,
  isDeliveryLive,
  takesDeliveries,
} from '@/stores/delivery';

type Tab = 'available' | 'history';

type AvailableOrder = OrderModel;

export default function OrdersPage() {
  return (
    <Shell>
      <Inner />
    </Shell>
  );
}

function Inner() {
  const driver = useAuthStore((s) => s.driver);
  const router = useRouter();
  const setActive = useOrderStore((s) => s.setActive);
  const resetDistance = useOrderStore((s) => s.resetDistance);
  const [tab, setTab] = useState<Tab>(driver?.isOnline ? 'available' : 'history');
  const [available, setAvailable] = useState<AvailableOrder[]>([]);
  const [history, setHistory] = useState<OrderModel[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryOffer[]>([]);
  const [deliveryHistory, setDeliveryHistory] = useState<DeliveryView[]>([]);
  const [loading, setLoading] = useState(true);
  const [accepting, setAccepting] = useState<string | null>(null);
  // Couriers get food deliveries only; taxi drivers when switched on.
  const isCourier = driver?.kind === 'courier';
  const takesDel = takesDeliveries(driver);

  const fetchAvailable = useCallback(() => {
    if (isCourier) {
      setAvailable([]);
      return Promise.resolve();
    }
    return api
      .get<AvailableOrder[]>('/driver/orders/available')
      .then((r) => setAvailable(r.data))
      .catch(() => {});
  }, [isCourier]);

  const fetchDeliveries = useCallback(() => {
    if (!takesDel) {
      setDeliveries([]);
      return Promise.resolve();
    }
    return api
      .get<DeliveryOffer[]>('/driver/deliveries/available')
      .then((r) => setDeliveries(Array.isArray(r.data) ? r.data : []))
      .catch(() => {});
  }, [takesDel]);

  const fetchHistory = useCallback(() => {
    return Promise.all([
      api
        .get<OrderModel[]>('/driver/orders/history')
        .then((r) => setHistory(r.data))
        .catch(() => {}),
      api
        .get<DeliveryView[]>('/driver/deliveries/history')
        .then((r) => setDeliveryHistory(Array.isArray(r.data) ? r.data : []))
        .catch(() => {}),
    ]);
  }, []);

  useEffect(() => {
    setLoading(true);
    Promise.all([fetchAvailable(), fetchDeliveries(), fetchHistory()]).finally(() =>
      setLoading(false),
    );
  }, [fetchAvailable, fetchDeliveries, fetchHistory]);

  // Auto-poll available orders every 10s when on available tab and online
  useEffect(() => {
    if (tab !== 'available' || !driver?.isOnline) return;
    const t = setInterval(() => {
      void fetchAvailable();
      void fetchDeliveries();
    }, 10_000);
    return () => clearInterval(t);
  }, [tab, driver?.isOnline, fetchAvailable, fetchDeliveries]);

  const accept = async (id: string) => {
    if (accepting) return;
    setAccepting(id);
    try {
      const { data } = await api.post(`/driver/orders/${id}/accept`);
      resetDistance();
      setActive({
        id: data.id,
        status: data.status,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
      });
      router.push('/order/active');
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Qabul qilib bo‘lmadi');
      fetchAvailable();
    } finally {
      setAccepting(null);
    }
  };

  const takeDelivery = async (id: string) => {
    if (accepting) return;
    setAccepting(id);
    try {
      await acceptDeliveryReq(id);
      router.push('/delivery/active');
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Olib bo‘lmadi');
      fetchDeliveries();
    } finally {
      setAccepting(null);
    }
  };

  return (
    <>
      <header className="bg-ink text-white px-6 pt-10 pb-6 rounded-b-3xl">
        <h1 className="text-2xl font-extrabold">Buyurtmalar</h1>
        <p className="text-sm text-neutral-400 mt-1">Mavjud va tarix</p>
      </header>

      <div className="px-6 -mt-3">
        <div className="bg-white border border-line rounded-2xl p-1 flex gap-1 shadow-sm">
          <TabButton
            active={tab === 'available'}
            onClick={() => setTab('available')}
          >
            Mavjud ({available.length + deliveries.length})
          </TabButton>
          <TabButton
            active={tab === 'history'}
            onClick={() => setTab('history')}
          >
            Tarix ({history.length + deliveryHistory.length})
          </TabButton>
        </div>
      </div>

      <div className="px-6 pt-6">
        {loading && <p className="text-sm text-neutral-500">Yuklanmoqda…</p>}

        {!loading && tab === 'available' && (
          <AvailableList
            list={available}
            deliveries={deliveries}
            onAccept={accept}
            onTakeDelivery={takeDelivery}
            accepting={accepting}
            online={!!driver?.isOnline}
          />
        )}

        {!loading && tab === 'history' && (
          <HistoryList list={history} deliveries={deliveryHistory} />
        )}
      </div>
    </>
  );
}

function AvailableList({
  list,
  deliveries,
  onAccept,
  onTakeDelivery,
  accepting,
  online,
}: {
  list: AvailableOrder[];
  deliveries: DeliveryOffer[];
  onAccept: (id: string) => void;
  onTakeDelivery: (id: string) => void;
  accepting: string | null;
  online: boolean;
}) {
  if (!online) {
    return (
      <div className="flex flex-col items-center text-center py-12">
        <span className="w-12 h-12 mb-3 rounded-full bg-neutral-100 flex items-center justify-center">
          <span className="w-2 h-2 rounded-full bg-neutral-400" />
        </span>
        <p className="text-sm font-semibold text-ink">Siz offline</p>
        <p className="text-xs text-neutral-500 mt-1 max-w-[260px]">
          Buyurtmalarni ko‘rish uchun bosh sahifadan ONLINE'ga o‘ting
        </p>
      </div>
    );
  }
  if (list.length === 0 && deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-12">
        <Inbox size={32} className="text-neutral-300 mb-3" />
        <p className="text-sm text-neutral-500">Hozircha buyurtmalar yo‘q</p>
        <p className="text-xs text-neutral-400 mt-1">Avtomatik yangilanadi</p>
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {deliveries.map((o) => (
        <DeliveryOfferCard
          key={'delivery-' + o.orderId}
          o={o}
          onTake={onTakeDelivery}
          accepting={accepting}
        />
      ))}
      {list.map((o) => (
        <li
          key={o.id}
          className="bg-white border border-line rounded-2xl p-4 shadow-sm"
        >
          <div className="flex items-start gap-2 mb-3">
            <MapPin
              size={16}
              className="text-gold-deep mt-0.5 shrink-0"
              strokeWidth={2.2}
            />
            <p className="text-sm text-ink leading-snug">
              {o.pickupAddress ||
                `${o.pickupLat?.toFixed(5)}, ${o.pickupLng?.toFixed(5)}`}
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs text-neutral-500 mb-3">
            <span className="flex items-center gap-1">
              <Clock size={12} />
              {fmtRelative(o.createdAt)}
            </span>
            <StatusBadge status={o.status} />
          </div>
          <button
            onClick={() => onAccept(o.id)}
            disabled={accepting === o.id}
            className="w-full h-11 rounded-xl bg-gold text-ink text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] shadow shadow-gold/40 disabled:opacity-60"
          >
            <Check size={16} strokeWidth={2.5} />
            {accepting === o.id ? 'Qabul qilinmoqda...' : 'Qabul qilish'}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Food delivery in the "Mavjud" list (offer-shaped payload). */
function DeliveryOfferCard({
  o,
  onTake,
  accepting,
}: {
  o: DeliveryOffer;
  onTake: (id: string) => void;
  accepting: string | null;
}) {
  return (
    <li className="bg-white border-2 border-gold/50 rounded-2xl p-4 shadow-sm">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">
          🍽 Yetkazish #{o.number}
        </span>
        <span className="text-xs font-semibold text-neutral-600 tabular-nums">
          {Number(o.distanceFromDriver ?? 0).toFixed(1)} km
        </span>
      </div>
      <div className="flex items-start gap-2 mb-1.5">
        <ChefHat size={16} className="text-gold-deep mt-0.5 shrink-0" strokeWidth={2.2} />
        <p className="text-sm text-ink leading-snug">
          {o.pickup?.address || o.kitchenName || 'Oshxona'}
        </p>
      </div>
      {o.destination && (
        <div className="flex items-start gap-2 mb-3">
          <MapPin size={16} className="text-neutral-400 mt-0.5 shrink-0" strokeWidth={2.2} />
          <p className="text-sm text-neutral-700 leading-snug">
            {o.destination.address ||
              `${o.destination.lat?.toFixed(5)}, ${o.destination.lng?.toFixed(5)}`}
          </p>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-neutral-500 mb-3">
        {o.itemsCount != null && <span>{o.itemsCount} ta taom</span>}
        {o.estimatedKm != null && <span>≈ {o.estimatedKm} km yo‘l</span>}
        <span>
          {o.readyAt
            ? '✅ Tayyor'
            : o.prepMinutes
              ? `Tayyorlash ~${o.prepMinutes} daq`
              : 'Tayyorlanmoqda'}
        </span>
        <span className="flex items-center gap-1">
          <Clock size={12} />
          {fmtRelative(o.createdAt ?? undefined)}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <div className="rounded-xl bg-neutral-50 border border-line px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            Mijozdan naqd
          </p>
          <p className="text-sm font-bold tabular-nums">{fmt(o.total ?? 0)} so‘m</p>
        </div>
        <div className="rounded-xl bg-gold/10 border border-gold/40 px-3 py-2">
          <p className="text-[10px] uppercase tracking-wider text-gold-deep font-semibold">
            Sizning haqingiz
          </p>
          <p className="text-sm font-bold tabular-nums">{fmt(o.estimatedPrice ?? 0)} so‘m</p>
        </div>
      </div>
      <button
        onClick={() => onTake(o.orderId)}
        disabled={accepting === o.orderId}
        className="w-full h-11 rounded-xl bg-gold text-ink text-sm font-bold flex items-center justify-center gap-2 active:scale-[0.98] shadow shadow-gold/40 disabled:opacity-60"
      >
        <Check size={16} strokeWidth={2.5} />
        {accepting === o.orderId ? 'Olinmoqda...' : 'Olish'}
      </button>
    </li>
  );
}

type HistoryEntry =
  | { kind: 'taxi'; at?: string; o: OrderModel }
  | { kind: 'delivery'; at?: string; d: DeliveryView };

function HistoryList({
  list,
  deliveries,
}: {
  list: OrderModel[];
  deliveries: DeliveryView[];
}) {
  if (list.length === 0 && deliveries.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-12">
        <Inbox size={32} className="text-neutral-300 mb-3" />
        <p className="text-sm text-neutral-500">Tarix bo‘sh</p>
      </div>
    );
  }
  // Taxi rides keep the server order; deliveries are merged in by time.
  let entries: HistoryEntry[] = list.map((o) => ({ kind: 'taxi', at: o.createdAt, o }));
  if (deliveries.length) {
    entries = [
      ...entries,
      ...deliveries.map(
        (d): HistoryEntry => ({ kind: 'delivery', at: d.createdAt ?? undefined, d }),
      ),
    ].sort((a, b) => new Date(b.at ?? 0).getTime() - new Date(a.at ?? 0).getTime());
  }
  const grouped: Record<string, HistoryEntry[]> = {};
  for (const e of entries) {
    const day = localDayKey(e.at);
    (grouped[day] ??= []).push(e);
  }
  return (
    <div className="space-y-8">
      {Object.entries(grouped).map(([day, items]) => (
        <section key={day}>
          <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2">
            {fmtDayLabel(day)}
          </p>
          <ul className="space-y-2">
            {items.map((e) => {
              if (e.kind === 'delivery') {
                return <DeliveryHistoryItem key={'d-' + e.d.id} d={e.d} />;
              }
              const o = e.o;
              return (
              <li key={o.id}>
                <Link
                  href={`/order/${o.id}`}
                  className="block bg-white border border-line rounded-2xl p-4 active:scale-[0.99] transition-transform"
                >
                  <div className="flex justify-between items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <StatusBadge status={o.status} />
                        <span className="text-xs text-neutral-500">
                          {fmtTime(o.createdAt)}
                        </span>
                      </div>
                      <p className="text-sm text-neutral-700 mt-2 truncate">
                        📍 {o.pickupAddress ??
                          `${o.pickupLat?.toFixed(4)}, ${o.pickupLng?.toFixed(4)}`}
                      </p>
                      <p className="text-xs text-neutral-500 mt-1">
                        {o.distanceKm ? `${o.distanceKm} km` : 'masofa —'}
                      </p>
                    </div>
                    <div className="text-right flex items-center gap-2">
                      <div>
                        <p className="text-base font-bold tabular-nums">
                          {o.price ? fmt(o.price) : '—'}
                        </p>
                        <p className="text-[10px] text-neutral-500 uppercase tracking-wider">
                          so‘m
                        </p>
                      </div>
                      <ChevronRight
                        size={16}
                        className="text-neutral-300 shrink-0"
                      />
                    </div>
                  </div>
                </Link>
              </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function DeliveryHistoryItem({ d }: { d: DeliveryView }) {
  const live = isDeliveryLive(d);
  const body = (
    <div className="flex justify-between items-start gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <StatusBadge status={d.status} />
          <span className="text-xs text-neutral-500">{fmtTime(d.createdAt)}</span>
          <span className="text-xs font-semibold text-neutral-600">🍽 #{d.number}</span>
        </div>
        <p className="text-sm text-neutral-700 mt-2 truncate">
          🍽 {d.kitchen?.name ?? 'Oshxona'}
        </p>
        <p className="text-xs text-neutral-500 mt-1 truncate">
          → {d.address || `${Number(d.lat).toFixed(4)}, ${Number(d.lng).toFixed(4)}`}
        </p>
      </div>
      <div className="text-right flex items-center gap-2">
        <div>
          <p className="text-base font-bold tabular-nums">{fmt(d.deliveryFee ?? 0)}</p>
          <p className="text-[10px] text-neutral-500 uppercase tracking-wider">so‘m</p>
        </div>
        {live && <ChevronRight size={16} className="text-neutral-300 shrink-0" />}
      </div>
    </div>
  );
  return (
    <li>
      {live ? (
        <Link
          href="/delivery/active"
          className="block bg-white border border-gold/50 rounded-2xl p-4 active:scale-[0.99] transition-transform"
        >
          {body}
        </Link>
      ) : (
        <div className="bg-white border border-line rounded-2xl p-4">{body}</div>
      )}
    </li>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={
        'flex-1 h-10 text-xs font-bold rounded-xl transition-colors ' +
        (active ? 'bg-ink text-gold' : 'text-neutral-500 hover:text-ink')
      }
    >
      {children}
    </button>
  );
}

function StatusBadge({ status }: { status: OrderStatus | DeliveryView['status'] }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETED: {
      label: 'Bajarildi',
      cls: 'bg-green-50 text-green-700 border-green-200',
    },
    CANCELLED: { label: 'Bekor', cls: 'bg-red-50 text-red-700 border-red-200' },
    IN_PROGRESS: {
      label: 'Yo‘lda',
      cls: 'bg-gold/10 text-gold-deep border-gold/40',
    },
    ACCEPTED: {
      label: 'Qabul',
      cls: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    PENDING: {
      label: 'Yangi',
      cls: 'bg-gold/10 text-gold-deep border-gold/50',
    },
    ON_THE_WAY: {
      label: 'Yo‘lda',
      cls: 'bg-gold/10 text-gold-deep border-gold/40',
    },
    ARRIVED: {
      label: 'Yetib keldi',
      cls: 'bg-gold/10 text-gold-deep border-gold/40',
    },
    // food deliveries
    COOKING: {
      label: 'Tayyorlanmoqda',
      cls: 'bg-gold/10 text-gold-deep border-gold/40',
    },
    READY: {
      label: 'Tayyor',
      cls: 'bg-blue-50 text-blue-700 border-blue-200',
    },
    PICKED_UP: {
      label: 'Yo‘lda',
      cls: 'bg-gold/10 text-gold-deep border-gold/40',
    },
    DELIVERED: {
      label: 'Yetkazildi',
      cls: 'bg-green-50 text-green-700 border-green-200',
    },
    REJECTED: { label: 'Bekor', cls: 'bg-red-50 text-red-700 border-red-200' },
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

function fmt(v: string | number) {
  return Number(v).toLocaleString('uz');
}
function fmtRelative(s?: string) {
  if (!s) return '—';
  const t = new Date(s).getTime();
  const diff = Date.now() - t;
  if (diff < 60_000) return 'hozirgina';
  if (diff < 3600_000) return Math.floor(diff / 60_000) + ' daq oldin';
  if (diff < 86400_000) return Math.floor(diff / 3600_000) + ' soat oldin';
  return fmtDateTime(s);
}
