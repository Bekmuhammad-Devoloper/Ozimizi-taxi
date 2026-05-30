'use client';
import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Phone,
  Mail,
  CalendarDays,
  Car as CarIcon,
  MapPin,
  Wallet,
  ShieldCheck,
  ShieldAlert,
  Ban,
  CheckCircle2,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { DriverAvatar } from '@/components/DriverAvatar';
import { api } from '@/lib/api';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function resolveUrl(raw?: string | null): string {
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
}

export default function DriverDetail({ params }: { params: { id: string } }) {
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['driver', params.id],
    queryFn: async () =>
      (await api.get(`/admin/drivers/${params.id}`)).data,
  });

  const { data: orders } = useQuery({
    queryKey: ['driver-orders', params.id],
    queryFn: async () =>
      (
        await api.get('/admin/orders', {
          params: { driverId: params.id, pageSize: 100 },
        })
      ).data,
  });

  const approve = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/drivers/${params.id}/approve`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', params.id] }),
  });
  const reject = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/drivers/${params.id}/reject`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', params.id] }),
  });
  const block = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/drivers/${params.id}/block`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', params.id] }),
  });
  const unblock = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/drivers/${params.id}/unblock`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['driver', params.id] }),
  });

  const stats = useMemo(() => {
    const items = orders?.items ?? [];
    let completed = 0;
    let cancelled = 0;
    let earnings = 0;
    let commission = 0;
    let kmTotal = 0;
    for (const o of items) {
      if (o.status === 'COMPLETED') {
        completed++;
        earnings += Number(o.price ?? 0);
        commission += Number(o.commission ?? 0);
        kmTotal += Number(o.distanceKm ?? 0);
      } else if (o.status === 'CANCELLED') {
        cancelled++;
      }
    }
    return { completed, cancelled, earnings, commission, kmTotal };
  }, [orders]);

  if (isLoading || !data)
    return <Shell title="Haydovchi">Yuklanmoqda...</Shell>;

  const d = data.driver;
  const txs: any[] = data.transactions ?? [];

  return (
    <Shell title={d.fullName}>
      {/* HERO */}
      <section className="card p-5 mb-4">
        <div className="flex items-start gap-4 flex-wrap">
          <DriverAvatar
            fullName={d.fullName}
            avatarUrl={d.avatarUrl}
            size={88}
            className="ring-2 ring-gold/40"
          />
          <div className="flex-1 min-w-0">
            <h2 className="text-2xl font-extrabold tracking-tight">
              {d.fullName}
            </h2>
            <p className="text-sm text-neutral-500 font-mono mt-0.5">
              {d.phone}
            </p>
            <div className="flex items-center gap-1.5 flex-wrap mt-3">
              <Badge
                tone={d.isOnline ? 'green' : 'gray'}
                dot={d.isOnline}
                pulse={d.isOnline}
              >
                {d.isOnline ? 'Online' : 'Offline'}
              </Badge>
              {!d.isActive && (
                <Badge tone="red" icon={<Ban size={11} />}>
                  Bloklangan
                </Badge>
              )}
              {!d.isApproved && (
                <Badge tone="orange" icon={<ShieldAlert size={11} />}>
                  Tasdiq kerak
                </Badge>
              )}
              {d.isApproved && d.isActive && (
                <Badge tone="emerald" icon={<ShieldCheck size={11} />}>
                  Tasdiqlangan
                </Badge>
              )}
              {d.walletTelegramId && (
                <Badge tone="blue" icon={<MessageSquare size={11} />}>
                  Wallet bot ulangan
                </Badge>
              )}
            </div>
          </div>

          <div className="flex gap-1.5 flex-wrap justify-end">
            {!d.isApproved ? (
              <button
                onClick={() => approve.mutate()}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white text-xs font-bold"
              >
                <CheckCircle2 size={14} /> Tasdiqlash
              </button>
            ) : (
              <button
                onClick={() => {
                  if (confirm(`${d.fullName} tasdig'i bekor qilinsinmi?`))
                    reject.mutate();
                }}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold"
              >
                <XCircle size={14} /> Tasdiqni olib tashlash
              </button>
            )}
            {d.isActive ? (
              <button
                onClick={() => {
                  if (confirm(`${d.fullName} bloklansinmi?`))
                    block.mutate();
                }}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold"
              >
                <Ban size={14} /> Bloklash
              </button>
            ) : (
              <button
                onClick={() => unblock.mutate()}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs font-bold"
              >
                <ShieldCheck size={14} /> Blokdan chiqarish
              </button>
            )}
          </div>
        </div>
      </section>

      {/* KPI ROW */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <KpiCard
          label="Joriy balans"
          value={`${Number(d.balance).toLocaleString('uz')} so'm`}
          accent="gold"
          icon={<Wallet size={18} />}
        />
        <KpiCard
          label="Yakunlangan"
          value={String(stats.completed)}
          icon={<CheckCircle2 size={18} />}
        />
        <KpiCard
          label="Bekor qilingan"
          value={String(stats.cancelled)}
          icon={<XCircle size={18} />}
        />
        <KpiCard
          label="Jami daromad"
          value={`${stats.earnings.toLocaleString('uz')} so'm`}
          icon={<Wallet size={18} />}
        />
      </section>

      {/* PROFILE INFO */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-4">
        <div className="card p-5">
          <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3">
            Shaxsiy ma'lumotlar
          </h3>
          <dl className="space-y-3">
            <InfoRow
              icon={<Phone size={16} />}
              label="Telefon"
              value={d.phone}
              mono
            />
            <InfoRow
              icon={<Mail size={16} />}
              label="Email"
              value={d.email || '—'}
            />
            <InfoRow
              icon={<CalendarDays size={16} />}
              label="Ro'yxatdan o'tgan"
              value={new Date(d.createdAt).toLocaleString('uz', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            />
            <InfoRow
              icon={<MapPin size={16} />}
              label="Oxirgi lokatsiya"
              value={
                d.currentLat != null && d.currentLng != null
                  ? `${Number(d.currentLat).toFixed(5)}, ${Number(
                      d.currentLng,
                    ).toFixed(5)}`
                  : '—'
              }
              mono
            />
          </dl>
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3">
            Avtomobil
          </h3>
          {d.carModel || d.carPlate || d.carPhotoUrl ? (
            <>
              <dl className="space-y-3 mb-3">
                <InfoRow
                  icon={<CarIcon size={16} />}
                  label="Model"
                  value={d.carModel || '—'}
                />
                <InfoRow
                  icon={
                    <span
                      className="w-4 h-4 rounded-full border border-line"
                      style={{ background: cssColor(d.carColor) }}
                    />
                  }
                  label="Rangi"
                  value={d.carColor || '—'}
                />
                <InfoRow
                  icon={
                    <span className="text-[10px] font-bold text-neutral-500">
                      ID
                    </span>
                  }
                  label="Davlat raqami"
                  value={d.carPlate || '—'}
                  mono
                />
              </dl>
              {d.carPhotoUrl && (
                <img
                  src={resolveUrl(d.carPhotoUrl)}
                  alt={d.carModel ?? 'Avtomobil'}
                  className="w-full aspect-video object-cover rounded-xl border border-line"
                />
              )}
            </>
          ) : (
            <p className="text-sm text-neutral-500">
              Avtomobil ma'lumotlari kiritilmagan.
            </p>
          )}
        </div>
      </section>

      {/* ORDERS + TX */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="card p-5">
          <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3">
            So'nggi buyurtmalar
          </h3>
          {!orders?.items?.length ? (
            <p className="text-sm text-neutral-500">Buyurtmalar yo'q</p>
          ) : (
            <ul className="space-y-2">
              {orders.items.slice(0, 20).map((o: any) => (
                <li
                  key={o.id}
                  className="border-b border-line pb-2 last:border-0 text-sm"
                >
                  <div className="flex justify-between items-center">
                    <span className="text-xs text-neutral-500">
                      {new Date(o.createdAt).toLocaleString('uz', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <StatusPill status={o.status} />
                  </div>
                  <div className="flex justify-between text-neutral-600 mt-0.5">
                    <span className="tabular-nums">
                      {o.distanceKm ? Number(o.distanceKm).toFixed(2) : '-'} km
                    </span>
                    <span className="font-bold tabular-nums">
                      {o.price
                        ? Number(o.price).toLocaleString('uz') + " so'm"
                        : '-'}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card p-5">
          <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3">
            Tranzaksiyalar
          </h3>
          {!txs.length ? (
            <p className="text-sm text-neutral-500">Tranzaksiyalar yo'q</p>
          ) : (
            <ul className="space-y-2">
              {txs.map((t) => {
                const amt = Number(t.amount);
                return (
                  <li
                    key={t.id}
                    className="border-b border-line pb-2 last:border-0 flex justify-between text-sm"
                  >
                    <span className="text-xs text-neutral-500">
                      {new Date(t.createdAt).toLocaleString('uz', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      ·{' '}
                      <span className="uppercase tracking-wider font-bold">
                        {t.type}
                      </span>
                    </span>
                    <span
                      className={
                        'font-bold tabular-nums ' +
                        (amt >= 0 ? 'text-green-700' : 'text-red-700')
                      }
                    >
                      {amt >= 0 ? '+' : ''}
                      {amt.toLocaleString('uz')}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </Shell>
  );
}

function Badge({
  children,
  tone,
  icon,
  dot,
  pulse,
}: {
  children: React.ReactNode;
  tone: 'green' | 'red' | 'orange' | 'gray' | 'emerald' | 'blue';
  icon?: React.ReactNode;
  dot?: boolean;
  pulse?: boolean;
}) {
  const tones: Record<string, string> = {
    green: 'bg-green-50 text-green-700 border-green-200',
    red: 'bg-red-50 text-red-700 border-red-200',
    orange: 'bg-orange-50 text-orange-700 border-orange-200',
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    blue: 'bg-blue-50 text-blue-700 border-blue-200',
    gray: 'bg-neutral-100 text-neutral-500 border-neutral-200',
  };
  return (
    <span
      className={
        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ' +
        tones[tone]
      }
    >
      {dot && (
        <span
          className={
            'w-1.5 h-1.5 rounded-full ' +
            (tone === 'green' ? 'bg-green-500 ' : 'bg-neutral-400 ') +
            (pulse ? 'animate-pulse' : '')
          }
        />
      )}
      {icon}
      {children}
    </span>
  );
}

function KpiCard({
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
      <p className="text-xl font-extrabold tabular-nums leading-tight">
        {value}
      </p>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="text-neutral-400 mt-0.5 shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
          {label}
        </p>
        <p
          className={
            'text-sm font-semibold mt-0.5 break-all ' + (mono ? 'font-mono' : '')
          }
        >
          {value}
        </p>
      </div>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const tone =
    status === 'COMPLETED'
      ? 'bg-green-50 text-green-700'
      : status === 'CANCELLED'
        ? 'bg-red-50 text-red-700'
        : 'bg-neutral-100 text-neutral-600';
  return (
    <span
      className={
        'inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ' +
        tone
      }
    >
      {status}
    </span>
  );
}

/** Map common Uzbek color names to a CSS color for the swatch. */
function cssColor(name?: string | null): string {
  if (!name) return '#e5e5e5';
  const map: Record<string, string> = {
    oq: '#ffffff',
    qora: '#111111',
    kulrang: '#9ca3af',
    qizil: '#dc2626',
    'ko‘k': '#2563eb',
    kok: '#2563eb',
    yashil: '#16a34a',
    sariq: '#facc15',
    jigarrang: '#78350f',
    kumush: '#d1d5db',
  };
  const key = name.trim().toLowerCase();
  return map[key] ?? '#e5e5e5';
}
