'use client';
import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Banknote,
  ListOrdered,
  Percent,
  UserCheck,
  Radio,
  CheckCircle2,
  Sparkles,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Shell } from '@/components/Shell';
import { StatsCard } from '@/components/StatsCard';
import { api } from '@/lib/api';
import { getAdminSocket } from '@/lib/socket';

type Period = 'day' | 'week' | 'month';

export default function DashboardPage() {
  const [period, setPeriod] = useState<Period>('day');
  const qc = useQueryClient();

  const { data: stats } = useQuery({
    queryKey: ['stats', period],
    queryFn: async () =>
      (await api.get('/admin/stats', { params: { period } })).data,
  });

  const { data: orders } = useQuery({
    queryKey: ['orders', 'live'],
    queryFn: async () =>
      (
        await api.get('/admin/orders', {
          params: { page: 1, pageSize: 30 },
        })
      ).data,
  });

  const { data: drivers } = useQuery({
    queryKey: ['drivers'],
    queryFn: async () => (await api.get('/admin/drivers')).data,
  });

  const [liveFeed, setLiveFeed] = useState<any[]>([]);

  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;
    const onCreated = (p: any) => {
      setLiveFeed((s) => [{ type: 'new', ...p, at: Date.now() }, ...s].slice(0, 6));
      qc.invalidateQueries({ queryKey: ['orders'] });
    };
    const onCompleted = (p: any) => {
      setLiveFeed((s) => [{ type: 'done', ...p, at: Date.now() }, ...s].slice(0, 6));
      qc.invalidateQueries({ queryKey: ['stats'] });
    };
    const onDriver = () => qc.invalidateQueries({ queryKey: ['drivers'] });
    socket.on('order_created', onCreated);
    socket.on('order_completed', onCompleted);
    socket.on('driver_online', onDriver);
    socket.on('driver_offline', onDriver);
    return () => {
      socket.off('order_created', onCreated);
      socket.off('order_completed', onCompleted);
      socket.off('driver_online', onDriver);
      socket.off('driver_offline', onDriver);
    };
  }, [qc]);

  const last30Revenue = orders?.items ? buildDailyRevenue(orders.items) : [];
  const driverBars = (drivers ?? [])
    .map((d: any) => ({ name: d.fullName.split(' ')[0], orders: d.ordersCount ?? 0 }))
    .filter((d: any) => d.orders > 0)
    .slice(0, 10);
  const statusPie = orders?.items ? buildStatusPie(orders.items) : [];

  return (
    <Shell
      title="Dashboard"
      subtitle="Tizim statistikasi va real-time monitoring"
      actions={
        <div className="flex gap-1 p-1 bg-neutral-100 rounded-xl">
          {(['day', 'week', 'month'] as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => setPeriod(p)}
              className={
                'px-4 h-9 rounded-lg text-sm font-semibold transition-all ' +
                (period === p
                  ? 'bg-ink text-gold shadow-sm'
                  : 'text-neutral-500 hover:text-ink')
              }
            >
              {p === 'day' ? 'Bugun' : p === 'week' ? 'Hafta' : 'Oy'}
            </button>
          ))}
        </div>
      }
    >
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <StatsCard
          title="Aylanma"
          value={fmt(stats?.totalRevenue ?? 0) + ' so‘m'}
          icon={Banknote}
          accent="bg-green-50 text-green-700"
        />
        <StatsCard
          title="Komissiya"
          value={fmt(stats?.totalCommission ?? 0) + ' so‘m'}
          icon={Percent}
          accent="bg-gold/15 text-gold-deep"
        />
        <StatsCard
          title="Buyurtmalar"
          value={fmt(stats?.orderCount ?? 0)}
          icon={ListOrdered}
          accent="bg-blue-50 text-blue-700"
        />
        <StatsCard
          title="Faol haydovchi"
          value={fmt(stats?.activeDrivers ?? 0)}
          icon={UserCheck}
          accent="bg-purple-50 text-purple-700"
          hint="Hozir online"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-6">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold">Kunlik daromad</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Oxirgi 30 kun, jami so‘m
              </p>
            </div>
            <Sparkles size={16} className="text-gold-deep" />
          </div>
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={last30Revenue}>
              <CartesianGrid stroke="#e5e5e5" strokeDasharray="3 3" />
              <XAxis dataKey="day" stroke="#737373" fontSize={11} />
              <YAxis stroke="#737373" fontSize={11} />
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e5e5',
                  fontSize: 12,
                }}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="#0a0a0a"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#facc15', stroke: '#0a0a0a', strokeWidth: 2 }}
                activeDot={{ r: 6, fill: '#facc15', stroke: '#0a0a0a', strokeWidth: 2 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card p-5">
          <h3 className="font-bold mb-1">Statuslar</h3>
          <p className="text-xs text-neutral-500 mb-4">Joriy taqsimot</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={statusPie}
                dataKey="value"
                nameKey="name"
                outerRadius={75}
                innerRadius={40}
                stroke="#fff"
                strokeWidth={2}
              >
                {statusPie.map((_, i) => (
                  <Cell key={i} fill={pieColors[i % pieColors.length]} />
                ))}
              </Pie>
              <Tooltip
                contentStyle={{
                  borderRadius: 8,
                  border: '1px solid #e5e5e5',
                  fontSize: 12,
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="mt-2 grid grid-cols-2 gap-1 text-xs">
            {statusPie.slice(0, 6).map((s, i) => (
              <div key={s.name} className="flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ background: pieColors[i % pieColors.length] }}
                />
                <span className="text-neutral-600 truncate">
                  {s.name}: <b>{s.value}</b>
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-bold">Top haydovchilar</h3>
              <p className="text-xs text-neutral-500 mt-0.5">
                Eng faol 10 ta haydovchi
              </p>
            </div>
          </div>
          {driverBars.length === 0 ? (
            <p className="text-sm text-neutral-500 py-12 text-center">
              Hozircha ma'lumot yo'q
            </p>
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={driverBars}>
                <CartesianGrid stroke="#e5e5e5" strokeDasharray="3 3" />
                <XAxis dataKey="name" stroke="#737373" fontSize={11} />
                <YAxis stroke="#737373" fontSize={11} />
                <Tooltip
                  contentStyle={{
                    borderRadius: 8,
                    border: '1px solid #e5e5e5',
                    fontSize: 12,
                  }}
                  cursor={{ fill: '#fef3c7' }}
                />
                <Bar
                  dataKey="orders"
                  fill="#facc15"
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div className="card p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-bold">Live feed</h3>
            <span className="flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold text-green-700 bg-green-50 px-2 py-1 rounded-full">
              <Radio size={10} className="animate-pulse" /> Live
            </span>
          </div>
          {!liveFeed.length ? (
            <div className="text-center py-10 text-sm text-neutral-500">
              <Sparkles size={20} className="mx-auto mb-2 text-gold" />
              Voqealar kutilmoqda…
            </div>
          ) : (
            <ul className="space-y-3">
              {liveFeed.map((e, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 pb-3 border-b border-line last:border-0 last:pb-0"
                >
                  <span
                    className={
                      'w-7 h-7 rounded-full flex items-center justify-center shrink-0 ' +
                      (e.type === 'new'
                        ? 'bg-gold/15 text-gold-deep'
                        : 'bg-green-50 text-green-700')
                    }
                  >
                    {e.type === 'new' ? (
                      <Sparkles size={14} />
                    ) : (
                      <CheckCircle2 size={14} />
                    )}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold leading-tight">
                      {e.type === 'new' ? 'Yangi buyurtma' : 'Yakunlandi'}
                    </p>
                    <p className="text-xs text-neutral-500 mt-0.5 truncate">
                      {e.id?.slice(0, 8).toUpperCase()}
                      {e.price ? ` · ${fmt(e.price)} so‘m` : ''}
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

const pieColors = [
  '#0a0a0a',
  '#facc15',
  '#16a34a',
  '#2563eb',
  '#dc2626',
  '#9333ea',
  '#64748b',
];

function buildDailyRevenue(orders: any[]) {
  const map: Record<string, number> = {};
  orders.forEach((o) => {
    if (o.status !== 'COMPLETED' || !o.completedAt) return;
    const day = String(o.completedAt).slice(0, 10);
    map[day] = (map[day] ?? 0) + Number(o.price ?? 0);
  });
  return Object.entries(map)
    .sort(([a], [b]) => a.localeCompare(b))
    .slice(-30)
    .map(([day, revenue]) => ({ day: day.slice(5), revenue }));
}

function buildStatusPie(orders: any[]) {
  const map: Record<string, number> = {};
  orders.forEach((o) => {
    map[o.status] = (map[o.status] ?? 0) + 1;
  });
  return Object.entries(map).map(([name, value]) => ({ name, value }));
}

function fmt(v: number | string) {
  return Number(v).toLocaleString('uz');
}
