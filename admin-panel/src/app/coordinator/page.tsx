'use client';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Send,
  Clock,
  Check,
  X as XIcon,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Inbox,
  Wallet,
  Car as CarIcon,
  User as UserIcon,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface DriverLite {
  id: string;
  fullName: string;
  phone: string;
}

interface ClientLite {
  id: string;
  firstName: string;
  phonePrimary: string;
}

interface RequestRow {
  id: string;
  driverId: string | null;
  clientId: string | null;
  amount: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  note: string | null;
  createdAt: string;
  decidedAt: string | null;
  driver?: DriverLite | null;
  client?: { firstName: string; phonePrimary: string } | null;
  driverRequester?: { fullName: string } | null;
  clientRequester?: { firstName: string } | null;
}

type TargetType = 'driver' | 'client';

export default function CoordinatorPage() {
  const qc = useQueryClient();
  const [target, setTarget] = useState<TargetType>('driver');
  const [mode, setMode] = useState<'topup' | 'withdraw'>('topup');
  const [selectedId, setSelectedId] = useState('');
  const [query, setQuery] = useState('');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const { data: me } = useQuery({
    queryKey: ['coordinator', 'me'],
    queryFn: async () =>
      (
        await api.get<{ id: string; username: string; balance: string }>(
          '/coordinator/me',
        )
      ).data,
    refetchInterval: 15_000,
  });

  const { data: drivers } = useQuery({
    queryKey: ['coordinator', 'drivers'],
    queryFn: async () =>
      (await api.get<DriverLite[]>('/coordinator/drivers')).data,
  });

  const { data: clients } = useQuery({
    queryKey: ['coordinator', 'clients'],
    queryFn: async () =>
      (await api.get<ClientLite[]>('/coordinator/clients')).data,
  });

  const { data: requests, isLoading: reqLoading } = useQuery({
    queryKey: ['coordinator', 'requests'],
    queryFn: async () =>
      (await api.get<RequestRow[]>('/coordinator/requests')).data,
  });

  const { data: pending } = useQuery({
    queryKey: ['coordinator', 'pending'],
    queryFn: async () =>
      (await api.get<RequestRow[]>('/coordinator/pending')).data,
    refetchInterval: 15_000,
  });

  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/coordinator/pending/${id}/approve`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coordinator', 'pending'] });
    },
  });
  const reject = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/coordinator/pending/${id}/reject`)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coordinator', 'pending'] });
    },
  });

  const switchTarget = (t: TargetType) => {
    setTarget(t);
    setSelectedId('');
    setQuery('');
  };

  const submit = useMutation({
    mutationFn: async () => {
      const a = Number(amount);
      if (!selectedId)
        throw new Error(
          target === 'driver' ? 'Haydovchini tanlang' : 'Klientni tanlang',
        );
      if (!Number.isFinite(a) || a <= 0) throw new Error('Summa noto‘g‘ri');
      const signed = mode === 'topup' ? a : -a;
      const body: any = { amount: signed, note };
      if (target === 'driver') body.driverId = selectedId;
      else body.clientId = selectedId;
      // Direct transfer from coordinator's purse — no admin approval.
      // 4xx if purse balance is insufficient.
      return (await api.post('/coordinator/transfer', body)).data;
    },
    onSuccess: () => {
      setOk('✅ O‘tkazma bajarildi.');
      setAmount('');
      setNote('');
      setSelectedId('');
      setQuery('');
      qc.invalidateQueries({ queryKey: ['coordinator', 'me'] });
      qc.invalidateQueries({ queryKey: ['coordinator', 'requests'] });
      setTimeout(() => setOk(null), 3500);
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Xato');
      setTimeout(() => setErr(null), 4000);
    },
  });

  // Unified candidate list per target type, capped at 30 with name+phone
  // substring filter so the picker stays fast at 100s of rows.
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    const digits = q.replace(/\D/g, '');
    if (target === 'driver') {
      const list = drivers ?? [];
      const arr = list.map((d) => ({
        id: d.id,
        name: d.fullName,
        phone: d.phone,
      }));
      if (!q) return arr.slice(0, 30);
      return arr
        .filter(
          (x) =>
            x.name.toLowerCase().includes(q) ||
            (digits && x.phone.replace(/\D/g, '').includes(digits)),
        )
        .slice(0, 30);
    }
    const list = clients ?? [];
    const arr = list.map((c) => ({
      id: c.id,
      name: c.firstName,
      phone: c.phonePrimary,
    }));
    if (!q) return arr.slice(0, 30);
    return arr
      .filter(
        (x) =>
          x.name.toLowerCase().includes(q) ||
          (digits && x.phone.replace(/\D/g, '').includes(digits)),
      )
      .slice(0, 30);
  }, [target, drivers, clients, query]);

  const selected = useMemo(() => {
    if (!selectedId) return null;
    if (target === 'driver') {
      const d = drivers?.find((x) => x.id === selectedId);
      return d ? { name: d.fullName, phone: d.phone } : null;
    }
    const c = clients?.find((x) => x.id === selectedId);
    return c ? { name: c.firstName, phone: c.phonePrimary } : null;
  }, [target, selectedId, drivers, clients]);

  // KPI from own request history.
  const kpi = useMemo(() => {
    const list = requests ?? [];
    let pending = 0;
    let approvedAmount = 0;
    let rejected = 0;
    for (const r of list) {
      if (r.status === 'PENDING') pending++;
      else if (r.status === 'APPROVED') approvedAmount += Number(r.amount);
      else if (r.status === 'REJECTED') rejected++;
    }
    return { pending, approvedAmount, rejected, total: list.length };
  }, [requests]);

  return (
    <Shell
      title="To‘lov yuborish"
      subtitle="O‘zingizga ajratilgan hamyondan haydovchi yoki klientga to‘g‘ridan-to‘g‘ri o‘tkazish"
    >
      {/* KPI ROW */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <Kpi
          label="Mening hamyonim"
          value={`${Number(me?.balance ?? 0).toLocaleString('uz')} so‘m`}
          icon={<Wallet size={18} />}
          accent="gold"
        />
        <Kpi
          label="Jami o‘tkazma"
          value={String(kpi.total)}
          icon={<Inbox size={18} />}
        />
        <Kpi
          label="O‘tkazilgan hajm"
          value={`${kpi.approvedAmount.toLocaleString('uz')} so‘m`}
          icon={<ArrowUpRight size={18} />}
        />
        <Kpi
          label="Klient/haydovchi so‘rovlari"
          value={String(pending?.length ?? 0)}
          icon={<Clock size={18} />}
          accent={(pending?.length ?? 0) > 0 ? 'gold' : undefined}
        />
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Form */}
        <div className="card p-5 lg:col-span-1 h-fit">
          {/* Target toggle: driver vs client */}
          <div className="flex gap-2 mb-3">
            <button
              onClick={() => switchTarget('driver')}
              className={
                'flex-1 h-10 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ' +
                (target === 'driver'
                  ? 'bg-ink text-gold'
                  : 'bg-neutral-100 text-neutral-500')
              }
              type="button"
            >
              <CarIcon size={15} /> Haydovchi
            </button>
            <button
              onClick={() => switchTarget('client')}
              className={
                'flex-1 h-10 rounded-lg font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-1.5 transition-colors ' +
                (target === 'client'
                  ? 'bg-ink text-gold'
                  : 'bg-neutral-100 text-neutral-500')
              }
              type="button"
            >
              <UserIcon size={15} /> Klient
            </button>
          </div>

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

          <Field label={target === 'driver' ? 'Haydovchi' : 'Klient'}>
            {selected ? (
              <div className="flex items-center gap-2 p-2 border border-line rounded-lg bg-neutral-50">
                <span className="w-8 h-8 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
                  {target === 'driver' ? (
                    <CarIcon size={16} />
                  ) : (
                    <UserIcon size={16} />
                  )}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm truncate">
                    {selected.name}
                  </p>
                  <p className="text-xs text-neutral-500 font-mono">
                    {selected.phone}
                  </p>
                </div>
                <button
                  onClick={() => {
                    setSelectedId('');
                    setQuery('');
                  }}
                  className="text-xs text-neutral-500 px-2 py-1 hover:text-red-600"
                  type="button"
                >
                  <XIcon size={14} />
                </button>
              </div>
            ) : (
              <>
                <div className="relative">
                  <Search
                    size={14}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-neutral-400"
                  />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Ism yoki telefon…"
                    className="input pl-9"
                  />
                </div>
                {(query || candidates.length > 0) && (
                  <ul className="mt-1 max-h-56 overflow-y-auto border border-line rounded-lg divide-y divide-line">
                    {candidates.length === 0 ? (
                      <li className="p-3 text-xs text-neutral-500 text-center">
                        Topilmadi
                      </li>
                    ) : (
                      candidates.map((x) => (
                        <li key={x.id}>
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedId(x.id);
                              setQuery('');
                            }}
                            className="w-full px-3 py-2 text-left hover:bg-neutral-50 flex justify-between items-center gap-2"
                          >
                            <span className="font-medium text-sm truncate">
                              {x.name}
                            </span>
                            <span className="text-xs text-neutral-500 font-mono shrink-0">
                              {x.phone}
                            </span>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                )}
              </>
            )}
          </Field>

          <Field label="Summa (so‘m)">
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
              placeholder="0"
              inputMode="numeric"
              className="input tabular-nums text-lg font-bold"
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
            {submit.isPending ? 'Yuborilmoqda…' : 'O‘tkazish'}
          </button>
        </div>

        {/* History */}
        <div className="card p-5 lg:col-span-2">
          <h3 className="font-bold mb-3">Mening o‘tkazmalarim</h3>
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
                    <p className="font-semibold text-sm truncate flex items-center gap-1.5">
                      {r.clientId ? (
                        <UserIcon size={12} className="text-neutral-400" />
                      ) : (
                        <CarIcon size={12} className="text-neutral-400" />
                      )}
                      {r.driver?.fullName ?? r.client?.firstName ?? '—'}
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

      {/* Bot-initiated requests waiting for a verdict (driver wallet bot
          or client wallet bot self-submissions). Coordinator can approve
          or reject these directly. */}
      <section className="mt-4">
        <div className="card p-5">
          <h3 className="font-bold mb-3 flex items-center gap-2">
            <Inbox size={18} className="text-gold-deep" />
            Klient va haydovchi so‘rovlari
            {pending && pending.length > 0 && (
              <span className="ml-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-gold text-ink">
                {pending.length}
              </span>
            )}
          </h3>
          {!pending?.length ? (
            <p className="text-sm text-neutral-500">
              Yangi so‘rovlar yo‘q.
            </p>
          ) : (
            <ul className="space-y-2">
              {pending.map((r) => (
                <li
                  key={r.id}
                  className="border border-line rounded-xl p-3 flex items-center gap-3 flex-wrap"
                >
                  <span
                    className={
                      'inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide shrink-0 ' +
                      (r.clientId
                        ? 'bg-blue-50 text-blue-700'
                        : 'bg-neutral-100 text-neutral-600')
                    }
                  >
                    {r.clientId ? '👤 Klient' : '🚗 Haydovchi'}
                  </span>
                  <div className="flex-1 min-w-[150px]">
                    <p className="font-semibold text-sm truncate">
                      {r.driver?.fullName ?? r.client?.firstName ?? '—'}
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
                  <p
                    className={
                      'font-bold tabular-nums text-sm shrink-0 ' +
                      (Number(r.amount) >= 0
                        ? 'text-green-700'
                        : 'text-red-700')
                    }
                  >
                    {Number(r.amount) >= 0 ? '+' : ''}
                    {Number(r.amount).toLocaleString('uz')}
                  </p>
                  <div className="flex gap-1 shrink-0">
                    <button
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => {
                        if (
                          confirm(
                            `${Number(r.amount).toLocaleString('uz')} so'm tasdiqlansinmi?`,
                          )
                        )
                          approve.mutate(r.id);
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                      title="Tasdiqlash"
                    >
                      <Check size={16} />
                    </button>
                    <button
                      disabled={approve.isPending || reject.isPending}
                      onClick={() => {
                        if (confirm('So‘rov rad etilsinmi?'))
                          reject.mutate(r.id);
                      }}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50"
                      title="Rad etish"
                    >
                      <XIcon size={16} />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Kpi({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent?: 'gold';
}) {
  return (
    <div
      className={
        'card p-4 ' + (accent === 'gold' ? 'bg-gold/5 border-gold/30' : '')
      }
    >
      <div className="flex items-center justify-between mb-1.5">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
          {label}
        </p>
        <span className="text-neutral-400">{icon}</span>
      </div>
      <p className="text-xl font-extrabold tabular-nums leading-tight">{value}</p>
    </div>
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
