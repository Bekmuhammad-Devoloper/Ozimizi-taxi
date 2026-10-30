'use client';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Phone,
  CalendarDays,
  Ban,
  ShieldCheck,
  Gift,
  Wallet,
  MapPin,
  Users,
  QrCode,
  Send,
  Receipt,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { ClientAvatar } from '@/components/ClientAvatar';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { orderStatusLabel } from '@/lib/status';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const money = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString('uz');

interface Detail {
  client: {
    id: string;
    firstName: string;
    phonePrimary: string;
    phoneSecondary: string | null;
    telegramId: string;
    avatarUrl: string | null;
    balance: string;
    refCode: string | null;
    referredBy: { id: string; firstName: string; phonePrimary: string } | null;
    isBlocked: boolean;
    blockedReason: string | null;
    cancelCount?: number;
    penaltyTotal?: string;
    createdAt: string;
  };
  stats: { total: number; completed: number; cancelled: number; spent: number; bonusUsed: number };
  invited: { id: string; firstName: string; phonePrimary: string; createdAt: string }[];
  orders: {
    id: string;
    createdAt: string;
    completedAt: string | null;
    status: string;
    price: string | null;
    bonusUsed: string | null;
    distanceKm: string | null;
    waitingSeconds: number;
    cancelPenalty: string | null;
    pickupLat: number;
    pickupLng: number;
    pickupAddress: string | null;
    destinationLat: number | null;
    destinationLng: number | null;
    destinationAddress: string | null;
    receiptNo: string | null;
    driver: { id: string; fullName: string; phone: string; carModel: string | null; carPlate: string | null } | null;
  }[];
}

const mapHref = (lat?: number | null, lng?: number | null) =>
  lat != null && lng != null ? `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}` : null;

export default function ClientDetail({ params }: { params: { id: string } }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['client', params.id],
    queryFn: async () => (await api.get<Detail>(`/admin/clients/${params.id}`)).data,
  });
  const { data: bot } = useQuery({
    queryKey: ['referral-bot'],
    queryFn: async () => (await api.get<{ username: string | null }>('/admin/referral-links/bot')).data,
    staleTime: Infinity,
  });
  const toggleBlock = useMutation({
    mutationFn: async () => {
      const c = data!.client;
      if (c.isBlocked) return (await api.post(`/admin/clients/${c.id}/unblock`)).data;
      const reason = prompt(`${c.firstName} bloklansinmi? Sabab (mijozga ko‘rsatiladi):`, '');
      if (reason === null) throw new Error('cancelled');
      return (await api.post(`/admin/clients/${c.id}/block`, { reason })).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['client', params.id] }),
    onError: () => undefined,
  });

  if (isLoading || !data) return <Shell title="Klient">Yuklanmoqda…</Shell>;
  const c = data.client;
  const s = data.stats;
  const inviteLink = bot?.username && c.refCode ? `https://t.me/${bot.username}?start=${c.refCode}` : null;

  return (
    <Shell
      title={c.firstName}
      subtitle="Klient kartasi"
      actions={
        <Link href="/clients" className="btn-secondary">
          <ArrowLeft size={16} /> Klientlar
        </Link>
      }
    >
      {/* HERO */}
      <section className="card p-5 mb-4">
        <div className="flex items-start gap-4 flex-wrap">
          <ClientAvatar name={c.firstName} avatarUrl={c.avatarUrl} size={72} />
          <div className="flex-1 min-w-[220px]">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-xl font-extrabold">{c.firstName}</h2>
              {c.isBlocked ? (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-200">
                  <Ban size={10} /> Bloklangan{c.blockedReason ? ` · ${c.blockedReason}` : ''}
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-emerald-50 text-emerald-700 border border-emerald-200">
                  <ShieldCheck size={10} /> Faol
                </span>
              )}
            </div>
            <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
              <Row icon={<Phone size={14} />} label="Telefon" value={c.phonePrimary + (c.phoneSecondary ? ` · ${c.phoneSecondary}` : '')} mono />
              <Row icon={<Send size={14} />} label="Telegram ID" value={c.telegramId} mono />
              <Row icon={<CalendarDays size={14} />} label="Ro‘yxatdan o‘tgan" value={fmtDateTime(c.createdAt)} />
              <Row
                icon={<Gift size={14} />}
                label="Kim taklif qilgan"
                value={c.referredBy ? `${c.referredBy.firstName} (${c.referredBy.phonePrimary})` : '—'}
                href={c.referredBy ? `/clients/${c.referredBy.id}` : undefined}
              />
              <Row icon={<Wallet size={14} />} label="Bonus balans" value={`${money(c.balance)} so‘m`} />
              <Row
                icon={<Ban size={14} />}
                label="Bekor qilishlar"
                value={`${c.cancelCount ?? 0} ta · jarima ${money(c.penaltyTotal)} so‘m`}
              />
            </dl>
          </div>
          <div className="flex flex-col items-end gap-2">
            <button
              onClick={() => toggleBlock.mutate()}
              className={
                'h-10 px-4 rounded-lg text-sm font-bold inline-flex items-center gap-1.5 ' +
                (c.isBlocked ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')
              }
            >
              {c.isBlocked ? <ShieldCheck size={15} /> : <Ban size={15} />}
              {c.isBlocked ? 'Blokdan chiqarish' : 'Bloklash'}
            </button>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <Stat label="Jami buyurtma" value={String(s.total)} />
        <Stat label="Bajarilgan" value={String(s.completed)} />
        <Stat label="Bekor qilingan" value={String(s.cancelled)} />
        <Stat label="Jami to‘lagan" value={`${money(s.spent)} so‘m`} />
        <Stat label="Bonusdan to‘lagan" value={`${money(s.bonusUsed)} so‘m`} />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 mb-4">
        {/* ORDERS */}
        <div className="card p-5 overflow-x-auto">
          <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
            <MapPin size={14} /> Buyurtmalar — qachon, qayerdan, qayerga
          </h3>
          {!data.orders.length ? (
            <p className="text-sm text-neutral-500">Hali buyurtma bermagan</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wider text-neutral-500">
                  <th className="py-2 pr-3">Vaqt</th>
                  <th className="py-2 pr-3">Qayerdan</th>
                  <th className="py-2 pr-3">Qayerga</th>
                  <th className="py-2 pr-3">Haydovchi</th>
                  <th className="py-2 pr-3 text-right">Narx</th>
                  <th className="py-2">Holat</th>
                </tr>
              </thead>
              <tbody>
                {data.orders.map((o) => (
                  <tr key={o.id} className="border-t border-line align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-xs text-neutral-600">
                      {fmtDateTime(o.createdAt)}
                      {o.receiptNo && (
                        <a
                          href={`${API.replace(/\/api$/, '')}/receipt/${o.id}`}
                          target="_blank"
                          rel="noreferrer"
                          className="block text-[10px] text-blue-600 inline-flex items-center gap-0.5"
                        >
                          <Receipt size={10} /> chek #{o.receiptNo}
                        </a>
                      )}
                    </td>
                    <td className="py-2 pr-3 max-w-[220px]">
                      <Place addr={o.pickupAddress} href={mapHref(o.pickupLat, o.pickupLng)} />
                    </td>
                    <td className="py-2 pr-3 max-w-[220px]">
                      <Place addr={o.destinationAddress} href={mapHref(o.destinationLat, o.destinationLng)} />
                    </td>
                    <td className="py-2 pr-3 text-xs">
                      {o.driver ? (
                        <Link href={`/drivers/${o.driver.id}`} className="text-blue-700 hover:underline">
                          {o.driver.fullName}
                          <span className="block text-neutral-500 font-mono">{o.driver.carPlate ?? o.driver.phone}</span>
                        </Link>
                      ) : (
                        <span className="text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-3 text-right tabular-nums whitespace-nowrap">
                      {o.price ? `${money(o.price)} so‘m` : '—'}
                      {Number(o.bonusUsed ?? 0) > 0 && (
                        <span className="block text-[10px] text-emerald-700">bonus −{money(o.bonusUsed)}</span>
                      )}
                      {Number(o.cancelPenalty ?? 0) > 0 && (
                        <span className="block text-[10px] text-red-600">jarima {money(o.cancelPenalty)}</span>
                      )}
                    </td>
                    <td className="py-2 text-xs whitespace-nowrap">
                      {orderStatusLabel(o.status)}
                      {o.distanceKm && <span className="block text-neutral-500">{Number(o.distanceKm).toFixed(1)} km</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* REFERRAL */}
        <div className="space-y-4">
          <div className="card p-5">
            <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
              <QrCode size={14} /> Taklif havolasi
            </h3>
            {inviteLink ? (
              <>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`${API}/public/qr.png?text=${encodeURIComponent(inviteLink)}&size=240`}
                  alt="Taklif QR"
                  className="w-40 h-40 mx-auto rounded-lg border border-line"
                />
                <p className="mt-2 text-[11px] font-mono text-blue-700 break-all text-center">{inviteLink}</p>
                <p className="mt-1 text-[11px] text-neutral-500 text-center">Kod: {c.refCode}</p>
              </>
            ) : (
              <p className="text-sm text-neutral-500">Ref kod yo‘q</p>
            )}
          </div>
          <div className="card p-5">
            <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
              <Users size={14} /> Taklif qilganlari ({data.invited.length})
            </h3>
            {!data.invited.length ? (
              <p className="text-sm text-neutral-500">Hali hech kimni taklif qilmagan</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {data.invited.map((i) => (
                  <li key={i.id} className="flex justify-between gap-2">
                    <Link href={`/clients/${i.id}`} className="text-blue-700 hover:underline truncate">
                      {i.firstName}
                    </Link>
                    <span className="text-[11px] text-neutral-500 whitespace-nowrap">{fmtDateTime(i.createdAt)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>
    </Shell>
  );
}

function Row({ icon, label, value, mono, href }: { icon: React.ReactNode; label: string; value: string; mono?: boolean; href?: string }) {
  const v = <span className={(mono ? 'font-mono ' : '') + 'font-semibold break-all'}>{value}</span>;
  return (
    <div className="flex items-start gap-2">
      <span className="text-neutral-400 mt-0.5">{icon}</span>
      <div>
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</p>
        {href ? (
          <Link href={href} className="text-blue-700 hover:underline">
            {v}
          </Link>
        ) : (
          v
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="card p-4">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-bold">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums">{value}</p>
    </div>
  );
}

function Place({ addr, href }: { addr: string | null; href: string | null }) {
  if (!addr && !href) return <span className="text-neutral-400">—</span>;
  const text = addr ?? 'Xaritada ko‘rish';
  return href ? (
    <a href={href} target="_blank" rel="noreferrer" className="text-xs text-blue-700 hover:underline inline-flex items-start gap-1">
      <MapPin size={12} className="shrink-0 mt-0.5" /> <span>{text}</span>
    </a>
  ) : (
    <span className="text-xs">{text}</span>
  );
}
