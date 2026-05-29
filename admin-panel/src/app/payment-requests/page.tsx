'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Check, X as XIcon, Clock, Inbox } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

type Status = 'PENDING' | 'APPROVED' | 'REJECTED';

interface RequestRow {
  id: string;
  driverId: string;
  amount: string;
  status: Status;
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  driver?: { fullName: string; phone: string; balance: string };
  requester?: { username: string } | null;
  driverRequester?: { fullName: string } | null;
  decider?: { username: string } | null;
}

export default function PaymentRequestsPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<Status | 'ALL'>('PENDING');

  const { data, isLoading } = useQuery({
    queryKey: ['payment-requests', filter],
    queryFn: async () => {
      const params = filter === 'ALL' ? {} : { status: filter };
      return (
        await api.get<RequestRow[]>('/admin/payment-requests', { params })
      ).data;
    },
  });

  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/payment-requests/${id}/approve`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payment-requests'] });
      qc.invalidateQueries({ queryKey: ['drivers'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });

  const reject = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/payment-requests/${id}/reject`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payment-requests'] }),
  });

  return (
    <Shell
      title="To‘lov so‘rovlari"
      subtitle="Koordinatorlardan kelgan pul tashlash/yechish so‘rovlari"
    >
      <div className="flex flex-wrap gap-1.5 mb-4">
        {(['PENDING', 'APPROVED', 'REJECTED', 'ALL'] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={
              'px-3 h-8 text-[11px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
              (filter === s
                ? 'bg-ink text-gold border-ink'
                : 'bg-white text-neutral-500 border-line hover:border-ink')
            }
          >
            {labelFor(s)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <Inbox size={28} className="mx-auto mb-2 text-neutral-300" />
          So‘rovlar yo‘q
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((r) => (
            <li
              key={r.id}
              className="card p-4 flex items-center gap-4 flex-wrap"
            >
              <StatusIcon status={r.status} />
              <div className="flex-1 min-w-[180px]">
                <p className="font-semibold">
                  {r.driver?.fullName ?? '—'}
                  <span className="ml-2 text-xs text-neutral-500 font-normal">
                    {r.driver?.phone}
                  </span>
                </p>
                <p className="text-xs text-neutral-500">
                  {new Date(r.createdAt).toLocaleString('uz', {
                    day: '2-digit',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}{' '}
                  ·{' '}
                  {r.driverRequester ? (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-gold/15 text-gold-deep font-bold uppercase tracking-wide text-[10px]">
                      🤖 Wallet bot
                    </span>
                  ) : (
                    <>
                      Koordinator: <b>{r.requester?.username ?? '—'}</b>
                    </>
                  )}
                  {r.note ? ' · ' + r.note : ''}
                </p>
                {r.decider && (
                  <p className="text-[11px] text-neutral-400 mt-0.5">
                    {r.status === 'APPROVED' ? 'Tasdiqladi' : 'Rad etdi'}:{' '}
                    {r.decider.username} ·{' '}
                    {r.decidedAt
                      ? new Date(r.decidedAt).toLocaleString('uz', {
                          day: '2-digit',
                          month: 'short',
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : ''}
                  </p>
                )}
              </div>
              <div className="text-right">
                <p
                  className={
                    'font-bold tabular-nums text-lg ' +
                    (Number(r.amount) >= 0 ? 'text-green-700' : 'text-red-700')
                  }
                >
                  {Number(r.amount) >= 0 ? '+' : ''}
                  {Number(r.amount).toLocaleString('uz')}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  so‘m
                </p>
              </div>
              {r.status === 'PENDING' && (
                <div className="flex gap-1">
                  <button
                    disabled={approve.isPending}
                    onClick={() => {
                      if (
                        confirm(
                          `${Number(r.amount).toLocaleString('uz')} so'mni tasdiqlaysizmi?`,
                        )
                      )
                        approve.mutate(r.id);
                    }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-600 text-white hover:bg-green-700"
                    title="Tasdiqlash"
                  >
                    <Check size={18} />
                  </button>
                  <button
                    disabled={reject.isPending}
                    onClick={() => {
                      if (confirm('So‘rovni rad etasizmi?')) reject.mutate(r.id);
                    }}
                    className="w-10 h-10 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100"
                    title="Rad etish"
                  >
                    <XIcon size={18} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}

function StatusIcon({ status }: { status: Status }) {
  if (status === 'APPROVED')
    return (
      <span className="w-10 h-10 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
        <Check size={20} />
      </span>
    );
  if (status === 'REJECTED')
    return (
      <span className="w-10 h-10 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
        <XIcon size={20} />
      </span>
    );
  return (
    <span className="w-10 h-10 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
      <Clock size={20} />
    </span>
  );
}

function labelFor(s: Status | 'ALL') {
  return s === 'ALL'
    ? 'Hammasi'
    : s === 'PENDING'
      ? 'Kutilmoqda'
      : s === 'APPROVED'
        ? 'Tasdiqlangan'
        : 'Rad etilgan';
}
