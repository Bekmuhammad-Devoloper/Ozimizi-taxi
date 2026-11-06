'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  ChevronRight,
  Phone,
  Check,
  Loader2,
  Ban,
  XCircle,
  MapPin,
  MessageSquare,
  Bike,
  Car,
  ChefHat,
  CheckCircle2,
  Banknote,
  RotateCcw,
  Store,
  Search,
  Navigation,
  Gift,
  Layers,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { MapView } from '@/components/MapView';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FoodImage, KitchenLogo } from '@/components/FoodUi';
import { api, errMsg } from '@/lib/api';
import { fmtDateTime, fmtTime } from '@/lib/date';
import {
  FOOD_RANK,
  FoodFlow,
  FoodOrder,
  courierKindLabel,
  fmtKm,
  foodCashDue,
  foodFlow,
  foodStatusLabel,
  foodStatusShort,
  foodSteps,
  isFoodActive,
  navLinks,
} from '@/lib/food';
import { money } from '@/lib/status';
import { cn } from '@/lib/cn';
import { useFoodStore } from '@/stores/food';

/** Shown for drivers and couriers who have not uploaded a photo. */
const DEFAULT_AVATAR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/img/default-avatar.jpg`;

const POLL_MS = 15_000;

export default function FoodOrderPage() {
  return (
    <Shell>
      <FoodOrderInner />
    </Shell>
  );
}

function FoodOrderInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const stored = useFoodStore((s) => s.orders[id]);
  const all = useFoodStore((s) => s.orders);
  const upsert = useFoodStore((s) => s.upsert);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [actionErr, setActionErr] = useState<string | null>(null);
  const order = stored ?? null;
  const live = isFoodActive(order?.status);

  // Orders placed together with this one (same groupId, other kitchens).
  const siblings = useMemo(
    () =>
      order?.groupId
        ? Object.values(all)
            .filter((o) => o.groupId === order.groupId && o.id !== order.id)
            .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
        : [],
    [all, order?.groupId, order?.id],
  );

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<FoodOrder>(`/client/food/orders/${id}`);
      upsert(data, 'fetch');
      setErr(null);
    } catch (e) {
      if (!useFoodStore.getState().orders[id]) setErr(errMsg(e, 'Buyurtma topilmadi'));
    }
  }, [id, upsert]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sibling orders of a group may not be in the store yet (deep link / reload).
  const groupId = order?.groupId ?? null;
  useEffect(() => {
    if (!groupId) return;
    api
      .get<FoodOrder[]>('/client/food/orders')
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data.filter((o) => o.groupId === groupId) : [];
        if (list.length) useFoodStore.getState().upsertMany(list, 'fetch');
      })
      .catch(() => undefined);
  }, [groupId]);

  // Socket pushes land in the store; poll as a fallback while the order is live.
  useEffect(() => {
    if (!live) return;
    const t = window.setInterval(() => void load(), POLL_MS);
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [live, load]);

  const cancel = async () => {
    if (!order) return;
    setBusy(true);
    setActionErr(null);
    try {
      const { data } = await api.post<FoodOrder>(`/client/food/orders/${order.id}/cancel`);
      upsert(data, 'self');
      setConfirm(false);
    } catch (e) {
      setActionErr(errMsg(e, 'Bekor qilib bo‘lmadi'));
      setConfirm(false);
      void load();
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <div className="p-6 pt-16 flex flex-col items-center text-center text-sm text-neutral-500">
        {err ? (
          <>
            <Ban size={28} className="text-neutral-300 mb-2" />
            {err}
            <button onClick={() => router.push('/food/orders')} className="mt-4 h-11 px-5 rounded-xl bg-ink text-gold font-bold">
              Buyurtmalarim
            </button>
          </>
        ) : (
          <>
            <Loader2 size={24} className="animate-spin mb-2" /> Yuklanmoqda…
          </>
        )}
      </div>
    );
  }

  const flow = foodFlow(order);
  const pickup = flow === 'pickup';
  const failed = order.status === 'REJECTED' || order.status === 'CANCELLED';
  const delivered = order.status === 'DELIVERED';
  const c = order.courier;
  const courierPos = c && c.lat != null && c.lng != null ? { lat: Number(c.lat), lng: Number(c.lng) } : null;
  const dropoff = { lat: Number(order.lat), lng: Number(order.lng) };
  const kitchenPos = order.kitchen ? { lat: Number(order.kitchen.lat), lng: Number(order.kitchen.lng) } : null;
  const readyBy =
    order.status === 'COOKING' && order.acceptedAt && order.prepMinutes
      ? new Date(new Date(order.acceptedAt).getTime() + order.prepMinutes * 60_000).toISOString()
      : null;
  const bonus = Number(order.bonusUsed ?? 0);
  const cash = foodCashDue(order);
  const courierWord = flow === 'taxi' ? 'Taksi' : 'Kuryer';
  // Platform courier card: a courier is assigned, or one is being searched for.
  const showCourier = !failed && (!!c || (live && order.status !== 'NEW' && (flow === 'courier' || flow === 'taxi')));

  return (
    <>
      <div className="animate-in fade-in duration-300">
        {/* header */}
        <header className="bg-ink text-white px-5 pt-10 pb-7 rounded-b-[2rem] relative overflow-hidden">
          <div
            aria-hidden
            className={cn(
              'absolute -right-12 -top-12 w-56 h-56 rounded-full blur-3xl',
              failed ? 'bg-red-400/25' : delivered ? 'bg-emerald-400/30' : 'bg-gold/25',
            )}
          />
          <button onClick={() => router.push('/food/orders')} className="relative text-sm text-neutral-300 flex items-center gap-1 mb-4">
            <ChevronLeft size={16} /> Buyurtmalarim
          </button>
          <div className="relative flex items-center gap-4">
            <span
              className={cn(
                'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0',
                failed ? 'bg-red-500/20 text-red-300' : delivered ? 'bg-emerald-500/20 text-emerald-300' : 'bg-gold/15 text-gold',
              )}
            >
              {failed ? <Ban size={28} /> : delivered ? <CheckCircle2 size={28} /> : <StatusIcon status={order.status} flow={flow} />}
            </span>
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">
                Buyurtma #{order.number} · {fmtTime(order.createdAt)}
              </p>
              <h1 className="text-2xl font-extrabold leading-tight">{foodStatusLabel(order)}</h1>
              <p className="text-sm text-neutral-300 truncate">{order.kitchen?.name ?? ''}</p>
            </div>
          </div>
          {!failed && <FlowBadge flow={flow} />}
          {live && (
            <p className="relative mt-3 text-sm text-neutral-300 leading-snug flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-gold animate-pulse shrink-0" />
              {liveHint(order, flow, readyBy)}
            </p>
          )}
        </header>

        <div className="px-5 mt-4 space-y-4">
          {/* rejected / cancelled */}
          {failed && (
            <div className="rounded-3xl border border-red-200 bg-red-50 p-4">
              <p className="font-extrabold text-red-800 flex items-center gap-2">
                <XCircle size={18} />
                {order.status === 'REJECTED' ? 'Oshxona buyurtmani qabul qila olmadi' : 'Buyurtma bekor qilindi'}
              </p>
              <p className="mt-1 text-sm text-red-700 leading-snug">
                {order.status === 'REJECTED'
                  ? order.rejectReason
                    ? `Sabab: ${order.rejectReason}`
                    : 'Oshxona hozir bu buyurtmani bajara olmaydi.'
                  : order.cancelledBy === 'client'
                    ? 'Siz buyurtmani bekor qildingiz.'
                    : order.cancelledBy === 'admin'
                      ? 'Buyurtma operator tomonidan bekor qilindi.'
                      : 'Buyurtma bekor qilindi.'}
              </p>
              <p className="mt-1 text-xs text-red-600/80">
                Hech qanday to‘lov olinmaydi{bonus > 0 ? ', bonus balansingizga qaytariladi' : ''}. {fmtDateTime(order.cancelledAt ?? order.createdAt)}
              </p>
              <Link
                href="/food"
                className="mt-3 h-11 rounded-2xl bg-ink text-gold font-extrabold flex items-center justify-center gap-2 active:scale-[0.98] transition"
              >
                <Store size={16} /> Boshqa oshxonani tanlash
              </Link>
            </div>
          )}

          {/* tracker */}
          {!failed && <Tracker order={order} />}

          {/* self-pickup: where to go */}
          {pickup && !failed && order.kitchen && (
            <div className="rounded-3xl border border-gold/40 bg-white overflow-hidden shadow-sm">
              {live && kitchenPos && <MapView center={kitchenPos} zoom={16} pickup={kitchenPos} className="relative h-44 border-b border-line" />}
              <div className="p-4">
                <p className="text-[10px] uppercase tracking-widest text-gold-deep font-bold flex items-center gap-1.5">
                  <Store size={12} /> O‘zingiz olib ketasiz
                </p>
                <p className="mt-1 font-extrabold">{order.kitchen.name}</p>
                <p className="text-sm text-neutral-600 leading-snug flex items-start gap-1.5 mt-0.5">
                  <MapPin size={14} className="text-gold-deep shrink-0 mt-0.5" />
                  {order.kitchen.address || 'Manzil xaritada'}
                </p>
                {order.status === 'READY' && (
                  <p className="mt-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold px-3 py-2">
                    Buyurtmangiz tayyor — oshxonaga borib olishingiz mumkin.
                  </p>
                )}
                {live && kitchenPos && (
                  <div className="mt-3 flex gap-2">
                    <a
                      href={navLinks(kitchenPos.lat, kitchenPos.lng).yandex}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 h-11 rounded-2xl bg-ink text-gold text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                    >
                      <Navigation size={15} /> Yandex xarita
                    </a>
                    <a
                      href={navLinks(kitchenPos.lat, kitchenPos.lng).google}
                      target="_blank"
                      rel="noreferrer"
                      className="flex-1 h-11 rounded-2xl border border-line text-sm font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                    >
                      <Navigation size={15} /> Google Maps
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* kitchen's own delivery */}
          {flow === 'kitchen' && !failed && !c && (
            <div className="rounded-3xl border border-line bg-white p-4 shadow-sm flex items-center gap-3">
              <span className="w-12 h-12 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
                <Bike size={22} />
              </span>
              <div className="min-w-0">
                <p className="font-extrabold">Oshxona o‘zi yetkazadi</p>
                <p className="text-xs text-neutral-500 leading-snug">
                  {order.status === 'PICKED_UP'
                    ? 'Buyurtmangiz yo‘lda — savollar bo‘lsa oshxonaga qo‘ng‘iroq qiling.'
                    : delivered
                      ? 'Oshxona yetkazib berdi.'
                      : 'Kuryer kerak emas — oshxona xodimi olib keladi.'}
                </p>
              </div>
            </div>
          )}

          {/* courier */}
          {showCourier && (
            <div className="rounded-3xl border border-line bg-white overflow-hidden shadow-sm">
              {c ? (
                <>
                  {order.status === 'PICKED_UP' && (
                    <MapView
                      center={courierPos ?? dropoff}
                      zoom={15}
                      pickup={dropoff}
                      driver={courierPos}
                      className="relative h-52 border-b border-line"
                    />
                  )}
                  <div className="p-4 flex items-center gap-3">
                    <span className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center shrink-0 overflow-hidden">
                      {c.avatarUrl ? (
                        <FoodImage src={c.avatarUrl} className="w-full h-full" />
                      ) : (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={DEFAULT_AVATAR} alt="" width={56} height={56} className="w-full h-full object-cover" />
                      )}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">{courierKindLabel(c)}</p>
                      <p className="font-extrabold truncate">{c.fullName}</p>
                      {(c.carModel || c.carPlate) && (
                        <p className="text-sm text-neutral-600 truncate flex items-center gap-1.5">
                          {c.carModel}
                          {c.carPlate && (
                            <span className="font-mono text-[12px] font-bold bg-neutral-100 border border-line rounded-md px-1.5 py-0.5 tracking-wide">
                              {c.carPlate}
                            </span>
                          )}
                        </p>
                      )}
                    </div>
                    {live && c.phone && (
                      <a
                        href={`tel:${c.phone}`}
                        aria-label="Kuryerga qo‘ng‘iroq"
                        className="w-12 h-12 rounded-2xl bg-gold text-ink flex items-center justify-center shrink-0 shadow-[0_8px_20px_-8px_rgba(59,155,255,.9)] active:scale-95 transition"
                      >
                        <Phone size={20} />
                      </a>
                    )}
                  </div>
                  {order.status === 'PICKED_UP' && !courierPos && (
                    <p className="px-4 pb-3 -mt-1 text-xs text-neutral-500">{courierWord} joylashuvi hozircha noma’lum.</p>
                  )}
                </>
              ) : (
                <div className="p-4 flex items-center gap-3">
                  <span className="relative w-12 h-12 rounded-2xl bg-gold/15 flex items-center justify-center shrink-0">
                    <Search size={20} className="text-gold-deep" />
                    <span className="absolute inset-0 rounded-2xl ring-2 ring-gold/60 animate-ping" />
                  </span>
                  <div>
                    <p className="font-bold">{flow === 'taxi' ? 'Taksi qidirilmoqda' : 'Kuryer qidirilmoqda'}</p>
                    <p className="text-xs text-neutral-500">
                      {flow === 'taxi'
                        ? 'Manzil uzoq — yaqin taksi haydovchilariga yuborildi.'
                        : 'Yaqin kuryerlarga yuborildi — biriktirilganda xabar beramiz.'}
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* kitchen */}
          {order.kitchen && (
            <div className="rounded-3xl border border-line bg-white p-4 shadow-sm flex items-center gap-3">
              <KitchenLogo url={order.kitchen.logoUrl} size={52} />
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Oshxona</p>
                <Link href={`/food/${order.kitchen.id}`} className="block font-extrabold truncate">
                  {order.kitchen.name}
                </Link>
                {order.kitchen.address && <p className="text-xs text-neutral-500 truncate">{order.kitchen.address}</p>}
              </div>
              {order.kitchen.phone && (
                <a
                  href={`tel:${order.kitchen.phone}`}
                  aria-label="Oshxonaga qo‘ng‘iroq"
                  className="w-12 h-12 rounded-2xl bg-ink text-gold flex items-center justify-center shrink-0 active:scale-95 transition"
                >
                  <Phone size={20} />
                </a>
              )}
            </div>
          )}

          {/* delivery / contact */}
          <div className="rounded-3xl border border-line bg-white p-4 shadow-sm space-y-2 text-sm">
            {pickup ? (
              <p className="flex items-start gap-2.5">
                <Store size={16} className="text-gold-deep shrink-0 mt-0.5" />
                <span className="leading-snug">O‘zi olib ketadi — yetkazib berilmaydi</span>
              </p>
            ) : (
              <p className="flex items-start gap-2.5">
                <MapPin size={16} className="text-gold-deep shrink-0 mt-0.5" />
                <span className="leading-snug">{order.address ?? `${dropoff.lat.toFixed(5)}, ${dropoff.lng.toFixed(5)}`}</span>
              </p>
            )}
            {order.phone && (
              <p className="flex items-center gap-2.5">
                <Phone size={16} className="text-gold-deep shrink-0" />
                <span className="tabular-nums">{order.phone}</span>
              </p>
            )}
            {order.comment && (
              <p className="flex items-start gap-2.5">
                <MessageSquare size={16} className="text-gold-deep shrink-0 mt-0.5" />
                <span className="leading-snug text-neutral-600 whitespace-pre-line">{order.comment}</span>
              </p>
            )}
          </div>

          {/* items + totals */}
          <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Buyurtma tarkibi</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              {order.items.map((i) => (
                <li key={i.itemId} className="flex items-start gap-2">
                  <span className="w-7 shrink-0 font-extrabold tabular-nums text-gold-deep">{i.qty}×</span>
                  <span className="flex-1 min-w-0 leading-snug">{i.name}</span>
                  <span className="font-semibold tabular-nums">{money(i.price * i.qty)}</span>
                </li>
              ))}
            </ul>
            <dl className="mt-3 pt-2 border-t border-dashed border-neutral-200 text-sm">
              <div className="flex justify-between py-1">
                <dt className="text-neutral-500">Taomlar</dt>
                <dd className="font-semibold tabular-nums">{money(order.itemsTotal)} so‘m</dd>
              </div>
              <div className="flex justify-between py-1 gap-3">
                <dt className="text-neutral-500">
                  {pickup ? 'O‘zi olib ketadi' : flow === 'taxi' ? 'Yetkazish (taksi)' : flow === 'kitchen' ? 'Yetkazish (oshxona)' : 'Yetkazish'}
                  {!pickup && order.distanceKm != null && order.distanceKm > 0 ? ` · ${fmtKm(order.distanceKm)}` : ''}
                </dt>
                <dd className="font-semibold tabular-nums">{pickup ? '0 so‘m' : order.deliveryFee ? `${money(order.deliveryFee)} so‘m` : 'Bepul'}</dd>
              </div>
              {bonus > 0 && (
                <>
                  <div className="flex justify-between py-1">
                    <dt className="text-neutral-500">Jami</dt>
                    <dd className="font-semibold tabular-nums">{money(order.total)} so‘m</dd>
                  </div>
                  <div className="flex justify-between py-1 text-emerald-700">
                    <dt className="flex items-center gap-1.5">
                      <Gift size={14} /> Bonusdan to‘landi
                    </dt>
                    <dd className="font-semibold tabular-nums">− {money(bonus)} so‘m</dd>
                  </div>
                </>
              )}
            </dl>
            <div className="mt-2 rounded-2xl bg-gold/15 border border-gold/40 px-3.5 py-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gold-deep flex items-center gap-1.5">
                <Banknote size={14} />
                {failed ? 'Jami' : pickup ? 'Naqd, oshxonada' : flow === 'kitchen' ? 'Naqd, yetkazganda' : flow === 'taxi' ? 'Naqd, haydovchiga' : 'Naqd, kuryerga'}
              </span>
              <span className={cn('text-2xl font-extrabold tabular-nums', failed && 'line-through text-neutral-400')}>
                {money(failed ? order.total : cash)} so‘m
              </span>
            </div>
          </div>

          {/* placed together with other kitchens */}
          {siblings.length > 0 && (
            <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
              <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold flex items-center gap-1.5">
                <Layers size={12} /> Birga berilgan buyurtmalar
              </p>
              <div className="mt-2 divide-y divide-line">
                {siblings.map((s) => (
                  <Link key={s.id} href={`/food/orders/${s.id}`} className="flex items-center gap-3 py-2.5 active:opacity-70">
                    <KitchenLogo url={s.kitchen?.logoUrl} size={36} className="rounded-xl" />
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm font-bold truncate">
                        #{s.number} · {s.kitchen?.name ?? 'Oshxona'}
                      </span>
                      <span className="block text-xs text-neutral-500 truncate">
                        {isFoodActive(s.status) ? foodStatusLabel(s) : foodStatusShort(s)} · {money(foodCashDue(s))} so‘m
                      </span>
                    </span>
                    <ChevronRight size={16} className="text-neutral-300 shrink-0" />
                  </Link>
                ))}
              </div>
            </div>
          )}

          {actionErr && <p className="text-sm text-red-600">{actionErr}</p>}

          {order.status === 'NEW' && (
            <button
              onClick={() => setConfirm(true)}
              disabled={busy}
              className="w-full h-12 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
            >
              <XCircle size={18} /> Buyurtmani bekor qilish
            </button>
          )}
          {live && order.status !== 'NEW' && (
            <p className="text-center text-[11px] text-neutral-500 px-4">
              Oshxona tayyorlashni boshlagan — o‘zgartirish yoki bekor qilish uchun oshxonaga qo‘ng‘iroq qiling.
            </p>
          )}
          {delivered && order.kitchen && (
            <Link
              href={`/food/${order.kitchen.id}`}
              className="w-full h-14 rounded-2xl bg-ink text-gold font-extrabold flex items-center justify-center gap-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,.6)] active:scale-[0.98] transition"
            >
              <RotateCcw size={18} /> Yana buyurtma berish
            </Link>
          )}
        </div>
      </div>

      <ConfirmSheet
        open={confirm}
        title="Buyurtma bekor qilinsinmi?"
        text={`Oshxona hali qabul qilmagan — bekor qilish bepul.${bonus > 0 ? ` Bonusdan to‘langan ${money(bonus)} so‘m balansingizga qaytadi.` : ''}${
          siblings.length ? ' Boshqa oshxonalardagi buyurtmalar o‘z holicha qoladi.' : ''
        }`}
        confirmLabel="Ha, bekor qilish"
        cancelLabel="Qolsin"
        danger
        busy={busy}
        onConfirm={() => void cancel()}
        onClose={() => setConfirm(false)}
      />
    </>
  );
}

function FlowBadge({ flow }: { flow: FoodFlow }) {
  if (flow === 'courier') return null;
  const meta =
    flow === 'pickup'
      ? { icon: <Store size={12} />, text: 'O‘zi olib ketadi' }
      : flow === 'kitchen'
        ? { icon: <Bike size={12} />, text: 'Oshxona o‘zi yetkazadi' }
        : { icon: <Car size={12} />, text: 'Taksi yetkazadi' };
  return (
    <span className="relative mt-3 inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-white/10 ring-1 ring-white/15 text-xs font-bold text-gold">
      {meta.icon} {meta.text}
    </span>
  );
}

function liveHint(o: FoodOrder, flow: FoodFlow, readyBy: string | null): string {
  const c = o.courier;
  switch (o.status) {
    case 'NEW':
      return 'Oshxona buyurtmangizni ko‘rib chiqmoqda. Hozircha bekor qilish mumkin.';
    case 'COOKING':
      return readyBy ? `Taxminan ${fmtTime(readyBy)} gacha tayyor bo‘ladi (~${o.prepMinutes} daq).` : 'Oshxona taomlaringizni tayyorlamoqda.';
    case 'READY':
      if (flow === 'pickup') return 'Buyurtma tayyor — oshxonaga borib olishingiz mumkin.';
      if (flow === 'kitchen') return 'Ovqat tayyor — oshxona tez orada yo‘lga chiqaradi.';
      if (c) return `${c.fullName} olib ketish uchun keladi.`;
      return flow === 'taxi' ? 'Ovqat tayyor — taksi qidirilmoqda.' : 'Ovqat tayyor — kuryer qidirilmoqda.';
    case 'PICKED_UP':
      if (flow === 'kitchen') return 'Oshxona buyurtmangizni olib kelmoqda — telefoningiz yoningizda bo‘lsin.';
      if (flow === 'taxi') return 'Taksi buyurtmangizni olib kelmoqda — telefoningiz yoningizda bo‘lsin.';
      return 'Kuryer buyurtmangizni olib kelmoqda — telefoningiz yoningizda bo‘lsin.';
    default:
      return '';
  }
}

function StatusIcon({ status, flow }: { status: FoodOrder['status']; flow: FoodFlow }) {
  if (status === 'NEW') return <Loader2 size={26} className="animate-spin" />;
  if (status === 'COOKING') return <ChefHat size={28} />;
  if (status === 'READY') return flow === 'pickup' ? <Store size={28} /> : <CheckCircle2 size={28} />;
  return flow === 'taxi' ? <Car size={28} /> : <Bike size={28} />;
}

function stepHint(o: FoodOrder, flow: FoodFlow): string {
  switch (o.status) {
    case 'NEW':
      return 'Oshxona buyurtmani ko‘rib chiqmoqda…';
    case 'COOKING':
      return o.courier ? `${o.courier.kind === 'taxi' ? 'Taksi' : 'Kuryer'}: ${o.courier.fullName}` : `Taxminan ${o.prepMinutes ?? 30} daqiqa`;
    case 'READY':
      if (flow === 'pickup') return o.kitchen?.address ? `Manzil: ${o.kitchen.address}` : 'Oshxonaga borib oling';
      if (flow === 'kitchen') return 'Oshxona yetkazib beradi';
      return o.courier ? `${o.courier.fullName} olib ketadi` : flow === 'taxi' ? 'Taksi qidirilmoqda' : 'Kuryer qidirilmoqda';
    case 'PICKED_UP':
      if (flow === 'kitchen') return 'Oshxona xodimi sizga qarab kelmoqda';
      return flow === 'taxi' ? 'Taksi sizga qarab kelmoqda' : 'Kuryer sizga qarab kelmoqda';
    default:
      return '';
  }
}

/** Vertical step tracker (4 steps for self-pickup, 5 for delivery) with the time each step happened. */
function Tracker({ order }: { order: FoodOrder }) {
  const flow = foodFlow(order);
  const steps = foodSteps(order);
  const rank = FOOD_RANK[order.status];
  const delivered = order.status === 'DELIVERED';
  // The step we're at = the last one whose status was reached (pickup skips PICKED_UP).
  let at = 0;
  steps.forEach((s, i) => {
    if (FOOD_RANK[s.key] <= rank) at = i;
  });
  return (
    <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
      <ol className="relative">
        {steps.map((s, i) => {
          const done = i < at || delivered;
          const current = i === at && !delivered;
          const time = order[s.at] as string | null | undefined;
          const last = i === steps.length - 1;
          return (
            <li key={s.key} className="relative flex gap-3 pb-4 last:pb-0">
              {!last && (
                <span aria-hidden className={cn('absolute left-[13px] top-7 bottom-0 w-0.5', done ? 'bg-gold' : 'bg-neutral-200')} />
              )}
              <span
                className={cn(
                  'relative z-10 w-7 h-7 rounded-full flex items-center justify-center shrink-0 transition-colors',
                  done ? 'bg-gold text-ink' : current ? 'bg-ink text-gold' : 'bg-neutral-100 text-neutral-400',
                )}
              >
                {done ? <Check size={15} strokeWidth={3} /> : current ? <span className="w-2.5 h-2.5 rounded-full bg-gold animate-pulse" /> : <span className="text-[11px] font-bold">{i + 1}</span>}
                {current && <span className="absolute inset-0 rounded-full ring-2 ring-gold/50 animate-ping" />}
              </span>
              <div className="flex-1 min-w-0 pt-0.5 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('text-sm leading-snug', done || current ? 'font-bold text-ink' : 'text-neutral-400')}>{s.title}</p>
                  {current && <p className="text-xs text-neutral-500 mt-0.5">{stepHint(order, flow)}</p>}
                </div>
                <span className={cn('text-xs tabular-nums shrink-0', time ? 'text-neutral-500 font-semibold' : 'text-neutral-300')}>{time ? fmtTime(time) : '—'}</span>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
