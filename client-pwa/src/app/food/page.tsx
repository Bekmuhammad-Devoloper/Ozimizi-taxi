'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Search, X, MapPin, Clock, Bike, ClipboardList, ChevronRight, Soup, Loader2, RotateCcw } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { CartBar, KitchenLogo, OpenBadge } from '@/components/FoodUi';
import { api, errMsg } from '@/lib/api';
import { reverseGeocode } from '@/lib/geocode';
import { haversineKm } from '@/lib/haversine';
import { currentLocation, lastLocation, Pos } from '@/lib/location';
import { KitchenCard, fmtKm, foodStatusLabel, isFoodActive } from '@/lib/food';
import { money } from '@/lib/status';
import { cn } from '@/lib/cn';
import { useFoodStore } from '@/stores/food';
import { useCartStore } from '@/stores/cart';

export default function FoodPage() {
  return (
    <Shell>
      <FoodInner />
    </Shell>
  );
}

function FoodInner() {
  const [pos, setPos] = useState<Pos | null>(null);
  const [locating, setLocating] = useState(true);
  const [geoErr, setGeoErr] = useState<string | null>(null);
  const [addr, setAddr] = useState<string | null>(null);
  const [rows, setRows] = useState<KitchenCard[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const orders = useFoodStore((s) => s.orders);
  const hasCart = useCartStore((s) => s.lines.length > 0);

  const active = useMemo(
    () =>
      Object.values(orders)
        .filter((o) => isFoodActive(o.status))
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [orders],
  );

  const load = useCallback(async (p: Pos | null) => {
    try {
      const { data } = await api.get<KitchenCard[]>('/client/food/kitchens', { params: p ? { lat: p.lat, lng: p.lng } : {} });
      setRows(Array.isArray(data) ? data : []);
      setErr(null);
    } catch (e) {
      setErr(errMsg(e, 'Oshxonalarni yuklab bo‘lmadi'));
      setRows((r) => r ?? []);
    }
  }, []);

  const locate = useCallback(
    async (known: Pos | null) => {
      setLocating(true);
      setGeoErr(null);
      try {
        const p = await currentLocation();
        setPos(p);
        // Re-quote only when we actually moved (fees depend on distance).
        if (!known || haversineKm(known.lat, known.lng, p.lat, p.lng) > 0.2) void load(p);
      } catch (e: any) {
        setGeoErr(e?.message ?? 'Joylashuv aniqlanmadi');
      } finally {
        setLocating(false);
      }
    },
    [load],
  );

  useEffect(() => {
    const last = lastLocation();
    if (last) setPos(last);
    void load(last);
    void locate(last);
  }, [load, locate]);

  useEffect(() => {
    if (!pos) return;
    let alive = true;
    void reverseGeocode(pos.lat, pos.lng).then((a) => {
      if (alive) setAddr(a);
    });
    return () => {
      alive = false;
    };
  }, [pos]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!rows) return null;
    if (!s) return rows;
    return rows.filter((k) => [k.name, k.description, k.address].some((v) => (v ?? '').toLowerCase().includes(s)));
  }, [rows, q]);

  return (
    <>
      <div className="animate-in fade-in duration-300">
        <header className="bg-ink text-white px-5 pt-10 pb-5 rounded-b-[2rem] relative overflow-hidden">
          <div aria-hidden className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-gold/25 blur-3xl" />
          <div aria-hidden className="absolute -left-16 bottom-0 w-40 h-40 rounded-full bg-orange-400/10 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">Moviy Taxi · Yetkazib berish</p>
              <h1 className="text-2xl font-extrabold mt-0.5">🍔 Ovqat buyurtma</h1>
            </div>
            <Link
              href="/food/orders"
              className="relative shrink-0 w-11 h-11 rounded-2xl bg-white/10 ring-1 ring-white/10 flex items-center justify-center active:scale-95 transition"
              aria-label="Buyurtmalarim"
            >
              <ClipboardList size={20} />
              {active.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gold text-ink text-[11px] font-extrabold flex items-center justify-center">
                  {active.length}
                </span>
              )}
            </Link>
          </div>
          <button
            onClick={() => void locate(pos)}
            className="relative mt-3 max-w-full flex items-center gap-1.5 text-sm text-neutral-300 text-left active:opacity-70"
          >
            {locating ? <Loader2 size={14} className="animate-spin text-gold shrink-0" /> : <MapPin size={14} className="text-gold shrink-0" />}
            <span className="truncate">
              {pos ? addr ?? 'Joylashuvingiz bo‘yicha' : geoErr ? `${geoErr} — qayta urinish` : 'Joylashuv aniqlanmoqda…'}
            </span>
          </button>
          <div className="relative mt-4 h-12 rounded-2xl bg-white text-ink flex items-center px-3 gap-2 shadow-lg shadow-black/20 focus-within:ring-2 focus-within:ring-gold/60 transition">
            <Search size={18} className="text-neutral-400 shrink-0" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Oshxona yoki taom turi…"
              className="flex-1 bg-transparent outline-none text-base font-semibold placeholder:font-normal placeholder:text-neutral-400"
            />
            {q && (
              <button onClick={() => setQ('')} className="text-neutral-400" aria-label="Tozalash">
                <X size={16} />
              </button>
            )}
          </div>
        </header>

        {/* live food orders */}
        {active.length > 0 && (
          <section className="px-5 mt-4 space-y-2">
            {active.slice(0, 3).map((o) => (
              <Link
                key={o.id}
                href={`/food/orders/${o.id}`}
                className="rounded-2xl bg-gold text-ink p-3.5 flex items-center gap-3 shadow-[0_12px_40px_-14px_rgba(59,155,255,0.9)] active:scale-[0.98] transition"
              >
                <KitchenLogo url={o.kitchen?.logoUrl} size={44} className="rounded-xl ring-ink/10" />
                <span className="flex-1 min-w-0">
                  <span className="block text-[10px] uppercase tracking-wider font-bold text-ink/60 truncate">
                    #{o.number} · {o.kitchen?.name ?? 'Buyurtma'}
                  </span>
                  <span className="flex items-center gap-1.5 font-extrabold truncate">
                    <span className="w-2 h-2 rounded-full bg-ink animate-pulse shrink-0" />
                    {foodStatusLabel(o)}
                  </span>
                </span>
                <ChevronRight size={20} />
              </Link>
            ))}
          </section>
        )}

        <section className="px-5 mt-5">
          <div className="flex items-end justify-between mb-3">
            <h2 className="text-lg font-extrabold">Oshxonalar</h2>
            {rows && rows.length > 0 && <span className="text-xs text-neutral-500">{rows.filter((k) => k.isOpen).length} ta ochiq</span>}
          </div>

          {filtered === null && (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className="h-28 rounded-3xl skeleton" />
              ))}
            </div>
          )}

          {err && (
            <div className="mb-3 rounded-2xl bg-red-50 border border-red-200 text-red-700 text-sm p-3 flex items-center gap-3">
              <span className="flex-1">{err}</span>
              <button onClick={() => void load(pos)} className="shrink-0 h-9 px-3 rounded-xl bg-white border border-red-200 font-bold flex items-center gap-1.5">
                <RotateCcw size={14} /> Qayta
              </button>
            </div>
          )}

          {filtered && filtered.length === 0 && !err && (
            <div className="rounded-3xl border border-line bg-white p-8 text-center text-sm text-neutral-500">
              <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center">
                <Soup size={26} />
              </span>
              {q ? 'Hech narsa topilmadi' : 'Hozircha oshxonalar yo‘q — tez orada qo‘shiladi'}
            </div>
          )}

          <div className="space-y-3">
            {filtered?.map((k) => (
              <KitchenRow key={k.id} k={k} />
            ))}
          </div>

          {!pos && geoErr && rows && rows.length > 0 && (
            <p className="mt-3 text-[11px] text-neutral-500 text-center">Joylashuv aniqlanmadi — yetkazish narxi buyurtma berishda hisoblanadi.</p>
          )}
          {hasCart && <div className="h-20" />}
        </section>
      </div>
      {/* fixed layers live outside the animated (transformed) wrapper */}
      <CartBar aboveNav />
    </>
  );
}

function KitchenRow({ k }: { k: KitchenCard }) {
  return (
    <Link
      href={`/food/${k.id}`}
      className={cn(
        'block rounded-3xl bg-white border border-line p-3.5 shadow-sm active:scale-[0.99] active:bg-neutral-50 transition',
        !k.isOpen && 'opacity-70',
      )}
    >
      <div className="flex gap-3.5">
        <KitchenLogo url={k.logoUrl} size={76} dim={!k.isOpen} />
        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-2">
            <p className="flex-1 min-w-0 font-extrabold text-[17px] leading-tight line-clamp-1">{k.name}</p>
            <OpenBadge open={k.isOpen} />
          </div>
          {k.description ? (
            <p className="mt-0.5 text-xs text-neutral-500 line-clamp-2 leading-snug">{k.description}</p>
          ) : (
            <p className="mt-0.5 text-xs text-neutral-400">{k.itemsCount} ta taom</p>
          )}
          <div className="mt-2 flex flex-wrap gap-1.5 text-[11px] font-semibold text-neutral-700">
            <Chip>
              <Clock size={11} className="text-gold-deep" /> ~{k.prepMinutes} daq
            </Chip>
            <Chip>
              <Bike size={11} className="text-gold-deep" />
              {k.deliveryFee == null ? 'Yetkazish' : k.deliveryFee === 0 ? 'Bepul' : `${money(k.deliveryFee)} so‘m`}
              {k.distanceKm != null && <span className="text-neutral-400 font-medium">· {fmtKm(k.distanceKm)}</span>}
            </Chip>
            {k.minOrder > 0 && <Chip>Min. {money(k.minOrder)} so‘m</Chip>}
          </div>
        </div>
      </div>
    </Link>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="inline-flex items-center gap-1 h-6 px-2 rounded-lg bg-paper border border-line">{children}</span>;
}
