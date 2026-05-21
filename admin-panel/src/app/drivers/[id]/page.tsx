'use client';
import { useQuery } from '@tanstack/react-query';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

export default function DriverDetail({ params }: { params: { id: string } }) {
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
          params: { driverId: params.id, pageSize: 50 },
        })
      ).data,
  });

  if (isLoading || !data)
    return <Shell title="Haydovchi">Yuklanmoqda...</Shell>;

  const d = data.driver;
  const txs = data.transactions;

  return (
    <Shell title={d.fullName}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white border rounded-xl p-5">
          <p className="text-sm text-slate-500">Telefon</p>
          <p className="font-semibold">{d.phone}</p>
        </div>
        <div className="bg-white border rounded-xl p-5">
          <p className="text-sm text-slate-500">Joriy balans</p>
          <p className="font-semibold text-2xl">
            {Number(d.balance).toLocaleString('uz')} so‘m
          </p>
        </div>
        <div className="bg-white border rounded-xl p-5">
          <p className="text-sm text-slate-500">Status</p>
          <p className="font-semibold">
            {d.isOnline ? 'online' : 'offline'} ·{' '}
            {d.isActive ? 'faol' : 'o‘chirilgan'}
          </p>
          {d.currentLat != null && (
            <p className="text-xs text-slate-400">
              {d.currentLat?.toFixed(4)}, {d.currentLng?.toFixed(4)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Buyurtmalar</h3>
          <ul className="space-y-2 text-sm">
            {orders?.items?.slice(0, 20).map((o: any) => (
              <li key={o.id} className="border-b pb-2 last:border-0">
                <div className="flex justify-between">
                  <span>{new Date(o.createdAt).toLocaleString('uz')}</span>
                  <span className="font-medium">{o.status}</span>
                </div>
                <div className="flex justify-between text-slate-500">
                  <span>{o.distanceKm ?? '-'} km</span>
                  <span>
                    {o.price ? Number(o.price).toLocaleString('uz') + ' so‘m' : '-'}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="bg-white border rounded-xl p-5">
          <h3 className="font-semibold mb-3">Tranzaksiyalar</h3>
          <ul className="space-y-2 text-sm">
            {txs?.map((t: any) => {
              const amt = Number(t.amount);
              return (
                <li key={t.id} className="border-b pb-2 last:border-0 flex justify-between">
                  <span className="text-slate-500 text-xs">
                    {new Date(t.createdAt).toLocaleString('uz')} · {t.type}
                  </span>
                  <span
                    className={
                      'font-medium ' + (amt >= 0 ? 'text-green-600' : 'text-red-600')
                    }
                  >
                    {amt >= 0 ? '+' : ''}
                    {amt.toLocaleString('uz')}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </div>
    </Shell>
  );
}
