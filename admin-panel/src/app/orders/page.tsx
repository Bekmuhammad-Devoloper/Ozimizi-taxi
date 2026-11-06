'use client';
import { Fragment, useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  Flag,
  X as XIcon,
  ListTree,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { orderStatusLabel } from '@/lib/status';
import { fmtDateTime } from '@/lib/format';
import { OrderTimeline } from '@/components/OrderTimeline';

interface OrderRow {
  id: string;
  createdAt: string;
  status: string;
  distanceKm: string | null;
  price: string | null;
  commission: string;
  discount?: string | null;
  bonusUsed?: string | null;
  waitingMinutes?: number;
  waitingFee?: string | null;
  waitingSeconds?: number;
  outsideKm?: string | number | null;
  outsideFee?: string | number | null;
  waitStartedAt?: string | null;
  waitTickAt?: string | null;
  cancelPenalty?: string | null;
  destinationAddress?: string | null;
  pickupLat?: number;
  pickupLng?: number;
  destinationLat?: number | null;
  destinationLng?: number | null;
  driver?: { fullName: string } | null;
  client?: { firstName: string; phonePrimary: string } | null;
  pickupAddress: string | null;
}

const STATUSES = [
  'PENDING',
  'ACCEPTED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;

export default function OrdersPage() {
  const qc = useQueryClient();
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [status, setStatus] = useState<string[]>([]);
  const [page, setPage] = useState(1);
  // Expanded "Harakatlar" (timeline) rows; ?open=<id> from the live feed.
  const [openIds, setOpenIds] = useState<string[]>([]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('open');
    if (id) setOpenIds([id]);
  }, []);
  const toggleOpen = (id: string) =>
    setOpenIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const pageSize = 25;

  const { data, isLoading } = useQuery({
    queryKey: ['orders', { from, to, status, page }],
    queryFn: async () => {
      const params: any = { page, pageSize };
      if (from) params.from = from;
      if (to) params.to = to;
      if (status.length) params.status = status.join(',');
      return (await api.get('/admin/orders', { params })).data;
    },
    // Active orders show a live waiting timer, so keep the list fresh.
    refetchInterval: 15_000,
  });
  const { data: tariff } = useQuery({
    queryKey: ['tariff'],
    queryFn: async () => (await api.get('/admin/tariff')).data,
    staleTime: 60_000,
  });
  const now = useNow(5_000);

  const forceCancel = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/orders/${id}/cancel`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  const forceComplete = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/orders/${id}/complete`, { distanceKm: 0 })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  const isFinal = (s: string) => s === 'COMPLETED' || s === 'CANCELLED';

  const toggleStatus = (s: string) => {
    setStatus((curr) =>
      curr.includes(s) ? curr.filter((x) => x !== s) : [...curr, s],
    );
    setPage(1);
  };

  const exportCsv = () => {
    if (!data?.items) return;
    const headers = [
      'id',
      'createdAt',
      'status',
      'driver',
      'client',
      'pickupAddress',
      'destinationAddress',
      'distanceKm',
      'waitingMinutes',
      'waitingFee',
      'bonusUsed',
      'discount',
      'cancelPenalty',
      'price',
      'commission',
    ];
    const rows = data.items.map((o: OrderRow) => {
      return [
        o.id,
        o.createdAt,
        o.status,
        o.driver?.fullName ?? '',
        o.client?.firstName ?? '',
        o.pickupAddress ?? '',
        o.destinationAddress ?? '',
        o.distanceKm ?? '',
        o.waitingMinutes ?? 0,
        o.waitingFee ?? '0',
        o.bonusUsed ?? '0',
        o.discount ?? '0',
        o.cancelPenalty ?? '0',
        o.price ?? '',
        o.commission ?? '',
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(',');
    });
    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'orders.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;

  return (
    <Shell
      title="Buyurtmalar"
      subtitle={`Jami: ${data?.total ?? 0} ta`}
      actions={
        <button onClick={exportCsv} className="btn-secondary">
          <Download size={16} /> CSV eksport
        </button>
      }
    >
      <div className="card p-4 mb-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[160px]">
          <p className="label mb-1">Boshlanish sanasi</p>
          <input
            type="date"
            value={from}
            onChange={(e) => {
              setFrom(e.target.value);
              setPage(1);
            }}
            className="input"
          />
        </div>
        <div className="flex-1 min-w-[160px]">
          <p className="label mb-1">Tugash sanasi</p>
          <input
            type="date"
            value={to}
            onChange={(e) => {
              setTo(e.target.value);
              setPage(1);
            }}
            className="input"
          />
        </div>
        <div className="w-full">
          <p className="label mb-2 flex items-center gap-1">
            <Filter size={11} /> Status
          </p>
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((s) => (
              <button
                key={s}
                onClick={() => toggleStatus(s)}
                className={
                  'px-3 h-8 text-[11px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
                  (status.includes(s)
                    ? 'bg-ink text-gold border-ink'
                    : 'bg-white text-neutral-500 border-line hover:border-ink')
                }
              >
                {orderStatusLabel(s)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {isLoading && (
          <p className="text-sm text-neutral-500 text-center py-8">Yuklanmoqda…</p>
        )}
        {!isLoading && (!data?.items || data.items.length === 0) && (
          <p className="text-sm text-neutral-500 text-center py-8">
            Buyurtma topilmadi
          </p>
        )}
        {data?.items?.map((o: OrderRow) => (
          <div key={o.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <StatusBadge status={o.status} />
              <p className="text-[10px] text-neutral-500">
                {fmtDateTime(o.createdAt)}
              </p>
            </div>
            <div className="space-y-1.5">
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Klient</span>
                <span className="font-medium">
                  {o.client?.firstName ?? '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Haydovchi</span>
                <span className="font-medium">
                  {o.driver?.fullName ?? '—'}
                </span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-neutral-500">Masofa</span>
                <span className="tabular-nums">
                  {o.distanceKm ?? '—'} km
                </span>
              </div>
              <RouteLine o={o} />
              <MoneyLines o={o} />
            </div>
            <button
              onClick={() => toggleOpen(o.id)}
              className="mt-3 w-full h-9 rounded-lg border border-line text-xs font-bold flex items-center justify-center gap-1.5"
            >
              <ListTree size={14} /> {openIds.includes(o.id) ? 'Harakatlarni yopish' : 'Buyurtma harakatlari'}
            </button>
            {openIds.includes(o.id) && (
              <div className="mt-2">
                <OrderTimeline orderId={o.id} />
              </div>
            )}
            <div className="flex justify-between items-baseline pt-3 mt-3 border-t border-line">
              <span className="text-xs text-neutral-500">Narx</span>
              <p className="text-lg font-bold tabular-nums">
                {o.price ? Number(o.price).toLocaleString('uz') : '—'}{' '}
                <span className="text-[10px] font-normal text-neutral-500">
                  so'm
                </span>
              </p>
            </div>
            {!isFinal(o.status) && (
              <div className="flex gap-2 mt-3">
                <button
                  disabled={forceComplete.isPending}
                  onClick={() => {
                    if (
                      confirm(
                        'Buyurtmani majburiy yakunlaysizmi? Komissiya haydovchidan yechiladi.',
                      )
                    )
                      forceComplete.mutate(o.id);
                  }}
                  className="flex-1 h-9 rounded-lg bg-green-50 text-green-700 text-xs font-bold flex items-center justify-center gap-1"
                >
                  <Flag size={14} /> Yakunlash
                </button>
                <button
                  disabled={forceCancel.isPending}
                  onClick={() => {
                    if (confirm('Buyurtmani bekor qilasizmi?'))
                      forceCancel.mutate(o.id);
                  }}
                  className="flex-1 h-9 rounded-lg bg-red-50 text-red-600 text-xs font-bold flex items-center justify-center gap-1"
                >
                  <XIcon size={14} /> Bekor qilish
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[1250px]">
            <thead>
              <tr>
                <th className="th">Sana</th>
                <th className="th">Klient</th>
                <th className="th">Haydovchi</th>
                <th className="th">Yo‘nalish</th>
                <th className="th text-right">Km</th>
                <th className="th text-right">Narx</th>
                <th className="th text-right">Komissiya</th>
                <th className="th text-right">Bonus</th>
                <th className="th text-right">Kutish</th>
                <th className="th text-right">Jarima</th>
                <th className="th">Status</th>
                <th className="th text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-neutral-500">
                    Yuklanmoqda…
                  </td>
                </tr>
              )}
              {!isLoading && (!data?.items || data.items.length === 0) && (
                <tr>
                  <td colSpan={12} className="p-10 text-center text-neutral-500">
                    Filterga mos buyurtma topilmadi
                  </td>
                </tr>
              )}
              {data?.items?.map((o: OrderRow) => (
                <Fragment key={o.id}>
                <tr
                  className={'hover:bg-neutral-50 transition-colors ' + (openIds.includes(o.id) ? 'bg-neutral-50' : '')}
                >
                  <td className="td text-xs text-neutral-500 whitespace-nowrap">
                    {fmtDateTime(o.createdAt)}
                  </td>
                  <td className="td font-medium">
                    {o.client?.firstName ?? (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="td">
                    {o.driver?.fullName ?? (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="td text-neutral-600 min-w-[220px] max-w-[300px]">
                    <RouteLine o={o} compact />
                  </td>
                  <td className="td text-right tabular-nums text-neutral-600">
                    {o.distanceKm ?? (
                      <span className="text-neutral-300">—</span>
                    )}
                  </td>
                  <td className="td text-right tabular-nums font-bold">
                    {o.price ? Number(o.price).toLocaleString('uz') : '—'}
                  </td>
                  <td className="td text-right tabular-nums text-neutral-600">
                    {Number(o.commission).toLocaleString('uz')}
                  </td>
                  <td className="td text-right tabular-nums text-neutral-600">
                    {Number(o.bonusUsed ?? 0) > 0 ? Number(o.bonusUsed).toLocaleString('uz') : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="td text-right tabular-nums text-neutral-600 whitespace-nowrap">
                    <WaitCell o={o} tariff={tariff} now={now} />
                  </td>
                  <td className="td text-right tabular-nums text-red-600">
                    {Number(o.cancelPenalty ?? 0) > 0 ? Number(o.cancelPenalty).toLocaleString('uz') : <span className="text-neutral-300">—</span>}
                  </td>
                  <td className="td">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="td">
                    <div className="flex gap-1 justify-end">
                      <button
                        onClick={() => toggleOpen(o.id)}
                        title="Buyurtma harakatlari"
                        className={
                          'w-8 h-8 rounded-lg flex items-center justify-center ' +
                          (openIds.includes(o.id) ? 'bg-ink text-gold' : 'hover:bg-neutral-100 text-neutral-600')
                        }
                      >
                        <ListTree size={14} />
                      </button>
                      {!isFinal(o.status) && (
                        <>
                          <button
                            disabled={forceComplete.isPending}
                            onClick={() => {
                              if (
                                confirm(
                                  'Buyurtmani majburiy yakunlaysizmi? Komissiya haydovchidan yechiladi.',
                                )
                              )
                                forceComplete.mutate(o.id);
                            }}
                            title="Yakunlash"
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-green-50 text-green-700"
                          >
                            <Flag size={14} />
                          </button>
                          <button
                            disabled={forceCancel.isPending}
                            onClick={() => {
                              if (confirm('Buyurtmani bekor qilasizmi?'))
                                forceCancel.mutate(o.id);
                            }}
                            title="Bekor qilish"
                            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-600"
                          >
                            <XIcon size={14} />
                          </button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
                {openIds.includes(o.id) && (
                  <tr>
                    <td colSpan={12} className="px-6 py-3 bg-neutral-50/70">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">
                        Buyurtma harakatlari — kimga borgan, kim olmagan, necha soniya jiringlagan
                      </p>
                      <OrderTimeline orderId={o.id} />
                    </td>
                  </tr>
                )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex items-center justify-between mt-4">
        <p className="text-sm text-neutral-500">
          Sahifa <b>{data?.page ?? 1}</b> / {totalPages} · Jami{' '}
          <b>{data?.total ?? 0}</b>
        </p>
        <div className="flex gap-2">
          <button
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
            className="btn-secondary"
          >
            <ChevronLeft size={16} /> Oldingi
          </button>
          <button
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
            className="btn-secondary"
          >
            Keyingi <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </Shell>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    COMPLETED: 'bg-green-50 text-green-700 border-green-200',
    CANCELLED: 'bg-red-50 text-red-700 border-red-200',
    IN_PROGRESS: 'bg-gold/15 text-gold-deep border-gold/40',
    ACCEPTED: 'bg-blue-50 text-blue-700 border-blue-200',
    PENDING: 'bg-neutral-100 text-neutral-600 border-neutral-200',
    ON_THE_WAY: 'bg-gold/15 text-gold-deep border-gold/40',
    ARRIVED: 'bg-gold/15 text-gold-deep border-gold/40',
  };
  return (
    <span
      className={
        'inline-block text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border whitespace-nowrap ' +
        (map[status] ?? 'bg-neutral-100 text-neutral-600 border-neutral-200')
      }
    >
      {orderStatusLabel(status)}
    </span>
  );
}

/** "Qayerdan → qayerga": street names when geocoded, else map links. */
function RouteLine({ o, compact }: { o: OrderRow; compact?: boolean }) {
  const pt = (addr: string | null | undefined, lat?: number | null, lng?: number | null) =>
    addr ? (
      <span>{addr}</span>
    ) : lat != null && lng != null ? (
      <a
        href={`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`}
        target="_blank"
        rel="noreferrer"
        className="text-blue-600 font-mono"
      >
        {lat.toFixed(4)}, {lng.toFixed(4)}
      </a>
    ) : (
      <span className="text-neutral-300">—</span>
    );
  return (
    <div className={compact ? 'text-xs leading-snug space-y-0.5' : 'text-sm space-y-0.5 pt-1'}>
      <p className="flex gap-1.5">
        <span className="text-neutral-400 shrink-0">A</span>
        {pt(o.pickupAddress, o.pickupLat, o.pickupLng)}
      </p>
      <p className="flex gap-1.5">
        <span className="text-neutral-400 shrink-0">B</span>
        {pt(o.destinationAddress, o.destinationLat, o.destinationLng)}
      </p>
    </div>
  );
}

function MoneyLines({ o }: { o: OrderRow }) {
  const rows: [string, string, string?][] = [];
  rows.push(['Komissiya', Number(o.commission).toLocaleString('uz') + " so'm"]);
  if (Number(o.bonusUsed ?? 0) > 0) rows.push(['Mijoz bonusi', Number(o.bonusUsed).toLocaleString('uz') + " so'm", 'text-green-700']);
  if (Number(o.discount ?? 0) > 0) rows.push(['Promo chegirma', Number(o.discount).toLocaleString('uz') + " so'm"]);
  if (o.waitingMinutes || Number(o.waitingFee ?? 0) > 0)
    rows.push(['Kutish', `${o.waitingMinutes ?? 0} daq · ${Number(o.waitingFee ?? 0).toLocaleString('uz')} so'm`]);
  if (Number(o.outsideFee ?? 0) > 0)
    rows.push(['Hududdan tashqari', `${Number(o.outsideKm ?? 0).toFixed(1)} km · ${Number(o.outsideFee).toLocaleString('uz')} so'm`]);
  if (Number(o.cancelPenalty ?? 0) > 0) rows.push(['Jarima (bonusdan)', Number(o.cancelPenalty).toLocaleString('uz') + " so'm", 'text-red-600']);
  return (
    <div className="pt-1 space-y-1">
      {rows.map(([k, v, cls]) => (
        <div key={k} className="flex justify-between text-xs">
          <span className="text-neutral-500">{k}</span>
          <span className={'tabular-nums font-medium ' + (cls ?? '')}>{v}</span>
        </div>
      ))}
    </div>
  );
}

function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

const LIVE_WAIT = ['ARRIVED', 'IN_PROGRESS'];

/** Waiting so far for an active order: settled seconds plus the running stretch. */
function liveWait(o: OrderRow, tariff: any, now: number) {
  if (!LIVE_WAIT.includes(o.status)) return null;
  const running = o.status === 'ARRIVED' || !!o.waitStartedAt;
  let sec = Number(o.waitingSeconds ?? 0);
  if (running && o.waitTickAt) sec += Math.max(0, Math.round((now - new Date(o.waitTickAt).getTime()) / 1000));
  const free = Number(tariff?.waitingFreeMinutes ?? 0);
  const perMin = Number(tariff?.waitingPricePerMinute ?? 0);
  const fee = Math.max(0, Math.ceil(sec / 60) - free) * perMin;
  return { sec, fee, running };
}

function WaitCell({ o, tariff, now }: { o: OrderRow; tariff: any; now: number }) {
  const live = liveWait(o, tariff, now);
  if (live && (live.sec > 0 || live.running)) {
    const m = Math.floor(live.sec / 60);
    const ss = String(live.sec % 60).padStart(2, '0');
    return (
      <span className={live.running ? 'text-amber-700 font-semibold' : ''} title="Jonli kutish (taxminiy)">
        {live.running ? '⏱ ' : ''}
        {m}:{ss} · {live.fee.toLocaleString('uz')}
      </span>
    );
  }
  if (Number(o.waitingFee ?? 0) > 0) return <>{`${o.waitingMinutes ?? 0} daq · ${Number(o.waitingFee).toLocaleString('uz')}`}</>;
  if (o.waitingMinutes) return <>{`${o.waitingMinutes} daq`}</>;
  return <span className="text-neutral-300">—</span>;
}
