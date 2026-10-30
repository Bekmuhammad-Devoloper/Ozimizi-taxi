'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { getAdminSocket } from '@/lib/socket';
import { describeEvent, toneClass, type OrderEventRow } from '@/lib/orderEvents';

const time = (s: string) =>
  new Date(s).toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

/** Full step-by-step history of one order, updated live. */
export function OrderTimeline({ orderId }: { orderId: string }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['order-events', orderId],
    queryFn: async () => (await api.get<OrderEventRow[]>(`/admin/orders/${orderId}/events`)).data,
  });

  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;
    const on = (e: OrderEventRow) => {
      if (e?.orderId === orderId) qc.invalidateQueries({ queryKey: ['order-events', orderId] });
    };
    socket.on('order_event', on);
    return () => {
      socket.off('order_event', on);
    };
  }, [orderId, qc]);

  if (isLoading) return <p className="text-xs text-neutral-500 py-2">Yuklanmoqda…</p>;
  if (!data?.length)
    return <p className="text-xs text-neutral-500 py-2">Bu buyurtma uchun harakatlar yozilmagan (eski buyurtma).</p>;

  const t0 = new Date(data[0].createdAt).getTime();
  return (
    <ol className="relative border-l-2 border-line ml-2 space-y-2 py-1">
      {data.map((e) => {
        const d = describeEvent(e);
        const plus = Math.round((new Date(e.createdAt).getTime() - t0) / 1000);
        return (
          <li key={e.id} className="ml-4">
            <span className="absolute -left-[9px] mt-1 w-4 h-4 rounded-full bg-white border-2 border-line flex items-center justify-center text-[9px]">
              {d.icon}
            </span>
            <div className={'rounded-lg border px-3 py-1.5 ' + toneClass[d.tone]}>
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-bold">{d.title}</p>
                <span className="text-[10px] tabular-nums opacity-70 whitespace-nowrap">
                  {time(e.createdAt)} · +{plus} s
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
