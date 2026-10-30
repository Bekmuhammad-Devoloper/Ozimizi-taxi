'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, UtensilsCrossed, Store, Car, Bike, Gift, Layers } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { KitchenLogo } from '@/components/FoodUi';
import { api, errMsg } from '@/lib/api';
import { fmtDateTime } from '@/lib/date';
import { FoodOrder, foodCashDue, foodFlow, foodStatusLabel, foodStatusShort, isFoodActive, itemsSummary } from '@/lib/food';
import { money } from '@/lib/status';
import { cn } from '@/lib/cn';
import { useFoodStore } from '@/stores/food';

export default function FoodOrdersPage() {
  return (
    <Shell>
      <FoodOrdersInner />
    </Shell>
  );
}

function FoodOrdersInner() {
  const [ids, setIds] = useState<string[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const orders = useFoodStore((s) => s.orders);

  useEffect(() => {
    api
      .get<FoodOrder[]>('/client/food/orders')
      .then((r) => {
        const list = Array.isArray(r.data) ? r.data : [];
        useFoodStore.getState().upsertMany(list, 'fetch');
        setIds(list.map((o) => o.id));
      })
      .catch((e) => {
        setErr(errMsg(e, 'Buyurtmalarni yuklab bo‘lmadi'));
        setIds([]);
      });
  }, []);

  // Rows come from the store so socket updates show up live; active first.
  const rows = useMemo(() => {
    if (!ids) return null;
    const known = new Set(ids);
    const all = Object.values(orders).filter((o) => known.has(o.id) || isFoodActive(o.status));
    return all.sort((a, b) => {
      const d = Number(isFoodActive(b.status)) - Number(isFoodActive(a.status));
      return d || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
  }, [ids, orders]);

  // Orders placed together from several kitchens share a groupId.
  const groupSize = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of rows ?? []) if (o.groupId) m.set(o.groupId, (m.get(o.groupId) ?? 0) + 1);
    return m;
  }, [rows]);
  const sizeOf = (o: FoodOrder) => (o.groupId ? groupSize.get(o.groupId) ?? 1 : 1);

  const active = rows?.filter((o) => isFoodActive(o.status)) ?? [];
  const past = rows?.filter((o) => !isFoodActive(o.status)) ?? [];
  const delivered = past.filter((o) => o.status === 'DELIVERED').length;

  return (
    <div className="animate-in fade-in duration-300">
      <header className="bg-ink text-white px-5 pt-10 pb-6 rounded-b-[2rem] relative overflow-hidden">
        <div aria-hidden className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-gold/20 blur-3xl" />
        <Link href="/food" className="relative text-sm text-neutral-300 flex items-center gap-1 mb-4">
          <ChevronLeft size={16} /> Oshxonalar
        </Link>
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">Ovqat yetkazish</p>
            <h1 className="text-2xl font-extrabold mt-0.5">Buyurtmalarim</h1>
          </div>
          {rows && (
            <div className="text-right">
              <p className="text-2xl font-extrabold text-gold tabular-nums leading-none">{delivered}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">yetkazilgan</p>
            </div>
          )}
        </div>
      </header>

      <section className="px-5 mt-4 space-y-5">
        {rows === null && (
          <div className="space-y-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 rounded-2xl skeleton" />
            ))}
          </div>
        )}
        {err && <p className="text-sm text-red-600">{err}</p>}
        {rows?.length === 0 && !err && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-neutral-500">
            <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center">
              <UtensilsCrossed size={26} />
            </span>
            Hali ovqat buyurtma qilmagansiz
            <br />
            <Link href="/food" className="mt-3 inline-flex items-center gap-1.5 font-bold text-ink">
              🍔 Oshxonalarni ko‘rish
            </Link>
          </div>
        )}
        {active.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Faol</p>
            <div className="space-y-2.5">
              {active.map((o) => (
                <OrderRow key={o.id} o={o} group={sizeOf(o)} />
              ))}
            </div>
          </div>
        )}
        {past.length > 0 && (
          <div>
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">Oldingi buyurtmalar</p>
            <div className="space-y-2.5">
              {past.map((o) => (
                <OrderRow key={o.id} o={o} group={sizeOf(o)} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function OrderRow({ o, group }: { o: FoodOrder; group: number }) {
  const live = isFoodActive(o.status);
  const ok = o.status === 'DELIVERED';
  const flow = foodFlow(o);
  const bonus = Number(o.bonusUsed ?? 0);
  const cash = foodCashDue(o);
  return (
    <Link
      href={`/food/orders/${o.id}`}
      className={cn(
        'relative block rounded-2xl border bg-white p-3.5 pl-4 overflow-hidden active:bg-neutral-50 transition',
        live ? 'border-gold/60 shadow-[0_10px_30px_-18px_rgba(59,155,255,.9)]' : 'border-line',
      )}
    >
      <span aria-hidden className={cn('absolute left-0 top-3 bottom-3 w-1 rounded-r', live ? 'bg-gold' : ok ? 'bg-emerald-500' : 'bg-red-400')} />
      <div className="flex items-center gap-3">
        <KitchenLogo url={o.kitchen?.logoUrl} size={48} className="rounded-xl" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-extrabold truncate">{o.kitchen?.name ?? 'Oshxona'}</p>
            <span
              className={cn(
                'shrink-0 max-w-[55%] truncate text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
                live ? 'bg-gold/15 text-gold-deep' : ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700',
              )}
            >
              {live ? foodStatusLabel(o) : foodStatusShort(o)}
            </span>
          </div>
          <p className="text-xs text-neutral-500 truncate mt-0.5">{itemsSummary(o.items)}</p>
          {(flow !== 'courier' || bonus > 0 || group > 1) && (
            <div className="mt-1 flex flex-wrap items-center gap-1 text-[10px] font-semibold">
              {flow === 'pickup' && (
                <Tag>
                  <Store size={10} /> O‘zi olib ketadi
                </Tag>
              )}
              {flow === 'kitchen' && (
                <Tag>
                  <Bike size={10} /> Oshxona yetkazadi
                </Tag>
              )}
              {flow === 'taxi' && (
                <Tag>
                  <Car size={10} /> Taksi yetkazadi
                </Tag>
              )}
              {bonus > 0 && (
                <Tag tone="green">
                  <Gift size={10} /> Bonus {money(bonus)}
                </Tag>
              )}
              {group > 1 && (
                <Tag>
                  <Layers size={10} /> {group} ta oshxonadan birga
                </Tag>
              )}
            </div>
          )}
          <div className="mt-1 flex items-center justify-between gap-2 text-xs">
            <span className="text-neutral-400 tabular-nums">
              #{o.number} · {fmtDateTime(o.createdAt)}
            </span>
            <span className="font-extrabold tabular-nums text-sm text-ink">
              {money(bonus > 0 ? cash : o.total)} so‘m{bonus > 0 && <span className="ml-1 text-[10px] font-semibold text-neutral-400">naqd</span>}
            </span>
          </div>
        </div>
        <ChevronRight size={18} className="text-neutral-300 shrink-0" />
      </div>
    </Link>
  );
}

function Tag({ children, tone }: { children: React.ReactNode; tone?: 'green' }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 h-5 px-1.5 rounded-md border',
        tone === 'green' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-paper border-line text-neutral-600',
      )}
    >
      {children}
    </span>
  );
}
