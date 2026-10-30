'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck, ShieldAlert, ChevronDown } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface Integrity {
  treasury: number;
  coordinators: number;
  drivers: number;
  driversDeleted: number;
  clients: number;
  pending: number;
  total: number;
  expected: number;
  diff: number;
  ok: boolean;
}
interface LedgerEvent {
  id: string;
  kind: string;
  amount: string;
  treasuryAfter: string | null;
  coordAfter: string | null;
  note: string | null;
  createdAt: string;
  driverName: string | null;
  clientName: string | null;
  coordName: string | null;
}

const fmt = (n: number | string) => Number(n).toLocaleString('uz');

const KIND: Record<string, string> = {
  driver_adjust: 'Haydovchi balansi',
  client_adjust: 'Klient balansi',
  driver_drain: 'Haydovchi o‘chirildi',
  coord_allocate: 'Koordinatorga ajratildi',
  coord_transfer: 'Koordinator o‘tkazmasi',
  bonus_to_driver: 'Mijoz bonusi → haydovchi',
  reconcile: 'Qo‘lda tuzatish',
};

/** 100M closed-loop check + the treasury journal (dashboard). */
export function LedgerCard() {
  const [open, setOpen] = useState(false);
  const qc = useQueryClient();
  const fix = useMutation({
    mutationFn: async (diff: number) => {
      const amount = -diff;
      const note = prompt(
        `Xazinaga ${amount > 0 ? '+' : ''}${fmt(amount)} so‘m tuzatish kiritiladi. Sabab (jurnalga yoziladi):`,
        'Eski xatolik tufayli yo‘qolgan summa qaytarildi',
      );
      if (note === null) throw new Error('cancelled');
      return (await api.post('/admin/ledger/reconcile', { amount, note })).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['ledger'] }),
    onError: () => undefined,
  });
  const { data } = useQuery({
    queryKey: ['ledger'],
    queryFn: async () =>
      (await api.get<{ integrity: Integrity; events: LedgerEvent[] }>('/admin/ledger')).data,
    refetchInterval: 60_000,
  });
  const i = data?.integrity;
  if (!i) return null;
  return (
    <div className={'card p-5 mb-6 border ' + (i.ok ? 'border-emerald-200' : 'border-red-300')}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <span
            className={
              'w-10 h-10 rounded-xl flex items-center justify-center ' +
              (i.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
            }
          >
            {i.ok ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
          </span>
          <div>
            <h3 className="font-bold">Pul aylanmasi (yopiq tizim)</h3>
            <p className={'text-sm ' + (i.ok ? 'text-emerald-700' : 'text-red-700 font-semibold')}>
              {i.ok
                ? `Jami ${fmt(i.total)} so‘m = ${fmt(i.expected)} ✓ balans to‘g‘ri`
                : `Jami ${fmt(i.total)} so‘m — farq ${i.diff > 0 ? '+' : ''}${fmt(i.diff)} so‘m!`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!i.ok && (
            <button
              onClick={() => fix.mutate(i.diff)}
              disabled={fix.isPending}
              className="text-xs font-bold h-9 px-3 rounded-lg bg-red-600 text-white hover:bg-red-700 disabled:opacity-50"
              title="Farqni xazina orqali tuzatish (jurnalga yoziladi)"
            >
              Farqni tuzatish ({i.diff < 0 ? '+' : '−'}{fmt(Math.abs(i.diff))})
            </button>
          )}
          <button
            onClick={() => setOpen((v) => !v)}
            className="text-xs font-semibold text-neutral-600 flex items-center gap-1 h-9 px-3 rounded-lg hover:bg-neutral-100"
          >
            Xazina jurnali <ChevronDown size={14} className={open ? 'rotate-180 transition' : 'transition'} />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-4 text-xs">
        {[
          ['Xazina', i.treasury],
          ['Koordinatorlar', i.coordinators],
          ['Haydovchilar', i.drivers + i.driversDeleted],
          ['Klientlar', i.clients],
          ['Kutilayotgan so‘rov', i.pending],
        ].map(([k, v]) => (
          <div key={k as string} className="rounded-lg bg-neutral-50 px-3 py-2">
            <p className="text-neutral-500">{k}</p>
            <p className="font-bold tabular-nums">{fmt(v as number)}</p>
          </div>
        ))}
      </div>
      {open && (
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left text-neutral-500">
                <th className="py-1.5 pr-2">Vaqt</th>
                <th className="py-1.5 pr-2">Harakat</th>
                <th className="py-1.5 pr-2">Kim</th>
                <th className="py-1.5 pr-2 text-right">Xazina ±</th>
                <th className="py-1.5 pr-2 text-right">Xazina keyin</th>
                <th className="py-1.5">Izoh</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(data?.events ?? []).map((e) => (
                <tr key={e.id}>
                  <td className="py-1.5 pr-2 whitespace-nowrap text-neutral-500">{fmtDateTime(e.createdAt)}</td>
                  <td className="py-1.5 pr-2 whitespace-nowrap">{KIND[e.kind] ?? e.kind}</td>
                  <td className="py-1.5 pr-2">{e.driverName ?? e.clientName ?? e.coordName ?? '—'}</td>
                  <td
                    className={
                      'py-1.5 pr-2 text-right tabular-nums font-semibold ' +
                      (Number(e.amount) < 0 ? 'text-red-600' : Number(e.amount) > 0 ? 'text-emerald-700' : 'text-neutral-500')
                    }
                  >
                    {e.kind === 'bonus_to_driver' || e.kind === 'coord_transfer'
                      ? '—'
                      : (Number(e.amount) > 0 ? '+' : '') + fmt(e.amount)}
                  </td>
                  <td className="py-1.5 pr-2 text-right tabular-nums">
                    {e.treasuryAfter != null
                      ? fmt(e.treasuryAfter)
                      : e.coordAfter != null
                        ? `hamyon ${fmt(e.coordAfter)}`
                        : '—'}
                  </td>
                  <td className="py-1.5 text-neutral-600 max-w-[260px] truncate" title={e.note ?? ''}>
                    {e.note ?? ''}
                  </td>
                </tr>
              ))}
              {!data?.events?.length && (
                <tr>
                  <td colSpan={6} className="py-4 text-center text-neutral-500">
                    Hali yozuv yo‘q
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
