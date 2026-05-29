'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Filter,
  ChevronLeft,
  ChevronRight,
  Search,
  Flag,
  X as XIcon,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface OrderRow {
  id: string;
  createdAt: string;
  status: string;
  distanceKm: string | null;
  price: string | null;
  commission: string;
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
  });

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
      'distanceKm',
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
        o.distanceKm ?? '',
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
                {s.replace(/_/g, ' ')}
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
                {new Date(o.createdAt).toLocaleString('uz', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
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
            </div>
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
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr>
                <th className="th">Sana</th>
                <th className="th">Klient</th>
                <th className="th">Haydovchi</th>
                <th className="th">Pickup</th>
                <th className="th text-right">Km</th>
                <th className="th text-right">Narx</th>
                <th className="th text-right">Komissiya</th>
                <th className="th">Status</th>
                <th className="th text-right">Amallar</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-neutral-500">
                    Yuklanmoqda…
                  </td>
                </tr>
              )}
              {!isLoading && (!data?.items || data.items.length === 0) && (
                <tr>
                  <td colSpan={9} className="p-10 text-center text-neutral-500">
                    Filterga mos buyurtma topilmadi
                  </td>
                </tr>
              )}
              {data?.items?.map((o: OrderRow) => (
                <tr
                  key={o.id}
                  className="hover:bg-neutral-50 transition-colors"
                >
                  <td className="td text-xs text-neutral-500 whitespace-nowrap">
                    {new Date(o.createdAt).toLocaleString('uz', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
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
                  <td className="td text-neutral-600 max-w-[220px] truncate">
                    {o.pickupAddress ?? (
                      <span className="text-neutral-300">—</span>
                    )}
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
                  <td className="td">
                    <StatusBadge status={o.status} />
                  </td>
                  <td className="td">
                    <div className="flex gap-1 justify-end">
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
      {status.replace(/_/g, ' ')}
    </span>
  );
}
