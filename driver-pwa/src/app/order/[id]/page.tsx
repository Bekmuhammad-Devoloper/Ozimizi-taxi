'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  MapPin,
  Phone,
  Clock,
  Route,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { OrderStatus } from '@/stores/order';

interface OrderDetail {
  id: string;
  status: OrderStatus;
  pickupLat: number;
  pickupLng: number;
  pickupAddress: string | null;
  distanceKm: string | null;
  price: string | null;
  commission: string;
  createdAt: string;
  acceptedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  client?: {
    firstName: string;
    phonePrimary: string;
  };
}

export default function OrderDetailPage() {
  return (
    <Shell>
      <Inner />
    </Shell>
  );
}

function Inner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get<OrderDetail>(`/driver/orders/${id}`)
      .then((r) => setOrder(r.data))
      .catch((e) =>
        setErr(e?.response?.data?.message ?? 'Buyurtma topilmadi'),
      )
      .finally(() => setLoading(false));
  }, [id]);

  if (loading) {
    return (
      <div className="px-6 pt-16 text-center text-sm text-neutral-500">
        Yuklanmoqda…
      </div>
    );
  }

  if (err || !order) {
    return (
      <div className="px-6 pt-16 text-center">
        <p className="text-sm text-neutral-500 mb-6">{err}</p>
        <button
          onClick={() => router.back()}
          className="h-11 px-6 border border-line rounded-xl text-sm font-semibold"
        >
          Orqaga
        </button>
      </div>
    );
  }

  const isActive = [
    'ACCEPTED',
    'ON_THE_WAY',
    'ARRIVED',
    'IN_PROGRESS',
  ].includes(order.status);

  const net =
    order.price && order.commission
      ? Number(order.price) - Number(order.commission)
      : null;

  return (
    <>
      <header className="bg-ink text-white px-6 pt-8 pb-6 rounded-b-3xl relative">
        <button
          onClick={() => router.back()}
          className="flex items-center gap-1 text-sm text-neutral-400 mb-3"
        >
          <ArrowLeft size={16} /> Orqaga
        </button>
        <div className="flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">
            Buyurtma · {order.id.slice(0, 8).toUpperCase()}
          </p>
          <StatusBadge status={order.status} />
        </div>
        <p className="mt-3 text-3xl font-extrabold tabular-nums">
          {order.price ? fmt(order.price) : '—'}
          <span className="ml-2 text-sm font-normal text-neutral-400">so‘m</span>
        </p>
      </header>

      <section className="px-6 mt-4">
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          <div className="px-4 py-3 flex items-start gap-2 border-b border-line">
            <MapPin
              size={16}
              className="text-gold-deep mt-0.5 shrink-0"
              strokeWidth={2.2}
            />
            <div>
              <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                Olib ketish
              </p>
              <p className="text-sm leading-snug mt-0.5">
                {order.pickupAddress ||
                  `${order.pickupLat.toFixed(5)}, ${order.pickupLng.toFixed(5)}`}
              </p>
            </div>
          </div>
          <div className="aspect-[16/10] w-full">
            <iframe
              title="map"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                order.pickupLng - 0.01
              }%2C${order.pickupLat - 0.01}%2C${
                order.pickupLng + 0.01
              }%2C${
                order.pickupLat + 0.01
              }&layer=mapnik&marker=${order.pickupLat}%2C${order.pickupLng}`}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </section>

      {order.client && (
        <section className="px-6 mt-4">
          <div className="bg-white border border-line rounded-2xl p-4 flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold">
              {order.client.firstName?.[0]?.toUpperCase() ?? 'K'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">
                {order.client.firstName}
              </p>
              <p className="text-xs text-neutral-500">
                {order.client.phonePrimary}
              </p>
            </div>
            <a
              href={`tel:${order.client.phonePrimary}`}
              className="w-11 h-11 rounded-full bg-gold text-ink flex items-center justify-center shadow-md shadow-gold/40"
            >
              <Phone size={18} strokeWidth={2.4} />
            </a>
          </div>
        </section>
      )}

      <section className="px-6 mt-4">
        <div className="bg-white border border-line rounded-2xl divide-y divide-line">
          <Row
            icon={<Clock size={14} />}
            label="Yaratildi"
            value={fmtDateTime(order.createdAt)}
          />
          {order.acceptedAt && (
            <Row
              icon={<Clock size={14} />}
              label="Qabul qilindi"
              value={fmtDateTime(order.acceptedAt)}
            />
          )}
          {order.completedAt && (
            <Row
              icon={<Clock size={14} />}
              label="Yakunlandi"
              value={fmtDateTime(order.completedAt)}
            />
          )}
          {order.cancelledAt && (
            <Row
              icon={<Clock size={14} />}
              label="Bekor qilindi"
              value={fmtDateTime(order.cancelledAt)}
            />
          )}
        </div>
      </section>

      {order.status === 'COMPLETED' && (
        <section className="px-6 mt-4 mb-4">
          <div className="bg-white border-2 border-gold rounded-2xl p-5 space-y-2">
            <Row
              icon={<Route size={14} />}
              label="Masofa"
              value={`${order.distanceKm ?? '-'} km`}
            />
            <Row
              icon={<Receipt size={14} />}
              label="Narx"
              value={`${fmt(order.price ?? 0)} so‘m`}
            />
            <Row
              icon={<Receipt size={14} />}
              label="Komissiya"
              value={`-${fmt(order.commission)} so‘m`}
            />
            <div className="border-t border-line pt-3 mt-2">
              <Row
                icon={<TrendingUp size={14} />}
                label="Sof daromad"
                value={`+${fmt(net ?? 0)} so‘m`}
                bold
              />
            </div>
          </div>
        </section>
      )}

      {isActive && (
        <section className="px-6 mt-4 mb-4">
          <button
            onClick={() => router.push('/order/active')}
            className="w-full h-12 bg-gold text-ink rounded-xl text-sm font-bold shadow-md shadow-gold/40 active:scale-[0.98]"
          >
            Faol buyurtmaga o‘tish
          </button>
        </section>
      )}
    </>
  );
}

function Row({
  icon,
  label,
  value,
  bold,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 px-4 py-3">
      <span className="text-neutral-400">{icon}</span>
      <span className="text-xs text-neutral-500 flex-1">{label}</span>
      <span
        className={
          'text-sm text-right ' + (bold ? 'font-bold text-ink' : 'font-medium')
        }
      >
        {value}
      </span>
    </div>
  );
}

function StatusBadge({ status }: { status: OrderStatus }) {
  const map: Record<string, { label: string; cls: string }> = {
    COMPLETED: { label: 'Bajarildi', cls: 'bg-green-500 text-white' },
    CANCELLED: { label: 'Bekor', cls: 'bg-red-500 text-white' },
    IN_PROGRESS: { label: 'Yo‘lda', cls: 'bg-gold text-ink' },
    ACCEPTED: { label: 'Qabul', cls: 'bg-blue-500 text-white' },
    PENDING: { label: 'Kutilmoqda', cls: 'bg-neutral-400 text-white' },
    ON_THE_WAY: { label: 'Yo‘lda', cls: 'bg-gold text-ink' },
    ARRIVED: { label: 'Yetib keldi', cls: 'bg-gold text-ink' },
  };
  const cfg = map[status] ?? { label: status, cls: 'bg-neutral-300' };
  return (
    <span
      className={
        'text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold ' +
        cfg.cls
      }
    >
      {cfg.label}
    </span>
  );
}

function fmt(v: string | number) {
  return Number(v).toLocaleString('uz');
}
function fmtDateTime(s: string) {
  if (!s) return '—';
  const d = new Date(s);
  return (
    d.toLocaleDateString('uz', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' })
  );
}
