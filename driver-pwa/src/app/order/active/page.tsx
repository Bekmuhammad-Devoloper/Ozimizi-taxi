'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Phone,
  MapPin,
  Navigation,
  CheckCircle2,
  Play,
  Flag,
  Check,
  XCircle,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { useOrderStore, OrderStatus } from '@/stores/order';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';

interface ClientInfo {
  id: string;
  firstName: string;
  phonePrimary: string;
}

export default function ActiveOrderPage() {
  return (
    <Shell>
      <ActiveInner />
    </Shell>
  );
}

function ActiveInner() {
  const active = useOrderStore((s) => s.active);
  const setActive = useOrderStore((s) => s.setActive);
  const trackedKm = useOrderStore((s) => s.trackedDistanceKm);
  const setDriver = useAuthStore((s) => s.setDriver);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);

  useEffect(() => {
    if (!active?.id) return;
    api
      .get(`/driver/orders/${active.id}`)
      .then((r) => {
        if (r.data?.client) setClient(r.data.client);
      })
      .catch(() => {});
  }, [active?.id]);

  if (!active) {
    return (
      <div className="px-6 pt-16 text-center">
        <p className="text-sm text-neutral-500 mb-6">Faol buyurtma yo‘q.</p>
        <button
          onClick={() => router.replace('/dashboard')}
          className="h-11 px-6 border border-line rounded-xl text-sm font-semibold"
        >
          Bosh sahifa
        </button>
      </div>
    );
  }

  const transition = async (path: string, next: OrderStatus) => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post(`/driver/orders/${active.id}/${path}`);
      setActive({ ...active, status: next, ...data });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Xato');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post(`/driver/orders/${active.id}/complete`, {
        distanceKm: Number(trackedKm.toFixed(3)),
      });
      setActive({
        ...active,
        status: 'COMPLETED',
        distanceKm: data.distanceKm,
        price: data.price,
        commission: data.commission,
      });
      api.get('/driver/me').then((r) => setDriver(r.data)).catch(() => {});
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Yakunlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm('Buyurtmani bekor qilishni tasdiqlaysizmi?')) return;
    setBusy(true);
    setErr(null);
    try {
      setActive({ ...active, status: 'CANCELLED' });
      // optimistic — backend cancel is admin/client driven, but we'll just go back
      router.replace('/dashboard');
    } finally {
      setBusy(false);
    }
  };

  const stepLabel = LABEL[active.status] ?? active.status;

  return (
    <>
      {/* HERO */}
      <header className="relative bg-ink text-white px-6 pt-10 pb-6 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 100% 0%, rgba(250,204,21,0.45), transparent 60%)',
          }}
        />
        <div className="relative flex items-center justify-between mb-3">
          <p className="text-[10px] uppercase tracking-widest text-neutral-400 font-semibold">
            Buyurtma · {active.id.slice(0, 8).toUpperCase()}
          </p>
          <span className="text-[10px] uppercase tracking-wider bg-gold text-ink px-2.5 py-1 rounded-full font-bold">
            {stepLabel}
          </span>
        </div>

        {/* Step progress */}
        <StepProgress status={active.status} />
      </header>

      {/* CLIENT CARD */}
      {client && (
        <section className="px-6 mt-4">
          <div className="bg-white border border-line rounded-2xl p-4 flex items-center gap-3 shadow-sm">
            <div className="w-12 h-12 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold text-lg">
              {client.firstName?.[0]?.toUpperCase() ?? 'K'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold truncate">{client.firstName}</p>
              <p className="text-xs text-neutral-500">{client.phonePrimary}</p>
            </div>
            <a
              href={`tel:${client.phonePrimary}`}
              className="w-11 h-11 rounded-full bg-gold text-ink flex items-center justify-center shadow-md shadow-gold/40 active:scale-95"
              aria-label="Tell qilish"
            >
              <Phone size={18} strokeWidth={2.4} />
            </a>
          </div>
        </section>
      )}

      {/* PICKUP */}
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
                Olib ketish joyi
              </p>
              <p className="text-sm text-ink leading-snug mt-0.5">
                {active.pickupAddress ||
                  `${active.pickupLat.toFixed(5)}, ${active.pickupLng.toFixed(5)}`}
              </p>
            </div>
          </div>
          <div className="aspect-[16/10] w-full">
            <iframe
              title="map"
              src={`https://www.openstreetmap.org/export/embed.html?bbox=${
                active.pickupLng - 0.01
              }%2C${active.pickupLat - 0.01}%2C${
                active.pickupLng + 0.01
              }%2C${
                active.pickupLat + 0.01
              }&layer=mapnik&marker=${active.pickupLat}%2C${active.pickupLng}`}
              className="w-full h-full border-0"
            />
          </div>
        </div>
      </section>

      {/* IN PROGRESS metric */}
      {active.status === 'IN_PROGRESS' && (
        <section className="px-6 mt-4">
          <div className="bg-ink text-white rounded-2xl p-5 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gold/20 blur-2xl"
            />
            <p className="relative text-[10px] uppercase tracking-widest text-gold font-bold">
              Bosib o‘tilgan masofa
            </p>
            <p className="relative mt-2 text-5xl font-extrabold tabular-nums leading-none">
              {trackedKm.toFixed(2)}
              <span className="ml-2 text-base font-normal text-neutral-400">
                km
              </span>
            </p>
            <p className="relative mt-2 text-xs text-neutral-400">
              GPS orqali avtomatik kuzatilmoqda
            </p>
          </div>
        </section>
      )}

      {/* COMPLETED summary */}
      {active.status === 'COMPLETED' && (
        <section className="px-6 mt-4">
          <div className="bg-white border-2 border-gold rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-gold-deep" />
              <p className="text-base font-bold">Safar yakunlandi</p>
            </div>
            <SummaryRow label="Masofa" value={`${active.distanceKm} km`} />
            <SummaryRow
              label="Narx"
              value={`${fmt(active.price)} so‘m`}
            />
            <SummaryRow
              label="Komissiya"
              value={`-${fmt(active.commission)} so‘m`}
            />
            <div className="border-t border-line pt-2 mt-2">
              <SummaryRow
                label="Sof daromad"
                value={`+${fmt(
                  Number(active.price) - Number(active.commission),
                )} so‘m`}
                bold
              />
            </div>
          </div>
        </section>
      )}

      {err && (
        <p className="px-6 mt-3 text-sm text-red-600">{err}</p>
      )}

      {/* ACTION BUTTON */}
      <section className="px-6 mt-6 mb-4">
        {active.status === 'ACCEPTED' && (
          <PrimaryAction
            icon={<Navigation size={18} strokeWidth={2.4} />}
            onClick={() => transition('on-the-way', 'ON_THE_WAY')}
            disabled={busy}
            label="Yo‘lga chiqdim"
          />
        )}
        {active.status === 'ON_THE_WAY' && (
          <PrimaryAction
            icon={<CheckCircle2 size={18} strokeWidth={2.4} />}
            onClick={() => transition('arrived', 'ARRIVED')}
            disabled={busy}
            label="Yetib keldim"
          />
        )}
        {active.status === 'ARRIVED' && (
          <PrimaryAction
            icon={<Play size={18} strokeWidth={2.4} />}
            onClick={() => transition('start', 'IN_PROGRESS')}
            disabled={busy}
            label="Safarni boshlash"
          />
        )}
        {active.status === 'IN_PROGRESS' && (
          <PrimaryAction
            icon={<Flag size={18} strokeWidth={2.4} />}
            onClick={complete}
            disabled={busy}
            label="Safarni tugatish"
          />
        )}
        {active.status === 'COMPLETED' && (
          <PrimaryAction
            icon={<Check size={18} strokeWidth={2.4} />}
            onClick={() => {
              setActive(null);
              router.replace('/dashboard');
            }}
            label="Bosh sahifa"
          />
        )}

        {/* Cancel button — only before IN_PROGRESS */}
        {(active.status === 'ACCEPTED' ||
          active.status === 'ON_THE_WAY' ||
          active.status === 'ARRIVED') && (
          <button
            onClick={cancel}
            disabled={busy}
            className="mt-3 w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold active:scale-[0.98]"
          >
            <XCircle size={16} /> Bekor qilish
          </button>
        )}
      </section>
    </>
  );
}

const STEPS: { key: OrderStatus; short: string }[] = [
  { key: 'ACCEPTED', short: 'Qabul' },
  { key: 'ON_THE_WAY', short: 'Yo‘lda' },
  { key: 'ARRIVED', short: 'Keldim' },
  { key: 'IN_PROGRESS', short: 'Safar' },
  { key: 'COMPLETED', short: 'Tugadi' },
];

const LABEL: Record<string, string> = {
  ACCEPTED: 'Qabul qilindi',
  ON_THE_WAY: 'Yo‘lda',
  ARRIVED: 'Yetib keldim',
  IN_PROGRESS: 'Safar boshlandi',
  COMPLETED: 'Yakunlandi',
  CANCELLED: 'Bekor qilindi',
};

function StepProgress({ status }: { status: OrderStatus }) {
  const currentIdx = STEPS.findIndex((s) => s.key === status);
  return (
    <div className="relative flex items-center justify-between">
      {STEPS.map((step, i) => {
        const done = i <= currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.key} className="flex-1 flex flex-col items-center">
            <span
              className={
                'w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ' +
                (done
                  ? 'bg-gold text-ink'
                  : 'bg-neutral-800 text-neutral-500 ring-1 ring-neutral-700')
              }
            >
              {done && !active ? <Check size={12} strokeWidth={3} /> : i + 1}
            </span>
            <p
              className={
                'mt-1.5 text-[9px] uppercase tracking-wider font-semibold ' +
                (active
                  ? 'text-gold'
                  : done
                    ? 'text-neutral-300'
                    : 'text-neutral-500')
              }
            >
              {step.short}
            </p>
          </div>
        );
      })}
      {/* connector line */}
      <div
        aria-hidden
        className="absolute top-3 left-0 right-0 h-[2px] bg-neutral-800 -z-0"
      />
      <div
        aria-hidden
        className="absolute top-3 left-0 h-[2px] bg-gold -z-0 transition-all duration-300"
        style={{
          width: `${Math.max(0, currentIdx) * (100 / (STEPS.length - 1))}%`,
        }}
      />
    </div>
  );
}

function PrimaryAction({
  icon,
  label,
  onClick,
  disabled,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="w-full h-14 bg-gold text-ink text-base font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-gold/40 disabled:opacity-50 active:scale-[0.98]"
    >
      {icon}
      {label}
    </button>
  );
}

function SummaryRow({
  label,
  value,
  bold,
}: {
  label: string;
  value: string;
  bold?: boolean;
}) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-neutral-500">{label}</span>
      <span
        className={
          'text-sm tabular-nums ' + (bold ? 'font-bold text-ink' : 'font-medium')
        }
      >
        {value}
      </span>
    </div>
  );
}

function fmt(v: any) {
  return Number(v ?? 0).toLocaleString('uz');
}
