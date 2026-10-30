'use client';
import { Fragment, Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ChevronLeft,
  ChevronRight,
  Filter,
  ListTree,
  X as XIcon,
  UtensilsCrossed,
  Activity,
  PackageCheck,
  Banknote,
  Percent,
  Store,
  RefreshCw,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { StatsCard } from '@/components/StatsCard';
import { FoodOrderTimeline } from '@/components/FoodOrderTimeline';
import { FoodStatusBadge } from '@/components/FoodStatusBadge';
import { FoodOrderTags, cashDueOf, isOwnDelivery, isPickup } from '@/components/FoodOrderTags';
import { api } from '@/lib/api';
import { getAdminSocket } from '@/lib/socket';
import { fmtDateTime } from '@/lib/format';
import {
  FOOD_STATUSES,
  apiError,
  foodStatusLabel,
  isFoodFinal,
  minutesSince,
  osmLink,
  som,
  timeHM,
  type AdminFoodOrder,
  type FoodSummary,
  type Kitchen,
} from '@/lib/food';

interface OrdersResponse {
  page: number;
  pageSize: number;
  total: number;
  items: AdminFoodOrder[];
}

const PAGE_SIZE = 25;

/** Re-render every `ms` so "N daq oldin" labels stay fresh. */
function useNow(ms = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** ?open=<id> (live feed link) and ?kitchen=<id> (from the kitchens page). */
function QueryWatcher({ onOpen, onKitchen }: { onOpen: (id: string) => void; onKitchen: (id: string) => void }) {
  const sp = useSearchParams();
  const open = sp.get('open');
  const kitchen = sp.get('kitchen');
  const cb = useRef({ onOpen, onKitchen });
  cb.current = { onOpen, onKitchen };
  useEffect(() => {
    if (open) cb.current.onOpen(open);
  }, [open]);
  useEffect(() => {
    if (kitchen) cb.current.onKitchen(kitchen);
  }, [kitchen]);
  return null;
}

export default function FoodOrdersPage() {
  const qc = useQueryClient();
  const now = useNow();
  const [status, setStatus] = useState<string>('');
  const [kitchenId, setKitchenId] = useState('');
  const [page, setPage] = useState(1);
  const [openIds, setOpenIds] = useState<string[]>([]);

  const toggleOpen = (id: string) =>
    setOpenIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const { data: summary } = useQuery({
    queryKey: ['food-summary'],
    queryFn: async () => (await api.get<FoodSummary>('/admin/food/summary')).data,
    refetchInterval: 15_000,
  });

  const { data: kitchens } = useQuery({
    queryKey: ['food-kitchens'],
    queryFn: async () => (await api.get<Kitchen[]>('/admin/food/kitchens')).data,
  });

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['food-orders', { status, kitchenId, page }],
    queryFn: async () => {
      const params: Record<string, string | number> = { page, pageSize: PAGE_SIZE };
      if (status) params.status = status;
      if (kitchenId) params.kitchenId = kitchenId;
      return (await api.get<OrdersResponse>('/admin/food/orders', { params })).data;
    },
    refetchInterval: 15_000,
  });

  // Live: any food order change / step refreshes the list (debounced — a
  // broadcast to many couriers produces a burst of events).
  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;
    let timer: number | null = null;
    const refresh = () => {
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        qc.invalidateQueries({ queryKey: ['food-orders'] });
        qc.invalidateQueries({ queryKey: ['food-summary'] });
      }, 600);
    };
    socket.on('food_order_update', refresh);
    socket.on('food_order_event', refresh);
    return () => {
      if (timer) window.clearTimeout(timer);
      socket.off('food_order_update', refresh);
      socket.off('food_order_event', refresh);
    };
  }, [qc]);

  const cancel = useMutation({
    mutationFn: async (id: string) => (await api.post(`/admin/food/orders/${id}/cancel`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-orders'] });
      qc.invalidateQueries({ queryKey: ['food-summary'] });
    },
    onError: (e) => alert(apiError(e)),
  });

  const askCancel = (o: AdminFoodOrder) => {
    const warn =
      o.status === 'PICKED_UP'
        ? '\nDiqqat: kuryer ovqatni allaqachon olib ketgan!'
        : o.status === 'COOKING' || o.status === 'READY'
          ? '\nOshxona tayyorlashni boshlagan.'
          : '';
    if (confirm(`#${o.number} ovqat buyurtmasini bekor qilasizmi?${warn}`)) cancel.mutate(o.id);
  };

  const items = data?.items ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const listed = new Set(items.map((o) => o.id));
  const detached = openIds.filter((id) => !listed.has(id));

  const chip = (value: string, label: string) => (
    <button
      key={value || 'all'}
      onClick={() => {
        setStatus(value);
        setPage(1);
      }}
      className={
        'px-3 h-8 text-[11px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
        (status === value ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-500 border-line hover:border-ink')
      }
    >
      {label}
      {value === 'active' && !!summary?.active && (
        <span className="ml-1.5 inline-flex min-w-4 h-4 px-1 rounded-full bg-red-500 text-white text-[9px] items-center justify-center">
          {summary.active}
        </span>
      )}
    </button>
  );

  return (
    <Shell
      title="Ovqat buyurtmalari"
      subtitle={`Jami: ${data?.total ?? 0} ta · jonli yangilanadi`}
      actions={
        <button onClick={() => void refetch()} className="btn-secondary">
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Yangilash
        </button>
      }
    >
      <Suspense fallback={null}>
        <QueryWatcher
          onOpen={(id) => setOpenIds((s) => (s.includes(id) ? s : [id, ...s]))}
          onKitchen={(id) => {
            setKitchenId(id);
            setPage(1);
          }}
        />
      </Suspense>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatsCard title="Bugun buyurtma" value={summary?.today ?? 0} icon={UtensilsCrossed} />
        <StatsCard
          title="Hozir faol"
          value={summary?.active ?? 0}
          icon={Activity}
          accent="bg-blue-50 text-blue-700"
        />
        <StatsCard
          title="Bugun yetkazildi"
          value={summary?.delivered_today ?? 0}
          icon={PackageCheck}
          accent="bg-emerald-50 text-emerald-700"
        />
        <StatsCard title="Bugungi aylanma" value={som(summary?.turnover_today)} unit="so‘m" icon={Banknote} />
        <StatsCard
          title="Oylik komissiya"
          value={som(summary?.commission_month)}
          unit="so‘m"
          icon={Percent}
          hint="Kuryer + oshxona komissiyasi"
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <div className="card p-4 mb-4 space-y-3">
        <div>
          <p className="label mb-2 flex items-center gap-1">
            <Filter size={11} /> Status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {chip('', 'Hammasi')}
            {chip('active', 'Faol')}
            {FOOD_STATUSES.map((s) => chip(s, foodStatusLabel(s)))}
          </div>
        </div>
        <div className="max-w-xs">
          <p className="label mb-1 flex items-center gap-1">
            <Store size={11} /> Oshxona
          </p>
          <select
            value={kitchenId}
            onChange={(e) => {
              setKitchenId(e.target.value);
              setPage(1);
            }}
            className="input"
          >
            <option value="">Barcha oshxonalar</option>
            {(kitchens ?? []).map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Orders opened from a link but not on the current page/filter */}
      {detached.map((id) => (
        <div key={id} className="card p-4 mb-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
              Tanlangan buyurtma harakatlari
            </p>
            <button
              onClick={() => toggleOpen(id)}
              className="text-neutral-400 hover:text-ink"
              aria-label="Yopish"
            >
              <XIcon size={16} />
            </button>
          </div>
          <FoodOrderTimeline orderId={id} />
        </div>
      ))}

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {isLoading && <p className="text-sm text-neutral-500 text-center py-8">Yuklanmoqda…</p>}
        {!isLoading && !items.length && (
          <p className="text-sm text-neutral-500 text-center py-8">Buyurtma topilmadi</p>
        )}
        {items.map((o) => {
          const open = openIds.includes(o.id);
          return (
            <div key={o.id} className="card p-4">
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-extrabold text-lg leading-none">#{o.number}</p>
                  <p className="text-[11px] text-neutral-500 mt-1">
                    {fmtDateTime(o.createdAt)}
                    {!isFoodFinal(o.status) && ` · ${minutesSince(o.createdAt, now)} daq oldin`}
                  </p>
                </div>
                <FoodStatusBadge status={o.status} />
              </div>
              <FoodOrderTags o={o} showCash className="mb-2" />
              <div className="space-y-1.5 text-sm">
                <Row k="Oshxona" v={o.kitchen?.name ?? '—'} />
                <Row k="Mijoz" v={o.clientName ?? '—'} sub={o.phone ?? o.clientPhone ?? undefined} />
                <div className="flex justify-between gap-3">
                  <span className="text-neutral-500 shrink-0">Kuryer</span>
                  <span className="text-right">
                    <CourierCell o={o} />
                  </span>
                </div>
                <p className="text-xs text-neutral-600 pt-1">
                  {o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}
                </p>
                <AddressLine o={o} />
              </div>
              <button
                onClick={() => toggleOpen(o.id)}
                className="mt-3 w-full h-9 rounded-lg border border-line text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ListTree size={14} /> {open ? 'Tafsilotlarni yopish' : 'Tafsilotlar va harakatlar'}
              </button>
              {open && (
                <div className="mt-3 space-y-3">
                  <OrderDetails o={o} />
                  <FoodOrderTimeline orderId={o.id} />
                </div>
              )}
              <div className="flex justify-between items-baseline pt-3 mt-3 border-t border-line">
                <span className="text-xs text-neutral-500">Jami (yetkazish bilan)</span>
                <p className="text-lg font-bold tabular-nums">
                  {som(o.total)} <span className="text-[10px] font-normal text-neutral-500">so‘m</span>
                </p>
              </div>
              {!isFoodFinal(o.status) && (
                <button
                  disabled={cancel.isPending}
                  onClick={() => askCancel(o)}
                  className="mt-3 w-full h-9 rounded-lg bg-red-50 text-red-600 text-xs font-bold flex items-center justify-center gap-1"
                >
                  <XIcon size={14} /> Bekor qilish
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop table */}
      <div className="card overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1200px]">
            <thead>
              <tr>
                <th className="th">#</th>
                <th className="th">Vaqt</th>
                <th className="th">Oshxona</th>
                <th className="th">Mijoz</th>
                <th className="th">Taomlar</th>
                <th className="th">Manzil</th>
                <th className="th">Kuryer</th>
                <th className="th text-right">Summa</th>
                <th className="th text-right">Komissiya</th>
                <th className="th">Status</th>
                <th className="th text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-neutral-500">
                    Yuklanmoqda…
                  </td>
                </tr>
              )}
              {!isLoading && !items.length && (
                <tr>
                  <td colSpan={11} className="p-10 text-center text-neutral-500">
                    Filterga mos ovqat buyurtmasi topilmadi
                  </td>
                </tr>
              )}
              {items.map((o) => {
                const open = openIds.includes(o.id);
                const commission = Number(o.courierCommission ?? 0) + Number(o.kitchenCommission ?? 0);
                return (
                  <Fragment key={o.id}>
                    <tr className={'hover:bg-neutral-50 transition-colors align-top ' + (open ? 'bg-neutral-50' : '')}>
                      <td className="td font-extrabold tabular-nums">#{o.number}</td>
                      <td className="td text-xs text-neutral-500 whitespace-nowrap">
                        {fmtDateTime(o.createdAt)}
                        {!isFoodFinal(o.status) && (
                          <span className="block text-[10px] text-amber-700 font-semibold">
                            {minutesSince(o.createdAt, now)} daq oldin
                          </span>
                        )}
                      </td>
                      <td className="td font-medium">
                        {o.kitchen ? (
                          <Link href={`/kitchens/${o.kitchen.id}`} className="hover:underline">
                            {o.kitchen.name}
                          </Link>
                        ) : (
                          <span className="text-neutral-300">—</span>
                        )}
                      </td>
                      <td className="td">
                        <p className="font-medium">{o.clientName ?? '—'}</p>
                        {(o.phone || o.clientPhone) && (
                          <a href={`tel:${o.phone ?? o.clientPhone}`} className="text-[11px] font-mono text-neutral-500">
                            {o.phone ?? o.clientPhone}
                          </a>
                        )}
                      </td>
                      <td className="td text-xs text-neutral-600 max-w-[240px]">
                        <span className="line-clamp-3">
                          {o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}
                        </span>
                        <FoodOrderTags o={o} className="mt-1" />
                      </td>
                      <td className="td text-xs max-w-[220px]">
                        <AddressLine o={o} />
                      </td>
                      <td className="td text-xs min-w-[150px]">
                        <CourierCell o={o} />
                      </td>
                      <td className="td text-right tabular-nums whitespace-nowrap">
                        <p className="font-bold">{som(o.total)}</p>
                        <p className="text-[10px] text-neutral-500">
                          taom {som(o.itemsTotal)} + yetk. {som(o.deliveryFee)}
                        </p>
                        {Number(o.bonusUsed ?? 0) > 0 && (
                          <p className="text-[10px] text-emerald-700">
                            naqd {som(cashDueOf(o))} · bonus {som(o.bonusUsed)}
                          </p>
                        )}
                      </td>
                      <td className="td text-right tabular-nums text-neutral-600">
                        {commission > 0 ? som(commission) : <span className="text-neutral-300">—</span>}
                      </td>
                      <td className="td">
                        <FoodStatusBadge status={o.status} />
                      </td>
                      <td className="td">
                        <div className="flex gap-1 justify-end">
                          <button
                            onClick={() => toggleOpen(o.id)}
                            title="Tafsilotlar va harakatlar"
                            className={
                              'w-8 h-8 rounded-lg flex items-center justify-center ' +
                              (open ? 'bg-ink text-gold' : 'hover:bg-neutral-100 text-neutral-600')
                            }
                          >
                            <ListTree size={14} />
                          </button>
                          {!isFoodFinal(o.status) && (
                            <button
                              disabled={cancel.isPending}
                              onClick={() => askCancel(o)}
                              title="Bekor qilish"
                              className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-600"
                            >
                              <XIcon size={14} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                    {open && (
                      <tr>
                        <td colSpan={11} className="px-6 py-4 bg-neutral-50/70 border-t border-line">
                          <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-6">
                            <OrderDetails o={o} />
                            <div>
                              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                                Buyurtma harakatlari — oshxona, kimga taklif borgan, kim olgan
                              </p>
                              <FoodOrderTimeline orderId={o.id} />
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4 gap-2 flex-wrap">
        <p className="text-sm text-neutral-500">
          Sahifa <b>{data?.page ?? 1}</b> / {totalPages} · Jami <b>{data?.total ?? 0}</b>
        </p>
        <div className="flex gap-2">
          <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="btn-secondary">
            <ChevronLeft size={16} /> Oldingi
          </button>
          <button disabled={page >= totalPages} onClick={() => setPage((p) => p + 1)} className="btn-secondary">
            Keyingi <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Shell>
  );
}

function Row({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-neutral-500 shrink-0">{k}</span>
      <span className="font-medium text-right">
        {v}
        {sub && <span className="block text-[11px] font-mono text-neutral-500">{sub}</span>}
      </span>
    </div>
  );
}

function AddressLine({ o }: { o: AdminFoodOrder }) {
  return (
    <span className="leading-snug">
      {o.address ? <span className="text-neutral-700">{o.address}</span> : null}{' '}
      <a
        href={osmLink(o.lat, o.lng)}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 whitespace-nowrap text-[11px]"
      >
        {o.address ? 'xarita' : `${Number(o.lat).toFixed(4)}, ${Number(o.lng).toFixed(4)}`}
      </a>
      {o.distanceKm != null && <span className="text-neutral-400 text-[11px]"> · {o.distanceKm} km</span>}
    </span>
  );
}

function CourierCell({ o }: { o: AdminFoodOrder }) {
  if (o.courier) {
    return (
      <span className="inline-block text-left">
        <span className="font-semibold block">{o.courier.fullName}</span>
        <span className="text-[11px] text-neutral-500 block">
          {o.courier.kind === 'courier' ? 'Kuryer' : 'Taksi'}
          {o.courier.carPlate ? ` · ${o.courier.carPlate}` : ''}
          {o.courier.phone ? ` · ${o.courier.phone}` : ''}
        </span>
      </span>
    );
  }
  if (o.status === 'NEW') return <span className="text-neutral-500">Oshxona javobini kutmoqda</span>;
  if (isPickup(o)) return <span className="text-sky-700 font-semibold">Mijoz o‘zi olib ketadi</span>;
  if (isOwnDelivery(o))
    return (
      <span className="text-violet-700 font-semibold">
        Oshxona o‘zi yetkazadi
        {o.status === 'PICKED_UP' && <span className="block text-[11px] font-normal">yo‘lda</span>}
      </span>
    );
  if (o.status === 'COOKING' || o.status === 'READY') {
    if (o.dispatchStage === 'own')
      return <span className="text-amber-700 font-semibold">Oshxonaning o‘z kuryerlariga taklif qilinmoqda…</span>;
    if (o.dispatchStage === 'personal')
      return <span className="text-amber-700 font-semibold">Navbat bilan taklif qilinmoqda…</span>;
    if (o.dispatchStage === 'all')
      return <span className="text-orange-700 font-semibold">O‘rtada — hamma kuryerga signal</span>;
    return <span className="text-red-600 font-semibold">Kuryer topilmagan</span>;
  }
  return <span className="text-neutral-300">—</span>;
}

function OrderDetails({ o }: { o: AdminFoodOrder }) {
  const steps: [string, string | null, string?][] = [
    ['Yaratildi', o.createdAt],
    ['Oshxona qabul qildi', o.acceptedAt, o.prepMinutes ? `${o.prepMinutes} daq` : undefined],
    ['Tayyor', o.readyAt],
    ['Kuryer biriktirildi', o.courierAssignedAt],
    [isOwnDelivery(o) ? 'Yo‘lga chiqdi' : 'Kuryer olib ketdi', isPickup(o) ? null : o.pickedUpAt],
    [isPickup(o) ? 'Mijoz olib ketdi' : 'Yetkazildi', o.deliveredAt],
    [o.status === 'REJECTED' ? 'Rad etildi' : 'Bekor qilindi', o.cancelledAt],
  ];
  return (
    <div className="space-y-3 text-sm">
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs rounded-xl border border-line bg-white p-3">
        <span className="text-neutral-500">Olish turi</span>
        <span className="text-right font-medium">
          {isPickup(o) ? 'Mijoz o‘zi olib ketadi' : 'Yetkazib berish'}
        </span>
        {!isPickup(o) && (
          <>
            <span className="text-neutral-500">Kim yetkazadi</span>
            <span className="text-right font-medium">
              {o.needsCourier === false
                ? 'Oshxona o‘zi'
                : o.courierMode === 'taxi'
                  ? 'Taksi (uzoq — taksi tarifida)'
                  : 'Kuryer'}
            </span>
          </>
        )}
        <span className="text-neutral-500">Kiritgan</span>
        <span className="text-right font-medium">
          {o.createdBy === 'kitchen' ? 'Oshxona (qo‘lda)' : 'Mijoz (ilova / bot)'}
        </span>
      </div>
      <div className="rounded-xl border border-line bg-white p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Taomlar</p>
        <ul className="space-y-1">
          {o.items.map((i, idx) => (
            <li key={`${i.itemId}-${idx}`} className="flex justify-between gap-3 text-xs">
              <span>
                {i.name} <b>× {i.qty}</b>
              </span>
              <span className="tabular-nums text-neutral-600">{som(i.price * i.qty)}</span>
            </li>
          ))}
        </ul>
        <div className="border-t border-line mt-2 pt-2 space-y-0.5 text-xs">
          <div className="flex justify-between">
            <span className="text-neutral-500">Taomlar</span>
            <span className="tabular-nums">{som(o.itemsTotal)} so‘m</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">
              Yetkazish{o.distanceKm != null ? ` (${o.distanceKm} km)` : ''}
            </span>
            <span className="tabular-nums">{som(o.deliveryFee)} so‘m</span>
          </div>
          <div className="flex justify-between font-bold">
            <span>Jami</span>
            <span className="tabular-nums">{som(o.total)} so‘m</span>
          </div>
          {Number(o.bonusUsed ?? 0) > 0 && (
            <div className="flex justify-between text-emerald-700">
              <span>Mijoz bonusidan</span>
              <span className="tabular-nums">−{som(o.bonusUsed)} so‘m</span>
            </div>
          )}
          <div className="flex justify-between font-bold">
            <span>
              Naqd —{' '}
              {isPickup(o) ? 'mijoz oshxonada to‘laydi' : isOwnDelivery(o) ? 'oshxona oladi' : 'kuryer mijozdan oladi'}
            </span>
            <span className="tabular-nums">{som(cashDueOf(o))} so‘m</span>
          </div>
          {(o.courierCommission > 0 || o.kitchenCommission > 0) && (
            <div className="flex justify-between text-neutral-500">
              <span>Komissiya: kuryer / oshxona</span>
              <span className="tabular-nums">
                {som(o.courierCommission)} / {som(o.kitchenCommission)}
              </span>
            </div>
          )}
        </div>
      </div>
      {o.comment && (
        <p className="rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
          💬 {o.comment}
        </p>
      )}
      {o.rejectReason && (
        <p className="rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs px-3 py-2">
          Rad etish sababi: {o.rejectReason}
        </p>
      )}
      {o.cancelledBy && (
        <p className="text-xs text-red-600">
          Bekor qildi: {o.cancelledBy === 'client' ? 'mijoz' : o.cancelledBy === 'admin' ? 'admin' : o.cancelledBy}
        </p>
      )}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
        {steps
          .filter(([, at]) => !!at)
          .map(([label, at, extra]) => (
            <Fragment key={label}>
              <span className="text-neutral-500">{label}</span>
              <span className="tabular-nums text-right">
                {timeHM(at)}
                {extra ? <span className="text-neutral-400"> · {extra}</span> : null}
              </span>
            </Fragment>
          ))}
      </div>
      {o.kitchen?.phone && (
        <p className="text-xs text-neutral-500">
          Oshxona tel:{' '}
          <a href={`tel:${o.kitchen.phone}`} className="font-mono text-ink">
            {o.kitchen.phone}
          </a>
        </p>
      )}
    </div>
  );
}
