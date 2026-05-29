'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send, Clock, Check, X as XIcon, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface DriverLite {
  id: string;
  fullName: string;
  phone: string;
}

interface RequestRow {
  id: string;
  driverId: string;
  amount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  driver?: DriverLite;
}

export default function CoordinatorPage() {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'topup' | 'withdraw'>('topup');
  const [driverId, setDriverId] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const { data: drivers } = useQuery({
    queryKey: ['coordinator', 'drivers'],
    queryFn: async () =>
      (await api.get<DriverLite[]>('/coordinator/drivers')).data,
  });

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['coordinator', 'requests'],
    queryFn: async () =>
      (await api.get<RequestRow[]>('/coordinator/requests')).data,
  });

  const submit = useMutation({
    mutationFn: async () => {
      const a = Number(amount);
      if (!driverId) throw new Error('Haydovchini tanlang');
      if (!Number.isFinite(a) || a <= 0) throw new Error('Summa noto‘g‘ri');
      const signed = mode === 'topup' ? a : -a;
      return (
        await api.post('/coordinator/requests', {
          driverId,
          amount: signed,
          note,
        })
      ).data;
    },
    onSuccess: () => {
      setOk('So‘rov yuborildi. Admin tasdig‘ini kuting.');
      setAmount('');
      setNote('');
      qc.invalidateQueries({ queryKey: ['coordinator', 'requests'] });
      setTimeout(() => setOk(null), 3500);
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Xato');
      setTimeout(() => setErr(null), 4000);
    },
  });

  const driverOptions = useMemo(() => drivers ?? [], [drivers]);

  return (
    <Shell
      title="To‘lov yuborish"
      subtitle="Haydovchiga pul tashlash yoki yechish — admin tasdig‘i bilan amalga oshadi"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form */}
        <div className="card p-5 lg:col-span-1 h-fit">
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setMode('topup')}
              className={
                'flex-1 h-10 rounded-lg font-bold text-sm flex items-center justify-center gap-1 ' +
                (mode === 'topup'
                  ? 'bg-green-600 text-white'
                  : 'bg-neutral-100 text-neutral-500')
              }
            >
              <ArrowUpRight size={16} /> Pul tashlash
            </button>
            <button
              onClick={() => setMode('withdraw')}
              className={
                'flex-1 h-10 rounded-lg font-bold text-sm flex items-center justify-center gap-1 ' +
                (mode === 'withdraw'
                  ? 'bg-red-600 text-white'
                  : 'bg-neutral-100 text-neutral-500')
              }
            >
              <ArrowDownRight size={16} /> Yechish
            </button>
          </div>

          <Field label="Haydovchi">
            <select
              value={driverId}
              onChange={(e) => setDriverId(e.target.value)}
              className="input"
            >
              <option value="">— Tanlang —</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.fullName} · {d.phone}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Summa (so‘m)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              className="input"
            />
          </Field>

          <Field label="Izoh (ixtiyoriy)">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: 12-aprel naqd"
              className="input"
            />
          </Field>

          {err && <p className="text-sm text-red-600 mb-2">{err}</p>}
          {ok && <p className="text-sm text-green-700 mb-2">{ok}</p>}

          <button
            onClick={() => submit.mutate()}
            disabled={submit.isPending}
            className="w-full h-11 bg-ink text-gold rounded-lg font-bold flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Send size={16} />{' '}
            {submit.isPending ? 'Yuborilmoqda…' : 'So‘rovni yuborish'}
          </button>
        </div>

        {/* History */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-bold mb-3">Mening so‘rovlarim</h3>
          {reqLoading ? (
            <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
          ) : !requests?.length ? (
            <p className="text-sm text-neutral-500">Hozircha so‘rov yo‘q.</p>
          ) : (
            <ul className="space-y-2">
              {requests.map((r) => (
                <li
                  key={r.id}
                  className="border border-line rounded-xl p-3 flex items-center gap-3"
                >
                  <StatusIcon status={r.status} />
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm truncate">
                      {r.driver?.fullName ?? '—'}
                    </p>
                    <p className="text-xs text-neutral-500">
                      {new Date(r.createdAt).toLocaleString('uz', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                      {r.note ? ' · ' + r.note : ''}
                    </p>
                  </div>
                  <div className="text-right">
                    <p
                      className={
                        'font-bold tabular-nums text-sm ' +
                        (Number(r.amount) >= 0 ? 'text-green-700' : 'text-red-700')
                      }
                    >
                      {Number(r.amount) >= 0 ? '+' : ''}
                      {Number(r.amount).toLocaleString('uz')}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                      {labelFor(r.status)}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}

function StatusIcon({ status }: { status: RequestRow['status'] }) {
  if (status === 'APPROVED')
    return (
      <span className="w-9 h-9 rounded-full bg-green-50 text-green-700 flex items-center justify-center shrink-0">
        <Check size={18} />
      </span>
    );
  if (status === 'REJECTED')
    return (
      <span className="w-9 h-9 rounded-full bg-red-50 text-red-600 flex items-center justify-center shrink-0">
        <XIcon size={18} />
      </span>
    );
  return (
    <span className="w-9 h-9 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
      <Clock size={18} />
    </span>
  );
}

function labelFor(s: RequestRow['status']) {
  return s === 'APPROVED' ? 'Tasdiqlandi' : s === 'REJECTED' ? 'Rad etildi' : 'Kutilmoqda';
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
