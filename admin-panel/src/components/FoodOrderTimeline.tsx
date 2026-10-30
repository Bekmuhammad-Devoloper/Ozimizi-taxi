'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getAdminSocket } from '@/lib/socket';
import { toneClass } from '@/lib/orderEvents';
import { describeFoodEvent, type FoodOrderEventRow } from '@/lib/foodEvents';
import { fmtDuration } from '@/lib/food';

const time = (s: string) =>
  new Date(s).toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Step-by-step history of one food order (kitchen + courier search), live. */
export function FoodOrderTimeline({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, isError } = useQuery({
    queryKey: ['food-order-events', orderId],
    queryFn: async () =>
      (await api.get<FoodOrderEventRow[]>(`/admin/food/orders/${orderId}/events`)).data,
  });

  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;
    const on = (e: FoodOrderEventRow) => {
      if (e?.foodOrderId === orderId) qc.invalidateQueries({ queryKey: ['food-order-events', orderId] });
    };
    socket.on('food_order_event', on);
    return () => {
      socket.off('food_order_event', on);
    };
  }, [orderId, qc]);

  if (isLoading) return <p className="text-xs text-neutral-500 py-2">Yuklanmoqda…</p>;
  if (isError) return <p className="text-xs text-red-600 py-2">Harakatlarni yuklab bo‘lmadi</p>;
  if (!data?.length)
    return <p className="text-xs text-neutral-500 py-2">Bu buyurtma uchun harakatlar yozilmagan.</p>;

  const t0 = new Date(data[0].createdAt).getTime();
  return (
    <ol className="relative border-l-2 border-line ml-2 space-y-2 py-1">
      {data.map((e) => {
        const d = describeFoodEvent(e);
        const plus = (new Date(e.createdAt).getTime() - t0) / 1000;
        return (
          <li key={e.id} className="ml-4">
            <span className="absolute -left-[9px] mt-1 w-4 h-4 rounded-full bg-white border-2 border-line flex items-center justify-center text-[9px]">
              {d.icon}
            </span>
            <div className={'rounded-lg border px-3 py-1.5 ' + toneClass[d.tone]}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-bold">{d.title}</p>
                <span className="text-[10px] tabular-nums opacity-70 whitespace-nowrap">
                  {time(e.createdAt)} · +{fmtDuration(plus)}
                </span>
              </div>
              {d.detail && <p className="text-[11px] mt-0.5 opacity-90">{d.detail}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
