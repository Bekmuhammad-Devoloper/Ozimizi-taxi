'use client';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface ClientRow {
  id: string;
  first_name: string;
  phone_primary: string;
  phone_secondary: string | null;
  orders_count: string;
  last_order_at: string | null;
  total_spent: string;
}

export default function ClientsPage() {
  const [q, setQ] = useState('');
  const { data, isLoading } = useQuery({
    queryKey: ['clients'],
    queryFn: async () => (await api.get<ClientRow[]>('/admin/clients')).data,
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

  return (
    <Shell
      title="Klientlar"
      subtitle={`Jami: ${data?.length ?? 0} ta`}
    >
      <div className="card p-3 mb-4 flex items-center gap-2">
        <Search size={16} className="text-neutral-400 ml-2" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Ism yoki telefon bo'yicha qidirish…"
          className="flex-1 h-10 bg-transparent outline-none text-sm"
        />
        {q && (
          <button
            onClick={() => setQ('')}
            className="text-xs text-neutral-500 px-2"
          >
            Tozalash
          </button>
        )}
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {isLoading && (
          <p className="text-sm text-neutral-500 text-center py-8">Yuklanmoqda…</p>
        )}
        {!isLoading && filtered.length === 0 && (
          <p className="text-sm text-neutral-500 text-center py-8">
            {q ? 'Topilmadi' : 'Klient yo\'q'}
          </p>
        )}
        {filtered.map((c) => (
          <div key={c.id} className="card p-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold shrink-0">
                {c.first_name?.[0]?.toUpperCase() ?? '?'}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold truncate">{c.first_name}</p>
                <p className="text-xs font-mono text-neutral-500">
                  {c.phone_primary}
                </p>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center pt-3 border-t border-line">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Buyurtma
                </p>
                <p className="font-bold tabular-nums">{c.orders_count}</p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Oxirgi
                </p>
                <p className="text-xs font-medium">
                  {c.last_order_at
                    ? new Date(c.last_order_at).toLocaleDateString('uz', {
                        day: '2-digit',
                        month: 'short',
                      })
                    : '—'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Sarflagan
                </p>
                <p className="text-xs font-bold tabular-nums">
                  {Number(c.total_spent ?? 0).toLocaleString('uz')}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="card overflow-hidden hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Klient</th>
              <th className="th">Telefon</th>
              <th className="th">Qo'shimcha</th>
              <th className="th text-right">Buyurtma</th>
              <th className="th">Oxirgi buyurtma</th>
              <th className="th text-right">Jami sarflagan</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-neutral-500">
                  Yuklanmoqda…
                </td>
              </tr>
            )}
            {!isLoading && filtered.length === 0 && (
              <tr>
                <td colSpan={6} className="p-10 text-center text-neutral-500">
                  <Users size={28} className="mx-auto text-neutral-300 mb-2" />
                  {q ? 'Qidiruvga mos klient topilmadi' : 'Hozircha klient yo\'q'}
                </td>
              </tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-neutral-50 transition-colors">
                <td className="td">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold text-sm">
                      {c.first_name?.[0]?.toUpperCase() ?? '?'}
                    </div>
                    <span className="font-semibold">{c.first_name}</span>
                  </div>
                </td>
                <td className="td font-mono text-xs">{c.phone_primary}</td>
                <td className="td text-neutral-500 font-mono text-xs">
                  {c.phone_secondary ?? <span className="text-neutral-300">—</span>}
                </td>
                <td className="td text-right tabular-nums font-bold">
                  {c.orders_count}
                </td>
                <td className="td text-neutral-500 text-xs">
                  {c.last_order_at
                    ? new Date(c.last_order_at).toLocaleString('uz', {
                        day: '2-digit',
                        month: 'short',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : <span className="text-neutral-300">—</span>}
                </td>
                <td className="td text-right tabular-nums font-bold">
                  {Number(c.total_spent ?? 0).toLocaleString('uz')}
                  <span className="text-[10px] text-neutral-500 ml-1 font-normal">
                    so'm
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Shell>
  );
}
