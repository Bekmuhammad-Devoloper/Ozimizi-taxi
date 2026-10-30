'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, ClipboardList, Car } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtTime, localDayKey } from '@/lib/date';
import { money, STATUS_LABEL } from '@/lib/status';
import { ClientOrder, isActiveStatus } from '@/stores/order';

const MONTHS = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avgust', 'sentabr', 'oktabr', 'noyabr', 'dekabr'];

function dayLabel(key: string, iso: string) {
  const today = localDayKey(new Date().toISOString());
  const y = new Date();
  y.setDate(y.getDate() - 1);
  if (key === today) return 'Bugun';
  if (key === localDayKey(y.toISOString())) return 'Kecha';
  const d = new Date(iso);
  return `${d.getDate()}-${MONTHS[d.getMonth()]}`;
}

export default function OrdersPage() {
  return (
    <Shell>
      <OrdersInner />
    </Shell>
  );
}

function OrdersInner() {
  const [rows, setRows] = useState<ClientOrder[] | null>(null);
  useEffect(() => {
    api.get<ClientOrder[]>('/client/orders').then((r) => setRows(r.data)).catch(() => setRows([]));
  }, []);

  const groups = useMemo(() => {
    const map = new Map<string, ClientOrder[]>();
    for (const o of rows ?? []) {
      const k = localDayKey(o.createdAt);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(o);
    }
    return [...map.entries()];
  }, [rows]);

  const total = (rows ?? []).filter((o) => o.status === 'COMPLETED').length;

  return (
    <div className="animate-in fade-in duration-300">
      <header className="bg-ink text-white px-5 pt-10 pb-6 rounded-b-[2rem] relative overflow-hidden">
        <div aria-hidden className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-end justify-between">
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">Moviy Taxi</p>
            <h1 className="text-2xl font-extrabold mt-0.5">Safarlarim</h1>
          </div>
          {rows && (
            <div className="text-right">
              <p className="text-2xl font-extrabold text-gold tabular-nums leading-none">{total}</p>
              <p className="text-[10px] uppercase tracking-wider text-neutral-400">bajarilgan</p>
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
        {rows?.length === 0 && (
          <div className="rounded-2xl border border-line bg-white p-8 text-center text-sm text-neutral-500">
            <span className="mx-auto mb-3 w-14 h-14 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center">
              <ClipboardList size={26} />
            </span>
            Hali safar bo‘lmagan
            <br />
            <Link href="/home" className="mt-3 inline-flex items-center gap-1.5 font-bold text-ink">
              <Car size={14} /> Birinchi taksini chaqiring
            </Link>
          </div>
        )}
        {groups.map(([key, list]) => (
          <div key={key}>
            <p className="text-[11px] font-bold uppercase tracking-widest text-neutral-500 mb-2">{dayLabel(key, list[0].createdAt)}</p>
            <div className="space-y-2.5">
              {list.map((o) => {
                const live = isActiveStatus(o.status);
                const stripe = live ? 'bg-gold' : o.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-red-400';
                return (
                  <Link key={o.id} href={`/order/${o.id}`} className="relative block rounded-2xl border border-line bg-white p-4 pl-5 overflow-hidden active:bg-neutral-50 transition">
                    <span aria-hidden className={'absolute left-0 top-3 bottom-3 w-1 rounded-r ' + stripe} />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs text-neutral-500 tabular-nums">{fmtTime(o.createdAt)}</span>
                      <span
                        className={
                          'text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ' +
                          (live ? 'bg-gold/15 text-gold-deep' : o.status === 'COMPLETED' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
                        }
                      >
                        {STATUS_LABEL[o.status]}
                      </span>
                    </div>
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 min-w-0 text-sm">
                        <p className="truncate font-semibold">
                          <span className="text-neutral-400 font-normal mr-1">A</span>
                          {o.pickupAddress ?? `${o.pickupLat.toFixed(4)}, ${o.pickupLng.toFixed(4)}`}
                        </p>
                        {o.destinationAddress && (
                          <p className="truncate">
                            <span className="text-neutral-400 mr-1">B</span>
                            {o.destinationAddress}
                          </p>
                        )}
                        {o.driver && (
                          <p className="text-xs text-neutral-500 mt-0.5 truncate">
                            {o.driver.fullName}
                            {o.driver.carPlate ? ` · ${o.driver.carPlate}` : ''}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="font-extrabold tabular-nums">{o.price ? `${money(o.price)} so‘m` : '—'}</p>
                        {o.distanceKm && <p className="text-xs text-neutral-500">{Number(o.distanceKm).toFixed(1)} km</p>}
                      </div>
                      <ChevronRight size={18} className="text-neutral-300" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
