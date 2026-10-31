'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  ChevronLeft,
  LocateFixed,
  Loader2,
  MapPin,
  Phone,
  MessageSquare,
  Banknote,
  ShoppingBag,
  Info,
  X,
  Ban,
  Bike,
  Car,
  Trash2,
  Gift,
  Store,
  Navigation,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { MapView } from '@/components/MapView';
import { ConfirmSheet } from '@/components/ConfirmSheet';
import { FoodImage, KitchenLogo, QtyControl } from '@/components/FoodUi';
import { api, errMsg } from '@/lib/api';
import { reverseGeocode } from '@/lib/geocode';
import { currentLocation, DEFAULT_POS, lastLocation, Pos } from '@/lib/location';
import { isTelegram } from '@/lib/telegram';
import { FoodDeliveryType, FoodOrder, KitchenInfo, KitchenMenu, fmtKm, navLinks, newGroupId } from '@/lib/food';
import { money } from '@/lib/status';
import { cn } from '@/lib/cn';
import { useAuthStore } from '@/stores/auth';
import { CartGroup, cartCount, cartGroups, cartSum, useCartStore } from '@/stores/cart';
import { useFoodStore } from '@/stores/food';

/** GET /client/food/bonus-max */
interface BonusAllowance {
  max: number;
  balance: number;
  capPercent: number;
  note: string | null;
}

export default function CheckoutPage() {
  return (
    <Shell nav={false}>
      <CheckoutInner />
    </Shell>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const client = useAuthStore((s) => s.client);
  const lines = useCartStore((s) => s.lines);
  const kitchens = useCartStore((s) => s.kitchens);
  const setQty = useCartStore((s) => s.setQty);
  const removeKitchen = useCartStore((s) => s.removeKitchen);
  const groups = useMemo(() => cartGroups(lines, kitchens), [lines, kitchens]);
  const idsKey = groups.map((g) => g.kitchen.id).join(',');

  const initial = useMemo(() => lastLocation() ?? DEFAULT_POS, []);
  const [mode, setMode] = useState<FoodDeliveryType>('delivery');
  const [center, setCenter] = useState<Pos>(initial);
  const [follow, setFollow] = useState<Pos | null>(null);
  const [dragging, setDragging] = useState(false);
  const [locating, setLocating] = useState(false);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [address, setAddress] = useState('');
  const [addrLoading, setAddrLoading] = useState(true);
  const [details, setDetails] = useState('');
  const [phone, setPhone] = useState(client?.phonePrimary ?? '');
  const [comment, setComment] = useState('');
  /** Kitchen quotes for the drop-off point: fee, open state, address, coordinates. */
  const [quotes, setQuotes] = useState<Record<string, KitchenInfo>>({});
  const [quoting, setQuoting] = useState(false);
  /** Several kitchens → one courier collects all: one delivery fee for the group. */
  const [groupQuote, setGroupQuote] = useState<{ key: string; fee: number; mode: 'courier' | 'taxi'; km: number } | null>(null);
  const [quoteErr, setQuoteErr] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [allow, setAllow] = useState<Record<string, BonusAllowance>>({});
  const [useBonus, setUseBonus] = useState(false);
  /** Bonus the client asked for; null = as much as allowed. */
  const [bonusWanted, setBonusWanted] = useState<number | null>(null);
  const [dropKitchen, setDropKitchen] = useState<CartGroup['kitchen'] | null>(null);
  const [busy, setBusy] = useState(false);
  const [placed, setPlaced] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /** Orders already placed from this checkout (a partial run keeps them here). */
  const [sent, setSent] = useState<FoodOrder[]>([]);
  const userMoved = useRef(false);
  const programmatic = useRef(false);
  const geoSeq = useRef(0);
  const quoteSeq = useRef(0);
  const bonusSeq = useRef(0);
  const groupId = useRef<string | null>(null);

  useEffect(() => {
    if (!phone && client?.phonePrimary) setPhone(client.phonePrimary);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [client?.phonePrimary]);

  const goTo = (p: Pos) => {
    programmatic.current = true;
    setFollow({ ...p });
  };

  const locate = useCallback(async (force: boolean) => {
    setLocating(true);
    setGeoErr(null);
    try {
      const p = await currentLocation();
      // Don't yank the map away if the client already chose a point by hand.
      if (force || !userMoved.current) goTo(p);
    } catch (e: any) {
      setGeoErr(e?.message ?? 'Joylashuv aniqlanmadi');
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void locate(false);
  }, [locate]);

  /** Every kitchen in the cart, quoted for the drop-off point (fee, open state, fresh prices). */
  const fetchQuotes = useCallback(async (p: Pos, ids: string[]) => {
    if (!ids.length) return;
    const seq = ++quoteSeq.current;
    setQuoting(true);
    setQuoteErr(null);
    const res = await Promise.allSettled(
      ids.map((id) => api.get<KitchenMenu>(`/client/food/kitchens/${id}`, { params: { lat: p.lat, lng: p.lng } }).then((r) => r.data)),
    );
    const gq =
      ids.length > 1
        ? await api
            .get('/client/food/group-quote', { params: { kitchenIds: ids.join(','), lat: p.lat, lng: p.lng } })
            .then((r) => r.data)
            .catch(() => null)
        : null;
    if (seq !== quoteSeq.current) return;
    setGroupQuote(gq ? { key: ids.join(','), fee: Number(gq.fee), mode: gq.mode, km: Number(gq.km) } : null);
    const next: Record<string, KitchenInfo> = {};
    const gone: string[] = [];
    let failed: unknown = null;
    res.forEach((r) => {
      if (r.status === 'rejected') {
        failed = failed ?? r.reason;
        return;
      }
      const k = r.value.kitchen;
      next[k.id] = k;
      gone.push(...useCartStore.getState().sync({ id: k.id, name: k.name, logoUrl: k.logoUrl, minOrder: k.minOrder }, r.value.items));
    });
    setQuotes((q) => ({ ...q, ...next }));
    if (gone.length) setRemoved((r) => Array.from(new Set([...r, ...gone])));
    if (failed) setQuoteErr(errMsg(failed, 'Yetkazish narxini hisoblab bo‘lmadi'));
    setQuoting(false);
  }, []);

  // Pin moved / kitchens changed → address label + quotes (debounced).
  useEffect(() => {
    if (!idsKey) return;
    setAddrLoading(true);
    const t = window.setTimeout(() => {
      const seq = ++geoSeq.current;
      void reverseGeocode(center.lat, center.lng).then((a) => {
        if (seq !== geoSeq.current) return;
        setAddress(a ?? '');
        setAddrLoading(false);
      });
      void fetchQuotes(center, idsKey.split(','));
    }, 700);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, idsKey, fetchQuotes]);

  const pickup = mode === 'pickup';
  // Several kitchens: the first order carries the group's one fee (as the server does), the rest 0.
  const groupFee = groups.length > 1 && groupQuote?.key === idsKey ? groupQuote : null;
  const feeOf = (id: string): number | null => {
    if (pickup) return 0;
    if (groups.length > 1) return groupFee ? (id === groups[0].kitchen.id ? groupFee.fee : 0) : null;
    return quotes[id]?.deliveryFee ?? null;
  };
  const orderTotal = (g: CartGroup) => cartSum(g.lines) + (feeOf(g.kitchen.id) ?? 0);
  const bonusKey = groups.map((g) => `${g.kitchen.id}:${orderTotal(g)}`).join('|');

  // Bonus allowance per order (each kitchen is its own order with its own cap).
  useEffect(() => {
    if (!bonusKey) return;
    const t = window.setTimeout(() => {
      const seq = ++bonusSeq.current;
      const wanted = bonusKey.split('|').map((x) => {
        const [id, total] = x.split(':');
        return { id, total: Number(total) || 0 };
      });
      void Promise.all(
        wanted.map(({ id, total }) =>
          api
            .get<BonusAllowance>('/client/food/bonus-max', { params: { total } })
            .then((r) => [id, r.data] as const)
            .catch(() => null),
        ),
      ).then((rows) => {
        if (seq !== bonusSeq.current) return;
        const next: Record<string, BonusAllowance> = {};
        for (const r of rows) if (r) next[r[0]] = r[1];
        setAllow(next);
      });
    }, 500);
    return () => window.clearTimeout(t);
  }, [bonusKey]);

  if (placed) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-2 text-sm text-neutral-500">
        <Loader2 size={24} className="animate-spin" /> Buyurtma yuborildi…
      </div>
    );
  }

  if (!groups.length) {
    return (
      <div className="min-h-[100dvh] flex flex-col">
        <TopBar title="Savat" onBack={() => router.push('/food')} />
        <div className="flex-1 flex flex-col items-center justify-center text-center px-8 pb-16">
          <span className="w-20 h-20 rounded-3xl bg-gold/15 text-gold-deep flex items-center justify-center mb-4">
            <ShoppingBag size={34} />
          </span>
          <p className="text-xl font-extrabold">Savat bo‘sh</p>
          <p className="mt-1 text-sm text-neutral-500">Oshxonani tanlang va sevimli taomlaringizni qo‘shing.</p>
          {removed.length > 0 && <p className="mt-3 text-xs text-amber-700">Menyuda endi yo‘q: {removed.join(', ')}</p>}
          <Link href="/food" className="mt-6 h-12 px-6 rounded-2xl bg-ink text-gold font-extrabold flex items-center gap-2 active:scale-[0.98] transition">
            Oshxonalarni ko‘rish
          </Link>
          {sent.length > 0 && (
            <Link href="/food/orders" className="mt-3 text-sm font-bold text-gold-deep">
              Yuborilgan buyurtmalar ({sent.length})
            </Link>
          )}
        </div>
      </div>
    );
  }

  // ---- totals, per order and overall
  const multi = groups.length > 1;
  const rows = groups.map((g) => {
    const q = quotes[g.kitchen.id];
    const itemsTotal = cartSum(g.lines);
    const fee = feeOf(g.kitchen.id);
    const minOrder = q?.minOrder ?? g.kitchen.minOrder ?? 0;
    return {
      g,
      q,
      itemsTotal,
      fee,
      total: itemsTotal + (fee ?? 0),
      minOrder,
      belowMin: itemsTotal < minOrder,
      isOpen: q?.isOpen ?? true,
      maxBonus: Math.max(0, Math.floor(allow[g.kitchen.id]?.max ?? 0)),
    };
  });
  const allowList = Object.values(allow);
  const balance = Math.floor(Math.max(0, ...allowList.map((a) => Number(a.balance) || 0)));
  const bonusCap = Math.min(balance, rows.reduce((s, r) => s + r.maxBonus, 0));
  const bonusAmt = useBonus ? Math.max(0, Math.min(bonusWanted ?? bonusCap, bonusCap)) : 0;
  // Bonus fills the orders in cart order, each up to its own cap.
  const plan: Record<string, number> = {};
  {
    let left = bonusAmt;
    for (const r of rows) {
      const x = Math.min(left, r.maxBonus);
      plan[r.g.kitchen.id] = x;
      left -= x;
    }
  }
  const capPercent = allowList.find((a) => a.capPercent > 0)?.capPercent ?? 0;
  const bonusNote = allowList.find((a) => a.note)?.note ?? null;
  const itemsAll = rows.reduce((s, r) => s + r.itemsTotal, 0);
  const feeKnown = rows.every((r) => r.fee != null);
  const feeAll = rows.reduce((s, r) => s + (r.fee ?? 0), 0);
  const totalAll = itemsAll + feeAll;
  const cashAll = Math.max(0, totalAll - bonusAmt);
  const km = !multi ? rows[0].q?.distanceKm ?? null : groupFee?.km ?? null;
  const taxiFee = !pickup && (multi ? groupFee?.mode === 'taxi' : rows.some((r) => r.q?.courierMode === 'taxi'));

  const phoneOk = phone.replace(/\D/g, '').length >= 9;
  const blocked = rows.filter((r) => !r.isOpen || r.belowMin);
  const canOrder = !busy && !(dragging && !pickup) && blocked.length === 0 && phoneOk;

  const setPickup = (p: boolean) => {
    // The map unmounts in pickup mode; forget a pending recenter so it does not override the chosen point later.
    setFollow(null);
    programmatic.current = false;
    setDragging(false);
    setMode(p ? 'pickup' : 'delivery');
  };

  const submit = async () => {
    if (!canOrder) return;
    setBusy(true);
    setErr(null);
    const gid = groupId.current ?? (groupId.current = newGroupId());
    const fullAddress = [address.trim(), details.trim()].filter(Boolean).join(', ').slice(0, 255);
    const ok: FoodOrder[] = [];
    const fails: string[] = [];
    // One order per kitchen, all sharing the group id; sequential so the bonus holds stack up correctly.
    for (const r of rows) {
      try {
        const { data } = await api.post<FoodOrder>('/client/food/orders', {
          kitchenId: r.g.kitchen.id,
          items: r.g.lines.map((l) => ({ itemId: l.itemId, qty: l.qty })),
          // Self-pickup needs no point: the server uses the kitchen's.
          ...(pickup ? {} : { lat: center.lat, lng: center.lng }),
          address: pickup ? null : fullAddress || null,
          phone: phone.trim(),
          comment: comment.trim() || null,
          source: isTelegram() ? 'bot' : 'app',
          deliveryType: mode,
          bonus: plan[r.g.kitchen.id] > 0 ? plan[r.g.kitchen.id] : 0,
          groupId: gid,
        });
        useFoodStore.getState().upsert(data, 'self');
        ok.push(data);
      } catch (e) {
        fails.push(`${r.g.kitchen.name}: ${errMsg(e, 'buyurtma berib bo‘lmadi')}`);
      }
    }
    const all = [...sent, ...ok];
    if (!fails.length) {
      setPlaced(true);
      useCartStore.getState().clear();
      groupId.current = null;
      router.replace(all.length === 1 ? `/food/orders/${all[0].id}` : '/food/orders');
      return;
    }
    // Partial: keep only the kitchens that failed in the cart, show why.
    for (const o of ok) if (o.kitchen?.id) removeKitchen(o.kitchen.id);
    setSent(all);
    setUseBonus(false);
    setBonusWanted(null);
    setErr(
      (ok.length ? `${ok.length} ta buyurtma yuborildi. ` : '') +
        `Yuborilmadi — ${fails.join('; ')}`,
    );
    void fetchQuotes(center, idsKey.split(',')); // menu / prices / open state may have changed
    setBusy(false);
  };

  const submitLabel = busy
    ? 'Yuborilmoqda…'
    : `${multi ? `${rows.length} ta buyurtma berish` : 'Buyurtma berish'}${feeKnown ? ` · ${money(cashAll)} so‘m` : ''}`;

  return (
    <>
      <div className="animate-in fade-in duration-300 pb-32">
        <TopBar
          title="Buyurtmani rasmiylashtirish"
          subtitle={multi ? `${rows.length} ta oshxona · ${rows.length} ta alohida buyurtma` : rows[0].g.kitchen.name}
          onBack={() => router.push(multi ? '/food' : `/food/${rows[0].g.kitchen.id}`)}
        />

        {/* delivery / self-pickup */}
        <section className="px-4 mt-4">
          <div className="grid grid-cols-2 gap-1 p-1 rounded-2xl bg-white border border-line shadow-sm">
            <ModeButton active={!pickup} onClick={() => setPickup(false)} icon={<Bike size={16} />}>
              Yetkazib berish
            </ModeButton>
            <ModeButton active={pickup} onClick={() => setPickup(true)} icon={<Store size={16} />}>
              O‘zim olib ketaman
            </ModeButton>
          </div>
        </section>

        {!pickup ? (
          /* delivery point */
          <section className="px-4 mt-4">
            <SectionTitle icon={<MapPin size={14} />}>Yetkazish manzili</SectionTitle>
            <div className="relative rounded-3xl overflow-hidden border border-line shadow-sm">
              <MapView
                center={center}
                zoom={16}
                pinAtCenter
                follow={follow}
                onMoveStart={() => {
                  setDragging(true);
                  if (!programmatic.current) userMoved.current = true;
                }}
                onMoveEnd={(c) => {
                  programmatic.current = false;
                  setDragging(false);
                  setCenter(c);
                }}
                className="relative h-60"
              />
              <span className="absolute top-3 left-3 z-[500] pointer-events-none rounded-xl bg-ink/85 backdrop-blur text-white text-[11px] font-semibold px-2.5 py-1.5">
                {dragging ? 'Nuqta tanlanmoqda…' : 'Xaritani surib nuqtani belgilang'}
              </span>
              <button
                onClick={() => void locate(true)}
                title="Mening joylashuvim"
                className="absolute bottom-3 right-3 z-[500] w-11 h-11 rounded-2xl bg-white shadow-lg shadow-black/20 flex items-center justify-center text-ink active:scale-95 transition"
              >
                {locating ? <Loader2 size={18} className="animate-spin" /> : <LocateFixed size={18} />}
              </button>
            </div>
            {geoErr && <p className="mt-1.5 text-[11px] text-neutral-500 px-1">{geoErr} — nuqtani xaritada qo‘lda belgilang.</p>}

            <label className="mt-3 block">
              <span className="sr-only">Manzil</span>
              <div className="relative">
                <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gold-deep" />
                {addrLoading && !address ? (
                  <div className="input pl-9 flex items-center">
                    <div className="h-4 w-2/3 rounded skeleton" />
                  </div>
                ) : (
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Ko‘cha, uy raqami"
                    className="input pl-9 rounded-2xl font-semibold"
                  />
                )}
              </div>
            </label>
            <input
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              placeholder="Xonadon, podyezd, qavat (ixtiyoriy)"
              className="input mt-2 rounded-2xl"
            />
            {multi && (
              <p className="mt-2 px-1 text-[11px] text-neutral-500 leading-snug">
                Har bir oshxona o‘z buyurtmasini alohida yetkazadi — yetkazish narxi har biriga alohida hisoblanadi.
              </p>
            )}
          </section>
        ) : (
          <section className="px-4 mt-4">
            <div className="rounded-3xl border border-gold/40 bg-gradient-to-br from-gold/15 to-gold/5 p-4 flex items-start gap-3">
              <span className="w-11 h-11 rounded-2xl bg-ink text-gold flex items-center justify-center shrink-0">
                <Store size={20} />
              </span>
              <div className="min-w-0 text-sm leading-snug">
                <p className="font-extrabold">O‘zingiz olib ketasiz</p>
                <p className="mt-0.5 text-neutral-600">
                  Buyurtma tayyor bo‘lgach xabar beramiz — oshxonaga borib olasiz. Yetkazish yo‘q, shuning uchun <b>0 so‘m</b>.
                  {multi && ' Har bir oshxonaning manzili quyida.'}
                </p>
              </div>
            </div>
          </section>
        )}

        {/* contact */}
        <section className="px-4 mt-5">
          <SectionTitle icon={<Phone size={14} />}>Aloqa</SectionTitle>
          <div className="relative">
            <Phone size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d+\s()-]/g, '').slice(0, 20))}
              inputMode="tel"
              autoComplete="tel"
              placeholder="+998 90 123 45 67"
              className={cn('input pl-9 rounded-2xl font-semibold tabular-nums', !phoneOk && phone && 'border-red-300')}
            />
          </div>
          <div className="relative mt-2">
            <MessageSquare size={16} className="absolute left-3 top-3.5 text-neutral-400" />
            <textarea
              value={comment}
              onChange={(e) => setComment(e.target.value.slice(0, 500))}
              rows={2}
              placeholder={pickup ? 'Izoh: soat nechada kelasiz, achchiqsiz…' : 'Izoh: mo‘ljal, domofon kodi, achchiqsiz…'}
              className="w-full px-3 pl-9 py-3 text-base bg-white border border-line rounded-2xl outline-none focus:border-ink focus:ring-2 focus:ring-gold/40 transition-colors resize-none"
            />
          </div>
        </section>

        {/* orders, one card per kitchen */}
        <section className="px-4 mt-5">
          <SectionTitle icon={<ShoppingBag size={14} />}>{multi ? `Buyurtmalar · ${rows.length} ta oshxona` : 'Buyurtma'}</SectionTitle>
          <div className="space-y-3">
            {rows.map((r, i) => {
              const k = r.g.kitchen;
              const prep = r.q?.prepMinutes ?? null;
              const nav = r.q ? navLinks(r.q.lat, r.q.lng) : null;
              const bonusHere = plan[k.id] ?? 0;
              return (
                <div key={k.id} className="rounded-3xl border border-line bg-white shadow-sm overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3 border-b border-line">
                    <KitchenLogo url={k.logoUrl} size={40} className="rounded-xl" dim={!r.isOpen} />
                    <div className="flex-1 min-w-0">
                      <p className="font-extrabold truncate">
                        {multi && <span className="text-gold-deep tabular-nums">{i + 1}. </span>}
                        {k.name}
                      </p>
                      <p className="text-[11px] text-neutral-500">
                        {cartCount(r.g.lines)} ta taom{prep ? ` · tayyorlash ~${prep} daq` : ''}
                      </p>
                    </div>
                    <Link href={`/food/${k.id}`} className="text-xs font-bold text-gold-deep shrink-0">
                      + Qo‘shish
                    </Link>
                    {multi && (
                      <button
                        onClick={() => setDropKitchen(k)}
                        aria-label="Oshxonani savatdan olib tashlash"
                        className="w-8 h-8 -mr-1 rounded-xl flex items-center justify-center text-neutral-400 active:bg-neutral-100 shrink-0"
                      >
                        <Trash2 size={15} />
                      </button>
                    )}
                  </div>

                  {pickup && (
                    <div className="px-4 py-3 border-b border-line bg-paper/60 text-sm">
                      <p className="flex items-start gap-2">
                        <MapPin size={15} className="text-gold-deep shrink-0 mt-0.5" />
                        <span className="leading-snug">
                          {r.q?.address || 'Oshxona manzili'}
                          {r.q?.distanceKm != null && <span className="text-neutral-400"> · sizdan ~{fmtKm(r.q.distanceKm)}</span>}
                        </span>
                      </p>
                      {nav && (
                        <div className="mt-2 flex gap-2">
                          <a
                            href={nav.yandex}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 h-9 rounded-xl bg-ink text-gold text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                          >
                            <Navigation size={13} /> Yandex xarita
                          </a>
                          <a
                            href={nav.google}
                            target="_blank"
                            rel="noreferrer"
                            className="flex-1 h-9 rounded-xl border border-line bg-white text-xs font-bold flex items-center justify-center gap-1.5 active:scale-[0.98] transition"
                          >
                            <Navigation size={13} /> Google Maps
                          </a>
                        </div>
                      )}
                    </div>
                  )}

                  <ul className="divide-y divide-line">
                    {r.g.lines.map((l) => (
                      <li key={l.itemId} className="flex items-center gap-3 px-4 py-3">
                        <span className="w-12 h-12 rounded-xl overflow-hidden shrink-0 bg-neutral-100">
                          <FoodImage src={l.photoUrl} className="w-full h-full" iconSize={18} />
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold leading-snug line-clamp-2">{l.name}</p>
                          <p className="text-xs text-neutral-500 tabular-nums">{money(l.price * l.qty)} so‘m</p>
                        </div>
                        <div className="flex items-center gap-1">
                          {l.qty === 1 && (
                            <button
                              onClick={() => setQty(l.itemId, 0)}
                              aria-label="O‘chirish"
                              className="w-8 h-8 rounded-xl flex items-center justify-center text-neutral-400 active:bg-neutral-100"
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                          <QtyControl
                            qty={l.qty}
                            size="sm"
                            className="w-24"
                            onInc={() => setQty(l.itemId, l.qty + 1)}
                            onDec={() => setQty(l.itemId, l.qty - 1)}
                          />
                        </div>
                      </li>
                    ))}
                  </ul>

                  {!r.isOpen && (
                    <div className="px-4 py-2.5 border-t border-line bg-neutral-100 text-xs text-neutral-700 flex items-start gap-2">
                      <Ban size={14} className="shrink-0 mt-0.5" />
                      <span>
                        <b>Oshxona hozir yopiq.</b> {multi ? 'Bu oshxonani savatdan olib tashlang yoki ochilishini kuting.' : 'Ochilgandan keyin buyurtma bera olasiz.'}
                      </span>
                    </div>
                  )}
                  {r.isOpen && r.belowMin && (
                    <div className="px-4 py-2.5 border-t border-amber-200 bg-amber-50 text-xs text-amber-900 flex items-start gap-2">
                      <Info size={14} className="shrink-0 mt-0.5" />
                      <span>
                        Minimal buyurtma — <b>{money(r.minOrder)} so‘m</b>. Yana <b>{money(r.minOrder - r.itemsTotal)} so‘m</b>lik taom qo‘shing.{' '}
                        <Link href={`/food/${k.id}`} className="font-bold underline underline-offset-2">
                          Menyuga
                        </Link>
                      </span>
                    </div>
                  )}

                  {multi && (
                    <dl className="px-4 py-2.5 border-t border-dashed border-neutral-200 text-xs grid grid-cols-2 gap-x-3 gap-y-1">
                      <dt className="text-neutral-500">Taomlar</dt>
                      <dd className="text-right font-semibold tabular-nums">{money(r.itemsTotal)} so‘m</dd>
                      <dt className="text-neutral-500 flex items-center gap-1">
                        {pickup ? <Store size={12} /> : r.q?.courierMode === 'taxi' ? <Car size={12} /> : <Bike size={12} />}
                        {pickup ? 'Olib ketish' : taxiFee ? 'Taksi yetkazadi' : 'Yetkazish'}
                        {!pickup && r.q?.distanceKm != null && ` · ${fmtKm(r.q.distanceKm)}`}
                      </dt>
                      <dd className="text-right font-semibold tabular-nums">
                        {!pickup && r.fee === 0 && groupFee ? 'umumiy narxda' : <FeeValue fee={r.fee} loading={quoting} />}
                      </dd>
                      {bonusHere > 0 && (
                        <>
                          <dt className="text-emerald-700">Bonusdan</dt>
                          <dd className="text-right font-semibold tabular-nums text-emerald-700">− {money(bonusHere)} so‘m</dd>
                        </>
                      )}
                      <dt className="font-bold text-ink">Naqd</dt>
                      <dd className="text-right font-extrabold tabular-nums text-ink">{money(Math.max(0, r.total - bonusHere))} so‘m</dd>
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
          {removed.length > 0 && (
            <div className="mt-2 rounded-2xl bg-amber-50 border border-amber-200 p-3 text-xs flex items-start gap-2 text-amber-900">
              <Info size={15} className="shrink-0" />
              <span className="flex-1">Menyuda endi yo‘q, savatdan olib tashlandi: {removed.join(', ')}</span>
              <button onClick={() => setRemoved([])} aria-label="Yopish">
                <X size={14} />
              </button>
            </div>
          )}
          <Link href="/food" className="mt-3 h-11 rounded-2xl border border-dashed border-line bg-white/60 text-sm font-bold text-neutral-600 flex items-center justify-center gap-1.5">
            + Boshqa oshxonadan qo‘shish
          </Link>
        </section>

        {/* bonus */}
        {(balance > 0 || bonusNote) && (
          <section className="px-4 mt-5">
            <BonusCard
              balance={balance}
              cap={bonusCap}
              capPercent={capPercent}
              note={bonusNote}
              enabled={useBonus}
              amount={bonusAmt}
              multi={multi}
              onToggle={(on) => {
                setUseBonus(on);
                setBonusWanted(null);
              }}
              onChange={(v) => setBonusWanted(Math.max(0, Math.min(bonusCap, Math.round(v))))}
            />
          </section>
        )}

        {/* totals + payment */}
        <section className="px-4 mt-5 space-y-3">
          <div className="rounded-3xl border border-line bg-white p-4 shadow-sm">
            <dl className="text-sm divide-y divide-dashed divide-neutral-200">
              <Row k="Taomlar" v={`${money(itemsAll)} so‘m`} />
              <Row
                k={
                  <span className="flex items-center gap-1.5">
                    {pickup ? <Store size={14} className="text-gold-deep" /> : taxiFee ? <Car size={14} className="text-gold-deep" /> : <Bike size={14} className="text-gold-deep" />}
                    {pickup
                      ? 'O‘zim olib ketaman'
                      : multi
                        ? `Yetkazish · bitta kuryer, ${rows.length} ta oshxona`
                        : `Yetkazish${km != null ? ` · ${fmtKm(km)}` : ''}`}
                  </span>
                }
                v={<FeeValue fee={pickup ? 0 : feeKnown ? feeAll : null} loading={quoting} />}
              />
              {multi && !pickup && (
                <p className="py-2 text-xs text-neutral-500 leading-snug">
                  Bitta kuryer hamma oshxonadan yig‘ib keladi — yetkazish narxi bir marta olinadi.
                </p>
              )}
              {bonusAmt > 0 && <Row k={<span className="text-emerald-700">Bonusdan to‘lanadi</span>} v={<span className="text-emerald-700">− {money(bonusAmt)} so‘m</span>} />}
            </dl>
            {bonusAmt > 0 && (
              <div className="mt-2 flex items-center justify-between text-sm px-0.5">
                <span className="text-neutral-500">Jami</span>
                <span className="font-semibold tabular-nums">{money(totalAll)} so‘m</span>
              </div>
            )}
            <div className="mt-3 rounded-2xl bg-gold/15 border border-gold/40 px-3.5 py-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">{bonusAmt > 0 ? 'Naqd to‘lanadi' : 'Jami'}</span>
              <span className="text-2xl font-extrabold tabular-nums">
                {money(cashAll)} <span className="text-sm font-semibold">so‘m</span>
              </span>
            </div>
            {taxiFee && <p className="mt-2 text-[11px] text-neutral-500">Manzil kuryer hududidan uzoq — taksi yetkazadi, narx taksi tarifi bo‘yicha.</p>}
            {quoteErr && <p className="mt-2 text-[11px] text-neutral-500">{quoteErr} — yetkazish narxi buyurtmada hisoblanadi.</p>}
          </div>

          <div className="rounded-3xl border border-line bg-white p-4 shadow-sm flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-emerald-50 text-emerald-700 flex items-center justify-center shrink-0">
              <Banknote size={20} />
            </span>
            <div className="min-w-0">
              <p className="font-extrabold">{pickup ? 'To‘lov: naqd, oshxonada' : 'To‘lov: naqd, yetkazganda'}</p>
              <p className="text-xs text-neutral-500 leading-snug">
                {pickup ? 'Buyurtmani olayotganda naqd to‘laysiz' : 'Buyurtmani qabul qilganda naqd to‘laysiz'}
                {bonusAmt > 0 && ' · bonus qismi balansingizdan yechiladi (bekor qilinsa qaytariladi)'}
              </p>
            </div>
          </div>

          {!phoneOk && (
            <Alert tone="amber" icon={<Phone size={16} />}>
              {pickup ? 'Oshxona bog‘lanishi uchun telefon raqamingizni kiriting.' : 'Kuryer bog‘lanishi uchun telefon raqamingizni kiriting.'}
            </Alert>
          )}
          {blocked.length > 0 && multi && (
            <Alert tone="amber" icon={<Info size={16} />}>
              Buyurtma berishdan oldin tuzating:{' '}
              {blocked.map((r) => `${r.g.kitchen.name} — ${!r.isOpen ? 'yopiq' : `minimal ${money(r.minOrder)} so‘m`}`).join('; ')}.
            </Alert>
          )}
          {err && (
            <Alert tone="red" icon={<Info size={16} />}>
              {err}
              {sent.length > 0 && (
                <>
                  {' '}
                  <Link href="/food/orders" className="font-bold underline underline-offset-2">
                    Buyurtmalarim
                  </Link>
                </>
              )}
            </Alert>
          )}
        </section>
      </div>

      {/* sticky submit (outside the animated wrapper: fixed + transform don't mix) */}
      <div className="fixed bottom-0 inset-x-0 z-30 mx-auto max-w-md">
        <div className="bg-gradient-to-t from-paper via-paper to-paper/0 px-4 pt-6" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>
          <button
            onClick={() => void submit()}
            disabled={!canOrder}
            className="h-14 w-full rounded-2xl bg-ink text-gold text-base font-extrabold flex items-center justify-center gap-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,.6)] disabled:opacity-50 active:scale-[0.98] transition"
          >
            {busy ? <Loader2 size={20} className="animate-spin" /> : pickup ? <Store size={18} /> : <ShoppingBag size={18} />}
            <span className="truncate">{submitLabel}</span>
          </button>
        </div>
      </div>

      <ConfirmSheet
        open={!!dropKitchen}
        title="Oshxona savatdan olib tashlansinmi?"
        text={
          <>
            <b>{dropKitchen?.name}</b> taomlari savatdan o‘chiriladi. Boshqa oshxonalar buyurtmasi qoladi.
          </>
        }
        confirmLabel="Olib tashlash"
        cancelLabel="Qolsin"
        danger
        onClose={() => setDropKitchen(null)}
        onConfirm={() => {
          if (dropKitchen) removeKitchen(dropKitchen.id);
          setDropKitchen(null);
        }}
      />
    </>
  );
}

function FeeValue({ fee, loading }: { fee: number | null; loading: boolean }) {
  if (fee == null) return loading ? <span className="inline-block h-4 w-16 rounded skeleton align-middle" /> : <>Hisoblanadi</>;
  return <>{fee === 0 ? 'Bepul' : `${money(fee)} so‘m`}</>;
}

function ModeButton({ active, onClick, icon, children }: { active: boolean; onClick: () => void; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'h-11 rounded-xl text-sm font-extrabold flex items-center justify-center gap-1.5 transition-colors',
        active ? 'bg-ink text-gold shadow' : 'text-neutral-500 active:bg-neutral-100',
      )}
    >
      {icon}
      <span className="truncate">{children}</span>
    </button>
  );
}

function BonusCard({
  balance,
  cap,
  capPercent,
  note,
  enabled,
  amount,
  multi,
  onToggle,
  onChange,
}: {
  balance: number;
  cap: number;
  capPercent: number;
  note: string | null;
  enabled: boolean;
  amount: number;
  multi: boolean;
  onToggle: (on: boolean) => void;
  onChange: (v: number) => void;
}) {
  const usable = cap > 0;
  return (
    <div className={cn('rounded-3xl border p-4 transition-colors', enabled && usable ? 'border-gold/50 bg-gradient-to-br from-gold/20 to-gold/5' : 'border-line bg-white shadow-sm')}>
      <div className="flex items-center gap-3">
        <span className="w-11 h-11 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
          <Gift size={20} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold">Bonusdan to‘lash</p>
          <p className="text-xs text-neutral-500 leading-snug">
            Balans: <b className="text-ink tabular-nums">{money(balance)} so‘m</b>
            {usable ? (
              <>
                {' '}
                · ko‘pi bilan <b className="text-ink tabular-nums">{money(cap)} so‘m</b>
              </>
            ) : (
              ' · bu buyurtmaga ishlatib bo‘lmaydi'
            )}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled && usable}
          aria-label="Bonusdan to‘lash"
          disabled={!usable}
          onClick={() => onToggle(!enabled)}
          className={cn('relative w-12 h-7 rounded-full transition-colors shrink-0 disabled:opacity-40', enabled && usable ? 'bg-ink' : 'bg-neutral-200')}
        >
          <span className={cn('absolute top-1 w-5 h-5 rounded-full transition-all shadow', enabled && usable ? 'left-6 bg-gold' : 'left-1 bg-white')} />
        </button>
      </div>

      {enabled && usable && (
        <div className="mt-3 animate-in fade-in">
          <input
            type="range"
            min={0}
            max={cap}
            step={100}
            value={amount}
            onChange={(e) => onChange(Number(e.target.value))}
            className="w-full accent-[#0a0a0a]"
            aria-label="Bonus miqdori"
          />
          <div className="mt-1 flex items-center gap-2">
            <div className="relative flex-1">
              <input
                value={amount ? String(amount) : ''}
                onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, '')) || 0)}
                inputMode="numeric"
                placeholder="0"
                className="input rounded-2xl font-extrabold tabular-nums pr-14"
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-neutral-500">so‘m</span>
            </div>
            <button
              type="button"
              onClick={() => onChange(cap)}
              className={cn('h-12 px-4 rounded-2xl text-sm font-bold border transition', amount === cap ? 'bg-ink text-gold border-ink' : 'bg-white border-line')}
            >
              Hammasi
            </button>
          </div>
          {multi && (
            <p className="mt-2 text-[11px] text-neutral-600 leading-snug">
              Bir nechta oshxona — har biri alohida buyurtma. Bonus buyurtmalarga ketma-ket taqsimlanadi: avval 1-oshxonaga, qolgani keyingisiga (har biri
              o‘z chegarasigacha). Taqsimot har bir oshxona kartasida ko‘rsatilgan.
            </p>
          )}
        </div>
      )}
      {capPercent > 0 && <p className="mt-2 text-[11px] text-neutral-500">Har bir buyurtmaning ko‘pi bilan {capPercent}% i bonusdan to‘lanadi.</p>}
      {note && <p className="mt-1 text-[11px] text-neutral-500 whitespace-pre-line">🎟 {note}</p>}
    </div>
  );
}

function TopBar({ title, subtitle, onBack }: { title: string; subtitle?: string; onBack: () => void }) {
  return (
    <header className="bg-ink text-white px-4 pt-10 pb-5 rounded-b-[2rem] relative overflow-hidden">
      <div aria-hidden className="absolute -right-12 -top-16 w-48 h-48 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <button
          onClick={onBack}
          className="w-11 h-11 rounded-2xl bg-white/10 ring-1 ring-white/10 flex items-center justify-center active:scale-95 transition shrink-0"
          aria-label="Orqaga"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="min-w-0">
          <h1 className="text-lg font-extrabold leading-tight truncate">{title}</h1>
          {subtitle && <p className="text-xs text-neutral-400 truncate">{subtitle}</p>}
        </div>
      </div>
    </header>
  );
}

function SectionTitle({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500 flex items-center gap-1.5">
      <span className="text-gold-deep">{icon}</span> {children}
    </p>
  );
}

function Row({ k, v }: { k: React.ReactNode; v: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4 py-2">
      <dt className="text-neutral-500">{k}</dt>
      <dd className="font-semibold text-right tabular-nums">{v}</dd>
    </div>
  );
}

function Alert({ tone, icon, children }: { tone: 'amber' | 'red' | 'neutral'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      className={cn(
        'rounded-2xl border p-3.5 text-sm flex items-start gap-2.5 leading-snug animate-in fade-in',
        tone === 'amber' && 'bg-amber-50 border-amber-200 text-amber-900',
        tone === 'red' && 'bg-red-50 border-red-200 text-red-700',
        tone === 'neutral' && 'bg-neutral-100 border-line text-neutral-700',
      )}
    >
      <span className="shrink-0 mt-0.5">{icon}</span>
      <span>{children}</span>
    </div>
  );
}
