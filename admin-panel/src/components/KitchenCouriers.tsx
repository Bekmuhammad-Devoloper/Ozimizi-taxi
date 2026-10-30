'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bike, CarFront, Loader2, Phone, Plus, Trash2, Users } from 'lucide-react';
import { api } from '@/lib/api';
import { apiError, type KitchenCourier } from '@/lib/food';

/**
 * The kitchen's own couriers. `base` = `/admin/food/kitchens/<id>` (admin)
 * or `/kitchen` (kitchen panel). New orders ring these first.
 */
export function KitchenCouriersCard({
  base,
  linkDrivers = false,
  className = '',
}: {
  base: string;
  /** Admin only: names link to /drivers/<id>. */
  linkDrivers?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const key = ['kitchen-couriers', base];
  const { data, isLoading, isError, error } = useQuery({
    queryKey: key,
    queryFn: async () => (await api.get<KitchenCourier[]>(`${base}/couriers`)).data,
    refetchInterval: 30_000,
  });
  const [phone, setPhone] = useState('+998');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const add = useMutation({
    mutationFn: async () => {
      const digits = phone.replace(/\D/g, '');
      if (digits.length < 9) throw new Error('Telefon raqamni to‘liq kiriting');
      return (await api.post<KitchenCourier[]>(`${base}/couriers`, { phone: phone.trim() })).data;
    },
    onSuccess: (list) => {
      qc.setQueryData(key, list);
      setPhone('+998');
      setMsg({ ok: true, text: 'Qo‘shildi' });
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e) => setMsg({ ok: false, text: apiError(e) }),
  });

  const remove = useMutation({
    mutationFn: async (driverId: string) =>
      (await api.delete<KitchenCourier[]>(`${base}/couriers/${driverId}`)).data,
    onSuccess: (list) => qc.setQueryData(key, list),
    onError: (e) => alert(apiError(e)),
  });

  const list = data ?? [];
  const online = list.filter((c) => c.isOnline).length;

  return (
    <section className={'card p-4 sm:p-5 ' + className}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-violet-50 text-violet-700 flex items-center justify-center shrink-0">
          <Users size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold">
            O‘z kuryerlari
            {list.length > 0 && (
              <span className="ml-2 text-xs font-medium text-neutral-500">
                {list.length} ta · {online} ta liniyada
              </span>
            )}
          </p>
          <p className="text-xs text-neutral-500">
            Buyurtma avval shu kuryerlarga boradi, olmasa hammaga tushadi.
          </p>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          add.mutate();
        }}
        className="flex gap-2 mb-1"
      >
        <input
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          inputMode="tel"
          placeholder="+998901234567"
          className="input font-mono"
        />
        <button type="submit" disabled={add.isPending} className="btn-primary shrink-0">
          {add.isPending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />} Qo‘shish
        </button>
      </form>
      <p className="text-[11px] text-neutral-500 mb-2">
        Kuryer yoki haydovchi Moviy Taxi’da ro‘yxatdan o‘tgan bo‘lishi kerak — uning telefon raqamini kiriting.
      </p>
      {msg && <p className={'text-xs mb-2 ' + (msg.ok ? 'text-emerald-700' : 'text-red-600')}>{msg.text}</p>}

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">Ro‘yxatni yuklab bo‘lmadi: {apiError(error)}</p>
      ) : !list.length ? (
        <p className="text-xs text-neutral-500 py-3 text-center border border-dashed border-line rounded-xl">
          Hali o‘z kuryeri yo‘q — buyurtmalar to‘g‘ridan-to‘g‘ri hamma kuryerlarga boradi.
        </p>
      ) : (
        <ul className="divide-y divide-line border border-line rounded-xl">
          {list.map((c) => (
            <li key={c.driverId} className="px-3 py-2.5 flex items-center gap-3">
              <span
                className={
                  'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ' +
                  (c.kind === 'courier' ? 'bg-violet-50 text-violet-700' : 'bg-gold/15 text-gold-deep')
                }
              >
                {c.kind === 'courier' ? <Bike size={15} /> : <CarFront size={15} />}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold flex items-center gap-1.5 min-w-0">
                  <span
                    title={c.isOnline ? 'Liniyada' : 'Liniyada emas'}
                    className={'w-2 h-2 rounded-full shrink-0 ' + (c.isOnline ? 'bg-emerald-500' : 'bg-neutral-300')}
                  />
                  {linkDrivers ? (
                    <Link href={`/drivers/${c.driverId}`} className="truncate hover:underline">
                      {c.fullName}
                    </Link>
                  ) : (
                    <span className="truncate">{c.fullName}</span>
                  )}
                </p>
                <p className="text-[11px] text-neutral-500 flex items-center gap-2 flex-wrap">
                  <a href={`tel:${c.phone}`} className="font-mono inline-flex items-center gap-1 hover:text-ink">
                    <Phone size={10} /> {c.phone}
                  </a>
                  <span>{c.kind === 'courier' ? 'Kuryer' : 'Taksi'}</span>
                  {c.carPlate && <span className="font-mono">{c.carPlate}</span>}
                </p>
              </div>
              <button
                type="button"
                title="Ro‘yxatdan olib tashlash"
                disabled={remove.isPending && remove.variables === c.driverId}
                onClick={() => {
                  if (confirm(`${c.fullName} o‘z kuryerlari ro‘yxatidan olib tashlansinmi?`))
                    remove.mutate(c.driverId);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50 shrink-0"
              >
                <Trash2 size={15} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
