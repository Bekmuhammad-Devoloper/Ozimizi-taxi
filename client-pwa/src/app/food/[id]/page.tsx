'use client';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChevronLeft, Phone, Clock, Bike, MapPin, Plus, Ban, Info, X, Wallet } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { CartBar, FoodImage, KitchenLogo, OpenBadge, QtyControl } from '@/components/FoodUi';
import { api, errMsg } from '@/lib/api';
import { lastLocation } from '@/lib/location';
import { KitchenMenu, MenuItem, fmtKm } from '@/lib/food';
import { money } from '@/lib/status';
import { cn } from '@/lib/cn';
import { CartKitchen, useCartStore } from '@/stores/cart';

const OTHER = '__other__';

export default function KitchenPage() {
  return (
    <Shell nav={false}>
      <KitchenInner />
    </Shell>
  );
}

function KitchenInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<KitchenMenu | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [removed, setRemoved] = useState<string[]>([]);
  const [activeCat, setActiveCat] = useState<string | null>(null);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);

  const lines = useCartStore((s) => s.lines);
  const add = useCartStore((s) => s.add);
  const setQty = useCartStore((s) => s.setQty);

  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsScroll = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const load = useCallback(async () => {
    setErr(null);
    try {
      const p = lastLocation();
      const { data } = await api.get<KitchenMenu>(`/client/food/kitchens/${id}`, { params: p ? { lat: p.lat, lng: p.lng } : {} });
      setData(data);
      const k = data.kitchen;
      const gone = useCartStore.getState().sync({ id: k.id, name: k.name, logoUrl: k.logoUrl, minOrder: k.minOrder }, data.items);
      if (gone.length) setRemoved(gone);
    } catch (e) {
      setErr(errMsg(e, 'Oshxona topilmadi'));
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const sections = useMemo(() => {
    if (!data) return [];
    const known = new Set(data.categories.map((c) => c.id));
    const out = data.categories
      .map((c) => ({ id: c.id, name: c.name, items: data.items.filter((i) => i.categoryId === c.id) }))
      .filter((s) => s.items.length);
    const rest = data.items.filter((i) => !i.categoryId || !known.has(i.categoryId));
    if (rest.length) out.push({ id: OTHER, name: out.length ? 'Boshqa taomlar' : 'Menyu', items: rest });
    return out;
  }, [data]);

  // Highlight the category whose section is under the sticky tabs.
  useEffect(() => {
    if (!sections.length) return;
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const line = (tabsRef.current?.getBoundingClientRect().bottom ?? 0) + 12;
        let cur = sections[0].id;
        for (const s of sections) {
          const el = sectionRefs.current[s.id];
          if (el && el.getBoundingClientRect().top <= line) cur = s.id;
        }
        setActiveCat(cur);
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('scroll', onScroll);
    };
  }, [sections]);

  // Keep the active chip visible in the horizontal tab strip.
  useEffect(() => {
    const box = tabsScroll.current;
    const chip = activeCat ? chipRefs.current[activeCat] : null;
    if (!box || !chip) return;
    box.scrollTo({ left: chip.offsetLeft - box.clientWidth / 2 + chip.clientWidth / 2, behavior: 'smooth' });
  }, [activeCat]);

  const jump = (catId: string) => {
    const el = sectionRefs.current[catId];
    if (!el) return;
    const offset = (tabsRef.current?.offsetHeight ?? 56) + 8;
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    setActiveCat(catId);
  };

  if (!data) {
    return (
      <div className="min-h-[100dvh]">
        <div className="bg-ink px-5 pt-10 pb-8 rounded-b-[2rem]">
          <button onClick={() => router.push('/food')} className="w-11 h-11 rounded-2xl bg-white/10 text-white flex items-center justify-center">
            <ChevronLeft size={22} />
          </button>
          {!err && (
            <div className="mt-4 flex items-center gap-4">
              <div className="w-[72px] h-[72px] rounded-2xl bg-white/10" />
              <div className="flex-1 space-y-2">
                <div className="h-6 w-2/3 rounded-lg bg-white/10" />
                <div className="h-4 w-1/2 rounded-lg bg-white/10" />
              </div>
            </div>
          )}
        </div>
        {err ? (
          <div className="p-6 pt-12 flex flex-col items-center text-center text-sm text-neutral-500">
            <Ban size={28} className="text-neutral-300 mb-2" />
            {err}
            <button onClick={() => router.push('/food')} className="mt-4 h-11 px-5 rounded-xl bg-ink text-gold font-bold">
              Oshxonalar ro‘yxati
            </button>
          </div>
        ) : (
          <div className="px-5 mt-5 grid grid-cols-2 gap-3">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-60 rounded-3xl skeleton" />
            ))}
          </div>
        )}
      </div>
    );
  }

  const k = data.kitchen;
  const cartK: CartKitchen = { id: k.id, name: k.name, logoUrl: k.logoUrl, minOrder: k.minOrder };
  const qtyOf = (itemId: string) => lines.find((l) => l.itemId === itemId && l.kitchenId === k.id)?.qty ?? 0;
  const hasCart = lines.length > 0;

  // The cart may hold several kitchens at once — each becomes its own order at checkout.
  const addItem = (item: MenuItem) => {
    if (!k.isOpen) return;
    add(cartK, item);
  };
  const dec = (item: MenuItem) => setQty(item.id, qtyOf(item.id) - 1);

  return (
    <>
      <div className="animate-in fade-in duration-300">
        <header className="bg-ink text-white px-5 pt-10 pb-5 rounded-b-[2rem] relative overflow-hidden">
          <div aria-hidden className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-gold/25 blur-3xl" />
          <div className="relative flex items-center justify-between">
            <button
              onClick={() => router.push('/food')}
              className="w-11 h-11 rounded-2xl bg-white/10 ring-1 ring-white/10 flex items-center justify-center active:scale-95 transition"
              aria-label="Orqaga"
            >
              <ChevronLeft size={22} />
            </button>
            {k.phone && (
              <a
                href={`tel:${k.phone}`}
                className="h-11 px-3.5 rounded-2xl bg-white/10 ring-1 ring-white/10 flex items-center gap-2 text-sm font-bold active:scale-95 transition"
              >
                <Phone size={16} className="text-gold" /> Qo‘ng‘iroq
              </a>
            )}
          </div>
          <div className="relative mt-4 flex items-center gap-4">
            <KitchenLogo url={k.logoUrl} size={76} className="ring-2 ring-gold/50" dim={!k.isOpen} />
            <div className="min-w-0 flex-1">
              <h1 className="text-2xl font-extrabold leading-tight line-clamp-2">{k.name}</h1>
              <div className="mt-1">
                <OpenBadge open={k.isOpen} />
              </div>
              {k.description && <p className="mt-1.5 text-sm text-neutral-300 leading-snug line-clamp-2">{k.description}</p>}
            </div>
          </div>
          <div className="relative mt-4 grid grid-cols-3 gap-2">
            <InfoTile icon={<Clock size={14} />} value={`~${k.prepMinutes} daq`} label="Tayyorlash" />
            <InfoTile
              icon={<Bike size={14} />}
              value={k.deliveryFee == null ? '—' : k.deliveryFee === 0 ? 'Bepul' : money(k.deliveryFee)}
              label={`${k.courierMode === 'taxi' ? 'Taksi yetkazadi' : 'Yetkazish'}${k.distanceKm != null ? ` · ${fmtKm(k.distanceKm)}` : ''}`}
            />
            <InfoTile icon={<Wallet size={14} />} value={k.minOrder > 0 ? money(k.minOrder) : 'Yo‘q'} label="Min. buyurtma" />
          </div>
          {k.address && (
            <p className="relative mt-3 text-xs text-neutral-400 flex items-center gap-1.5">
              <MapPin size={12} className="shrink-0" /> <span className="truncate">{k.address}</span>
            </p>
          )}
        </header>

        {!k.isOpen && (
          <div className="mx-5 mt-4 rounded-2xl bg-neutral-100 border border-line p-3.5 text-sm flex items-start gap-2.5">
            <Ban size={18} className="text-neutral-500 shrink-0 mt-0.5" />
            <span>
              <b>Oshxona hozir yopiq.</b> Menyuni ko‘rishingiz mumkin, buyurtma ochilgandan keyin qabul qilinadi.
            </span>
          </div>
        )}
        {removed.length > 0 && (
          <div className="mx-5 mt-4 rounded-2xl bg-amber-50 border border-amber-200 p-3.5 text-sm flex items-start gap-2.5 text-amber-900">
            <Info size={18} className="shrink-0 mt-0.5" />
            <span className="flex-1">Savatdan olib tashlandi (menyuda endi yo‘q): {removed.join(', ')}</span>
            <button onClick={() => setRemoved([])} aria-label="Yopish">
              <X size={16} />
            </button>
          </div>
        )}

        {/* sticky category tabs */}
        {sections.length > 1 && (
          <div ref={tabsRef} className="sticky top-0 z-20 mt-3 bg-paper/95 backdrop-blur border-b border-line" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
            <div ref={tabsScroll} className="flex gap-2 overflow-x-auto no-scrollbar px-5 py-2.5">
              {sections.map((s) => (
                <button
                  key={s.id}
                  ref={(el) => {
                    chipRefs.current[s.id] = el;
                  }}
                  onClick={() => jump(s.id)}
                  className={cn(
                    'shrink-0 h-9 px-4 rounded-full text-sm font-bold transition-colors whitespace-nowrap',
                    activeCat === s.id ? 'bg-ink text-gold' : 'bg-white border border-line text-neutral-600',
                  )}
                >
                  {s.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="px-5 pt-3 pb-6 space-y-6">
          {sections.length === 0 && <p className="py-12 text-center text-sm text-neutral-500">Menyu hozircha bo‘sh</p>}
          {sections.map((s) => (
            <section
              key={s.id}
              ref={(el) => {
                sectionRefs.current[s.id] = el;
              }}
            >
              <h2 className="text-xl font-extrabold mb-3">{s.name}</h2>
              <div className="grid grid-cols-2 gap-3">
                {s.items.map((it) => {
                  const qty = qtyOf(it.id);
                  return (
                    <div key={it.id} className={cn('rounded-3xl bg-white border overflow-hidden flex flex-col transition-colors', qty ? 'border-gold ring-1 ring-gold/50' : 'border-line')}>
                      <button onClick={() => setSheetItem(it)} className="relative block aspect-[4/3] bg-neutral-100 text-left">
                        <FoodImage src={it.photoUrl} alt={it.name} className="absolute inset-0 w-full h-full" />
                        {qty > 0 && (
                          <span className="absolute top-2 left-2 min-w-[24px] h-6 px-1.5 rounded-full bg-gold text-ink text-xs font-extrabold flex items-center justify-center shadow tabular-nums">
                            {qty}
                          </span>
                        )}
                      </button>
                      <div className="p-3 flex-1 flex flex-col">
                        <p className="font-extrabold tabular-nums">
                          {money(it.price)} <span className="text-xs font-semibold text-neutral-500">so‘m</span>
                        </p>
                        <button onClick={() => setSheetItem(it)} className="text-left">
                          <p className="mt-0.5 text-sm font-semibold leading-snug line-clamp-2">{it.name}</p>
                          {it.description && <p className="mt-0.5 text-[11px] text-neutral-500 leading-snug line-clamp-2">{it.description}</p>}
                        </button>
                        <div className="mt-auto pt-2.5">
                          {qty > 0 ? (
                            <QtyControl qty={qty} onInc={() => addItem(it)} onDec={() => dec(it)} />
                          ) : (
                            <button
                              onClick={() => addItem(it)}
                              disabled={!k.isOpen}
                              className="w-full h-10 rounded-2xl bg-paper border border-line font-bold text-sm flex items-center justify-center gap-1 active:scale-[0.97] disabled:opacity-40 transition"
                            >
                              <Plus size={16} /> Qo‘shish
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
          {hasCart && <div className="h-20" />}
        </div>
      </div>

      {/* fixed layers live outside the animated (transformed) wrapper */}
      <CartBar />

      {sheetItem && (
        <ItemSheet
          item={sheetItem}
          qty={qtyOf(sheetItem.id)}
          open={k.isOpen}
          onAdd={() => addItem(sheetItem)}
          onDec={() => dec(sheetItem)}
          onClose={() => setSheetItem(null)}
        />
      )}
    </>
  );
}

function InfoTile({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="rounded-2xl bg-white/[0.07] ring-1 ring-white/10 px-2.5 py-2 min-w-0">
      <p className="flex items-center gap-1.5 font-extrabold text-sm tabular-nums truncate">
        <span className="text-gold shrink-0">{icon}</span>
        <span className="truncate">{value}</span>
      </p>
      <p className="text-[10px] text-neutral-400 truncate mt-0.5">{label}</p>
    </div>
  );
}

function ItemSheet({
  item,
  qty,
  open,
  onAdd,
  onDec,
  onClose,
}: {
  item: MenuItem;
  qty: number;
  open: boolean;
  onAdd: () => void;
  onDec: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center">
      <button aria-label="Yopish" onClick={onClose} className="absolute inset-0 bg-black/45 animate-in fade-in duration-200" />
      <div className="relative w-full max-w-md max-h-[90dvh] overflow-y-auto no-scrollbar rounded-t-[2rem] bg-white shadow-2xl animate-in slide-in-from-bottom-6 duration-300">
        <div className="relative aspect-[4/3] bg-neutral-100">
          <FoodImage src={item.photoUrl} alt={item.name} className="absolute inset-0 w-full h-full" iconSize={48} />
          <button
            onClick={onClose}
            aria-label="Yopish"
            className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/90 backdrop-blur shadow flex items-center justify-center"
          >
            <X size={18} />
          </button>
        </div>
        <div className="px-5 pt-4" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}>
          <h3 className="text-xl font-extrabold leading-snug">{item.name}</h3>
          {item.description && <p className="mt-1.5 text-sm text-neutral-600 leading-relaxed whitespace-pre-line">{item.description}</p>}
          <div className="mt-5 flex items-center gap-3">
            <p className="text-2xl font-extrabold tabular-nums">
              {money(item.price)} <span className="text-sm font-semibold text-neutral-500">so‘m</span>
            </p>
            <div className="flex-1" />
            {qty > 0 ? (
              <QtyControl qty={qty} onInc={onAdd} onDec={onDec} size="lg" className="w-40" />
            ) : (
              <button
                onClick={onAdd}
                disabled={!open}
                className="h-12 px-6 rounded-2xl bg-ink text-gold font-extrabold flex items-center gap-2 disabled:opacity-40 active:scale-[0.97] transition"
              >
                {open && <Plus size={18} />}
                {open ? 'Savatga' : 'Yopiq'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
