'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { LocateFixed, Car, Wallet, ChevronRight, Loader2, Check, X, Clock, Navigation } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { MapView, LatLng } from '@/components/MapView';
import { DestinationSheet } from '@/components/DestinationSheet';
import { api, errMsg } from '@/lib/api';
import { getPosition } from '@/lib/native';
import { reverseGeocode, routeBetween, rememberPlace, Place, RouteInfo } from '@/lib/geocode';
import { computeFare } from '@/lib/fare';
import { money, STATUS_LABEL } from '@/lib/status';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore, isActiveStatus, ClientOrder } from '@/stores/order';
import { useFoodStore } from '@/stores/food';
import { foodStatusLabel, isFoodActive } from '@/lib/food';
import { rememberLocation } from '@/lib/location';

const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';
// Tashkent centre — until the phone tells us where we are.
const DEFAULT: LatLng = { lat: 41.3111, lng: 69.2797 };

interface Tariff {
  pricePerKm: number;
  minimumFare: number;
  tiers?: { uptoKm: number; price: number }[] | null;
}

export default function HomePage() {
  return (
    <Shell full>
      <HomeInner />
    </Shell>
  );
}

function HomeInner() {
  const router = useRouter();
  const client = useAuthStore((s) => s.client);
  const active = useOrderStore((s) => s.active);
  const setActive = useOrderStore((s) => s.setActive);
  const foodOrders = useFoodStore((s) => s.orders);
  const foodLive = useMemo(
    () =>
      Object.values(foodOrders)
        .filter((o) => isFoodActive(o.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] ?? null,
    [foodOrders],
  );

  const [mode, setMode] = useState<'pickup' | 'dest'>('pickup');
  const [center, setCenter] = useState<LatLng>(DEFAULT); // map centre (= pin)
  const [pickup, setPickup] = useState<LatLng>(DEFAULT);
  const [pickupAddr, setPickupAddr] = useState<string | null>(null);
  const [addrLoading, setAddrLoading] = useState(true);
  const [dragging, setDragging] = useState(false);
  const [dest, setDest] = useState<Place | null>(null);
  const [destDraft, setDestDraft] = useState<string | null>(null);
  const [route, setRoute] = useState<RouteInfo | null>(null);
  const [routing, setRouting] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [follow, setFollow] = useState<LatLng | null>(null);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [tariff, setTariff] = useState<Tariff | null>(null);
  const geocodeTimer = useRef<number | null>(null);
  const [vh, setVh] = useState(844);
  useEffect(() => {
    const set = () => setVh(window.innerHeight);
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  const locate = useCallback(async () => {
    setGeoErr(null);
    setLocating(true);
    try {
      const f = await getPosition();
      const p = { lat: f.lat, lng: f.lng };
      rememberLocation(p); // food delivery quotes reuse the last fix
      setMode('pickup');
      setCenter(p);
      setPickup(p);
      setFollow({ ...p });
    } catch (e: any) {
      setGeoErr(e?.message ?? 'Joylashuv aniqlanmadi');
    } finally {
      setLocating(false);
    }
  }, []);

  useEffect(() => {
    void locate();
    api.get('/client/tariff').then((r) => setTariff(r.data)).catch(() => {});
  }, [locate]);

  // Pin moved → label it (pickup or destination draft).
  useEffect(() => {
    if (mode === 'pickup') setPickup(center);
    setAddrLoading(true);
    if (geocodeTimer.current) window.clearTimeout(geocodeTimer.current);
    geocodeTimer.current = window.setTimeout(() => {
      void reverseGeocode(center.lat, center.lng).then((a) => {
        if (mode === 'pickup') setPickupAddr(a);
        else setDestDraft(a);
        setAddrLoading(false);
      });
    }, 800);
    return () => {
      if (geocodeTimer.current) window.clearTimeout(geocodeTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [center.lat, center.lng, mode]);

  // Route + fare preview whenever both points are known.
  useEffect(() => {
    if (!dest) {
      setRoute(null);
      return;
    }
    let alive = true;
    setRouting(true);
    void routeBetween(pickup, { lat: dest.lat, lng: dest.lng }).then((r) => {
      if (!alive) return;
      setRoute(r);
      setRouting(false);
    });
    return () => {
      alive = false;
    };
  }, [dest, pickup.lat, pickup.lng, pickup]);

  const price = route && tariff ? computeFare(route.distanceKm, { ...tariff, commissionPerOrder: 0 }) : null;

  const pickPlace = (p: Place) => {
    rememberPlace(p);
    setDest(p);
    setSheet(false);
    setMode('pickup');
  };
  const confirmDestOnMap = () => {
    const p: Place = { id: `map:${center.lat.toFixed(5)},${center.lng.toFixed(5)}`, name: destDraft ?? 'Xaritadagi nuqta', detail: '', lat: center.lat, lng: center.lng };
    rememberPlace(p);
    setDest(p);
    setMode('pickup');
    setCenter(pickup);
    setFollow({ ...pickup });
  };

  const order = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post<ClientOrder>('/client/orders', {
        lat: pickup.lat,
        lng: pickup.lng,
        address: pickupAddr ?? undefined,
        dest: dest ? { lat: dest.lat, lng: dest.lng, address: [dest.name, dest.detail].filter(Boolean).join(', ') } : null,
      });
      setActive(data);
      router.push(`/order/${data.id}`);
    } catch (e) {
      setErr(errMsg(e, 'Buyurtma berib bo‘lmadi'));
    } finally {
      setBusy(false);
    }
  };

  const live = active && isActiveStatus(active.status) ? active : null;
  const destLatLng = dest ? { lat: dest.lat, lng: dest.lng } : null;

  return (
    <div className="relative h-full">
      <MapView
        center={DEFAULT}
        pinAtCenter
        pinKind={mode}
        follow={follow}
        pickup={mode === 'dest' ? pickup : null}
        dest={mode === 'pickup' ? destLatLng : null}
        route={mode === 'pickup' && route ? route.coords : null}
        padBottom={dest && mode === 'pickup' ? Math.round(vh * 0.56) : 0}
        onMoveStart={() => setDragging(true)}
        onMoveEnd={(c) => {
          setDragging(false);
          setCenter(c);
        }}
        className="absolute inset-0 z-0"
      />

      {/* top bar */}
      <div className="absolute top-0 inset-x-0 z-10 safe-top px-4 pt-3 flex items-center justify-between gap-3 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-2.5 h-12 pl-1.5 pr-4 rounded-2xl bg-white/95 backdrop-blur shadow-lg shadow-black/10">
          <span className="w-9 h-9 rounded-xl overflow-hidden ring-1 ring-gold/50">
            <Image src={`${BASE}/logo.jpg`} alt="" width={36} height={36} className="w-full h-full object-cover" unoptimized />
          </span>
          <div className="leading-tight">
            <p className="text-[9px] uppercase tracking-[0.2em] text-neutral-500 font-bold">Moviy Taxi</p>
            <p className="text-sm font-extrabold">Salom, {client?.firstName ?? 'mijoz'} 👋</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/bonus')}
          className="pointer-events-auto h-12 px-3.5 rounded-2xl bg-ink text-white shadow-lg shadow-black/20 flex items-center gap-2 active:scale-[0.97] transition"
        >
          <Wallet size={16} className="text-gold" />
          <span className="font-extrabold tabular-nums">{money(client?.balance)}</span>
          <span className="text-[10px] text-neutral-400">so‘m</span>
        </button>
      </div>

      {/* active order */}
      {live && mode === 'pickup' && (
        <button
          onClick={() => router.push(`/order/${live.id}`)}
          className="absolute left-4 right-4 z-10 rounded-2xl bg-gold text-ink p-3.5 flex items-center gap-3 text-left shadow-[0_12px_40px_-10px_rgba(59,155,255,0.8)] animate-in fade-in slide-in-from-top-2 active:scale-[0.98] transition"
          style={{ top: 'calc(env(safe-area-inset-top) + 5rem)' }}
        >
          <span className="w-11 h-11 rounded-xl bg-ink text-gold flex items-center justify-center shrink-0">
            <Car size={20} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-[10px] uppercase tracking-wider font-bold text-ink/60">Faol buyurtma</span>
            <span className="block font-extrabold truncate">{STATUS_LABEL[live.status]}</span>
          </span>
          <ChevronRight size={20} />
        </button>
      )}

      {/* destination-on-map mode */}
      {mode === 'dest' && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5.75rem)' }}>
          <div className="rounded-3xl bg-white shadow-2xl shadow-black/25 p-4 animate-in fade-in slide-in-from-bottom-4">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Qayerga — xaritada belgilang</p>
            {addrLoading || dragging ? <div className="mt-1.5 h-5 w-3/4 rounded-md skeleton" /> : <p className="mt-0.5 font-bold leading-snug line-clamp-2">{destDraft ?? `${center.lat.toFixed(5)}, ${center.lng.toFixed(5)}`}</p>}
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => {
                  setMode('pickup');
                  setCenter(pickup);
                  setFollow({ ...pickup });
                }}
                className="h-12 px-4 rounded-2xl border border-line font-bold flex items-center gap-1.5"
              >
                <X size={16} /> Bekor
              </button>
              <button onClick={confirmDestOnMap} disabled={dragging} className="flex-1 h-12 rounded-2xl bg-ink text-gold font-extrabold flex items-center justify-center gap-2 disabled:opacity-50">
                <Check size={18} /> Shu joyni tanlash
              </button>
            </div>
          </div>
        </div>
      )}

      {/* main sheet */}
      {mode === 'pickup' && (
        <div className="absolute inset-x-0 bottom-0 z-20 px-3" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5.75rem)' }}>
          <button
            onClick={() => void locate()}
            title="Mening joylashuvim"
            className="absolute -top-14 right-4 w-12 h-12 rounded-2xl bg-white shadow-lg shadow-black/15 flex items-center justify-center text-ink active:scale-95 transition"
          >
            {locating ? <Loader2 size={20} className="animate-spin" /> : <LocateFixed size={20} />}
          </button>
          <div className="rounded-3xl bg-white shadow-2xl shadow-black/25 p-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mx-auto w-10 h-1 rounded-full bg-neutral-200 mb-3" />

            {/* food delivery entry (hidden once a taxi destination is chosen) */}
            {!dest && (
              <button
                onClick={() => router.push(foodLive ? `/food/orders/${foodLive.id}` : '/food')}
                className="w-full mb-3 rounded-2xl bg-gradient-to-r from-gold via-amber-300 to-orange-300 text-ink p-2.5 pr-3 flex items-center gap-3 text-left shadow-[0_10px_28px_-14px_rgba(59,155,255,.95)] active:scale-[0.98] transition"
              >
                <span className="w-11 h-11 rounded-xl bg-ink flex items-center justify-center text-2xl shrink-0">🍔</span>
                <span className="flex-1 min-w-0">
                  <span className="block font-extrabold leading-tight truncate">{foodLive ? foodStatusLabel(foodLive) : 'Ovqat buyurtma'}</span>
                  <span className="block text-[11px] font-semibold text-ink/70 truncate">
                    {foodLive ? `#${foodLive.number} · ${foodLive.kitchen?.name ?? 'Ovqat'}` : 'Oshxonalardan uyingizgacha yetkazib beramiz'}
                  </span>
                </span>
                <span className="h-8 px-2.5 rounded-lg bg-ink text-gold text-[11px] font-extrabold flex items-center gap-0.5 shrink-0">
                  {foodLive ? 'Kuzatish' : 'Tanlash'} <ChevronRight size={14} />
                </span>
              </button>
            )}

            {/* route rows */}
            <div className="relative">
              <span aria-hidden className="absolute left-[11px] top-5 bottom-5 w-0.5 bg-neutral-200" />
              <div className="flex items-start gap-3 py-1.5">
                <span className="mt-1.5 w-6 h-6 rounded-full bg-ink flex items-center justify-center shrink-0 relative z-10">
                  <span className="w-2 h-2 rounded-full bg-gold" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Qayerdan</p>
                  {addrLoading || dragging ? (
                    <div className="mt-1 h-5 w-3/4 rounded-md skeleton" />
                  ) : (
                    <p className="font-bold leading-snug line-clamp-1">{pickupAddr ?? `${pickup.lat.toFixed(5)}, ${pickup.lng.toFixed(5)}`}</p>
                  )}
                  <p className="text-[11px] text-neutral-500">{geoErr ? `${geoErr} — xaritani suring` : dragging ? 'Joy tanlanmoqda…' : 'Xaritani surib aniqlashtiring'}</p>
                </div>
              </div>
              <button onClick={() => setSheet(true)} className="w-full flex items-start gap-3 py-1.5 text-left active:bg-neutral-50 rounded-xl">
                <span className="mt-1.5 w-6 h-6 rounded-md bg-gold flex items-center justify-center shrink-0 relative z-10 text-[11px] font-extrabold text-ink">
                  B
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Qayerga</p>
                  {dest ? (
                    <>
                      <p className="font-bold leading-snug line-clamp-1">{dest.name}</p>
                      {dest.detail && <p className="text-[11px] text-neutral-500 line-clamp-1">{dest.detail}</p>}
                    </>
                  ) : (
                    <p className="font-semibold text-neutral-400">Qayerga boramiz?</p>
                  )}
                </div>
                {dest ? (
                  <span
                    role="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDest(null);
                    }}
                    className="mt-1 w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:bg-neutral-100"
                  >
                    <X size={16} />
                  </span>
                ) : (
                  <ChevronRight size={18} className="mt-2 text-neutral-300" />
                )}
              </button>
            </div>

            {/* estimate */}
            {dest ? (
              <div className="mt-2 rounded-2xl bg-paper border border-line px-3.5 py-3 flex items-center gap-3">
                <div className="flex-1 min-w-0 text-xs text-neutral-600 space-y-0.5">
                  {routing || !route ? (
                    <div className="h-4 w-2/3 rounded skeleton" />
                  ) : (
                    <>
                      <p className="flex items-center gap-1.5">
                        <Navigation size={12} className="text-gold-deep" /> <b>{route.distanceKm.toFixed(1)} km</b>
                        <Clock size={12} className="text-gold-deep ml-1" /> <b>~{route.durationMin} daq</b>
                      </p>
                      <p className="text-[11px] text-neutral-500">{route.exact ? 'Yo‘l bo‘yicha hisoblandi' : 'Taxminiy, to‘g‘ri chiziq bo‘yicha'} · yakuniy narx haqiqiy masofa bo‘yicha</p>
                    </>
                  )}
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">Taxminan</p>
                  <p className="text-xl font-extrabold tabular-nums">{price != null && route ? `${money(price)}` : '…'} <span className="text-xs font-normal text-neutral-500">so‘m</span></p>
                </div>
              </div>
            ) : (
              tariff && (
                <p className="mt-2 text-[11px] text-neutral-500 px-1">
                  1 km — <b>{money(tariff.pricePerKm)}</b> so‘m · minimal <b>{money(tariff.minimumFare)}</b> so‘m. Manzilni kiritsangiz narxni oldindan ko‘rasiz.
                </p>
              )
            )}

            {err && <p className="mt-2 text-sm text-red-600">{err}</p>}
            <button
              onClick={() => void order()}
              disabled={busy || !!live || dragging}
              className="mt-3 h-14 w-full rounded-2xl bg-ink text-gold text-base font-extrabold flex items-center justify-center gap-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,.6)] disabled:opacity-50 active:scale-[0.98] transition"
            >
              {busy ? <Loader2 size={20} className="animate-spin" /> : <Car size={20} />}
              {busy ? 'Yuborilmoqda…' : live ? 'Faol buyurtmangiz bor' : price != null && route ? `Taksi chaqirish · ${money(price)} so‘m` : 'Taksi chaqirish'}
            </button>
          </div>
        </div>
      )}

      {sheet && (
        <DestinationSheet
          near={pickup}
          onPick={pickPlace}
          onPickOnMap={() => {
            setSheet(false);
            setMode('dest');
            setDestDraft(null);
            setFollow(dest ? { lat: dest.lat, lng: dest.lng } : { ...pickup });
          }}
          onClose={() => setSheet(false)}
        />
      )}
    </div>
  );
}
