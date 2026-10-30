'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Search, Users, Ban, ShieldCheck, ChevronDown } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { ClientAvatar } from '@/components/ClientAvatar';
import { api } from '@/lib/api';
import { fmtDate, fmtDateTime } from '@/lib/format';
import { orderStatusLabel } from '@/lib/status';

interface ClientRow {
  id: string;
  first_name: string;
  phone_primary: string;
  phone_secondary: string | null;
  avatar_url: string | null;
  created_at: string;
  orders_count: string;
  last_order_at: string | null;
  total_spent: string;
  is_blocked?: boolean;
  blocked_reason?: string | null;
  cancel_count?: number;
  penalty_total?: string;
  balance?: string;
}

interface ClientOrder {
  id: string;
  createdAt: string;
  status: string;
  price: string | null;
  pickupAddress: string | null;
  destinationAddress: string | null;
  pickupLat: number;
  pickupLng: number;
  distanceKm: string | null;
}

export default function ClientsPage() {
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<ClientRow[]>('/admin/clients')).data,
  });
  const toggleBlock = useMutation({
    mutationFn: async (c: ClientRow) => {
      if (c.is_blocked) return (await api.post(`/admin/clients/${c.id}/unblock`)).data;
      const reason = prompt(`${c.first_name} bloklansinmi? Sabab (mijozga ko‘rsatiladi):`, '');
      if (reason === null) throw new Error('cancelled');
      return (await api.post(`/admin/clients/${c.id}/block`, { reason })).data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['clients'] }),
    onError: () => undefined,
  });

  const filtered = useMemo(() => {
    if (!data) return [];
    const term = q.toLowerCase().trim();
    if (!term) return data;
    return data.filter(
      (c) =>
        c.first_name.toLowerCase().includes(term) ||
        c.phone_primary.includes(term) ||
        (c.phone_secondary?.includes(term) ?? false),
    );
  }, [data, q]);

  const toggleOpen = (id: string) => setOpenId((v) => (v === id ? null : id));

  return (
    <Shell title="Klientlar" subtitle={`Jami: ${data?.length ?? 0} ta`}>
      <div className="card p-3 mb-4 flex items-center gap-2">
        <Search size={16} className="text-neutral-400 ml-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ism yoki telefon bo'yicha qidirish…"
          className="flex-1 h-10 bg-transparent outline-none text-sm"
        />
        {q && (
          <button onClick={() => setQ('')} className="text-xs text-neutral-500 px-2">
            Tozalash
          </button>
        )}
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {isLoading && <p className="text-sm text-neutral-500 text-center py-8">Yuklanmoqda…</p>}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">{q ? 'Topilmadi' : "Klient yo'q"}</p>
        )}
        {filtered.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <ClientAvatar name={c.first_name} avatarUrl={c.avatar_url} size={40} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate flex items-center gap-2">
                  <Link href={`/clients/${c.id}`} className="text-blue-700 hover:underline">
                    {c.first_name}
                  </Link>
                  {c.is_blocked && (
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-bold uppercase bg-red-50 text-red-700 border border-red-200">
                      <Ban size={9} /> Blok
                    </span>
                  )}
                </p>
                <p className="text-xs font-mono text-neutral-500">{c.phone_primary}</p>
                <p className="text-[11px] text-neutral-500">Ro‘yxatdan: {fmtDateTime(c.created_at)}</p>
              </div>
              <button
                onClick={() => toggleBlock.mutate(c)}
                className={
                  'h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1 ' +
                  (c.is_blocked ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')
                }
              >
                {c.is_blocked ? (
                  <>
                    <ShieldCheck size={14} /> Ochish
                  </>
                ) : (
                  <>
                    <Ban size={14} /> Bloklash
                  </>
                )}
              </button>
            </div>
            {(Number(c.cancel_count ?? 0) > 0 || Number(c.penalty_total ?? 0) > 0) && (
              <p className="text-[11px] text-orange-700 mb-2">
                Bekor qilgan: {c.cancel_count ?? 0} · jarima: {Number(c.penalty_total ?? 0).toLocaleString('uz')} so'm
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-line">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Buyurtma</p>
                <p className="font-bold tabular-nums">{c.orders_count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Oxirgi</p>
                <p className="text-xs font-medium">{c.last_order_at ? fmtDate(c.last_order_at) : '—'}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">Sarflagan</p>
                <p className="text-xs font-bold tabular-nums">{Number(c.total_spent ?? 0).toLocaleString('uz')}</p>
              </div>
            </div>
            <button
              onClick={() => toggleOpen(c.id)}
              className="mt-3 w-full h-9 rounded-lg bg-neutral-50 text-xs font-semibold text-neutral-700 flex items-center justify-center gap-1"
            >
              Qayerdan chaqirgan{' '}
              <ChevronDown size={14} className={openId === c.id ? 'rotate-180 transition' : 'transition'} />
            </button>
            {openId === c.id && <ClientOrders clientId={c.id} />}
          </div>
        ))}
      </div>

      <div className="card overflow-hidden hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Klient</th>
              <th className="th">Telefon</th>
              <th className="th">Ro‘yxatdan o‘tgan</th>
              <th className="th">Holat</th>
              <th className="th text-right">Buyurtma</th>
              <th className="th">Oxirgi buyurtma</th>
              <th className="th text-right">Jami sarflagan</th>
              <th className="th"></th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-neutral-500">
                  Yuklanmoqda…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-neutral-500">
                  <Users size={28} className="mx-auto text-neutral-300 mb-2" />
                  {q ? 'Qidiruvga mos klient topilmadi' : "Hozircha klient yo'q"}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <ClientTableRow
                key={c.id}
                c={c}
                open={openId === c.id}
                onToggle={() => toggleOpen(c.id)}
                onBlock={() => toggleBlock.mutate(c)}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}

function ClientTableRow({
  c,
  open,
  onToggle,
  onBlock,
}: {
  c: ClientRow;
  open: boolean;
  onToggle: () => void;
  onBlock: () => void;
}) {
  return (
    <>
      <tr className="hover:bg-neutral-50 transition-colors">
        <td className="td">
          <div className="flex items-center gap-3">
            <ClientAvatar name={c.first_name} avatarUrl={c.avatar_url} size={36} />
            <div>
              <Link href={`/clients/${c.id}`} className="font-semibold text-blue-700 hover:underline" title="To‘liq karta">
                {c.first_name}
              </Link>
              {c.phone_secondary && (
                <p className="text-[11px] font-mono text-neutral-400">{c.phone_secondary}</p>
              )}
            </div>
          </div>
        </td>
        <td className="td font-mono text-xs">{c.phone_primary}</td>
        <td className="td text-neutral-500 text-xs whitespace-nowrap">{fmtDateTime(c.created_at)}</td>
        <td className="td">
          <div className="flex items-center gap-2">
            {c.is_blocked ? (
              <span
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-red-50 text-red-700 border border-red-200"
                title={c.blocked_reason ?? ''}
              >
                <Ban size={10} /> Bloklangan
              </span>
            ) : (
              <span className="text-[11px] text-neutral-500">
                {Number(c.cancel_count ?? 0) > 0
                  ? `Bekor: ${c.cancel_count} · jarima ${Number(c.penalty_total ?? 0).toLocaleString('uz')}`
                  : 'Faol'}
              </span>
            )}
            <button
              onClick={onBlock}
              title={c.is_blocked ? 'Blokdan chiqarish' : 'Bloklash'}
              className={
                'w-8 h-8 rounded-lg flex items-center justify-center ' +
                (c.is_blocked ? 'hover:bg-emerald-50 text-emerald-700' : 'hover:bg-red-50 text-red-600')
              }
            >
              {c.is_blocked ? <ShieldCheck size={15} /> : <Ban size={15} />}
            </button>
          </div>
        </td>
        <td className="td text-right tabular-nums font-bold">{c.orders_count}</td>
        <td className="td text-neutral-500 text-xs">
          {c.last_order_at ? fmtDateTime(c.last_order_at) : <span className="text-neutral-300">—</span>}
        </td>
        <td className="td text-right tabular-nums font-bold">
          {Number(c.total_spent ?? 0).toLocaleString('uz')}
          <span className="text-[10px] text-neutral-500 ml-1 font-normal">so'm</span>
        </td>
        <td className="td">
          <button
            onClick={onToggle}
            title="Qayerdan chaqirgan"
            className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 text-neutral-600"
          >
            <ChevronDown size={16} className={open ? 'rotate-180 transition' : 'transition'} />
          </button>
        </td>
      </tr>
      {open && (
        <tr>
          <td colSpan={8} className="bg-neutral-50/60 px-4 py-3">
            <ClientOrders clientId={c.id} />
          </td>
        </tr>
      )}
    </>
  );
}

/** Where (and when) this client ordered from — last 15 rides. */
function ClientOrders({ clientId }: { clientId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['client-orders', clientId],
    queryFn: async () => (await api.get<ClientOrder[]>(`/admin/clients/${clientId}/orders`)).data,
  });
  if (isLoading) return <p className="text-xs text-neutral-500 py-2">Yuklanmoqda…</p>;
  if (!data?.length) return <p className="text-xs text-neutral-500 py-2">Hali buyurtma bermagan</p>;
  const place = (addr: string | null, lat?: number, lng?: number) =>
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
    <ul className="divide-y divide-line text-xs">
      {data.slice(0, 15).map((o) => (
        <li key={o.id} className="py-2 flex flex-wrap items-start gap-x-4 gap-y-1">
          <span className="text-neutral-500 w-[88px] shrink-0">{fmtDateTime(o.createdAt)}</span>
          <span className="flex-1 min-w-[200px]">
            <span className="text-neutral-400 mr-1">A</span>
            {place(o.pickupAddress, o.pickupLat, o.pickupLng)}
            {(o.destinationAddress || o.status === 'COMPLETED') && (
              <>
                <span className="text-neutral-400 mx-1">→</span>
                {place(o.destinationAddress)}
              </>
            )}
          </span>
          <span className="tabular-nums font-semibold w-[80px] text-right">
            {o.price ? Number(o.price).toLocaleString('uz') : '—'}
          </span>
          <span className="text-neutral-500 w-[90px]">{orderStatusLabel(o.status as any)}</span>
        </li>
      ))}
    </ul>
  );
}
