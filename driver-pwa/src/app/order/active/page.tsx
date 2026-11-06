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
import { OrderChat } from '@/components/OrderChat';
import { Shell } from '@/components/Shell';
import { FareCard, TariffLine, WaitPanel } from '@/components/RideMeter';
import { useOrderStore, OrderStatus } from '@/stores/order';
import { api } from '@/lib/api';
import { computeZonedFare, zoneActive } from '@/lib/fare';
import { fmtSum,
  isWaitCounting,
  liveWaitSec,
  noteServerTime,
  serverNow,
  waitFeeFor,
} from '@/lib/meter';
import { openYandexNavigator } from '@/lib/nav';
import {
  orderFields,
  syncActiveOrder,
  useTariff,
  useTicker,
  useWaitToggle,
} from '@/hooks/useMeter';
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
  const patchActive = useOrderStore((s) => s.patchActive);
  const trackedKm = useOrderStore((s) => s.trackedDistanceKm);
  const trackedOutsideKm = useOrderStore((s) => s.trackedOutsideKm);
  const waitPending = useOrderStore((s) => s.waitPending);
  const setDriver = useAuthStore((s) => s.setDriver);
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [client, setClient] = useState<ClientInfo | null>(null);
  const tariff = useTariff();
  // Dedicated, race-free "Kutish" / "Davom etish" (see useWaitToggle).
  const toggleWait = useWaitToggle(setErr);

  // Street pickups (taximeter) have their own screen.
  const isStreet = active?.source === 'street';
  useEffect(() => {
    if (isStreet) router.replace('/taximeter');
  }, [isStreet, router]);

  const activeId = active?.id;
  useEffect(() => {
    if (!activeId) return;
    void syncActiveOrder(activeId).then((d) => {
      if (d?.client) setClient(d.client);
    });
  }, [activeId]);

  // 1 s tick for the live waiting counters.
  useTicker(1000);
  const now = serverNow();

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

  const id = active.id;

  const transition = async (path: string, next: OrderStatus) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post(`/driver/orders/${id}/${path}`);
      if (next === 'ARRIVED') noteServerTime(data?.waitTickAt);
      // Merge into the latest state (a wait tick may have landed meanwhile).
      patchActive(id, { status: next, ...orderFields(data) });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Xato');
    } finally {
      setBusy(false);
    }
  };

  const complete = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const { trackedDistanceKm: km, trackedOutsideKm: outKm } = useOrderStore.getState();
      const { data } = await api.post(`/driver/orders/${id}/complete`, {
        distanceKm: Number(km.toFixed(3)),
        outsideKm: Number(Math.min(outKm, 500).toFixed(3)),
      });
      patchActive(id, { ...orderFields(data), status: 'COMPLETED', waitStartedAt: null });
      api.get('/driver/me').then((r) => setDriver(r.data)).catch(() => {});
    } catch (e: any) {
      // The server may have finished the order even though this request
      // failed (e.g. a lost response) — resync instead of showing a stale screen.
      try {
        const { data: fresh } = await api.get(`/driver/orders/${id}`);
        const cur = useOrderStore.getState().active;
        if (fresh?.status && cur?.id === id && fresh.status !== cur.status) {
          patchActive(id, orderFields(fresh));
          return;
        }
      } catch {
        /* fall through to the error message */
      }
      setErr(e?.response?.data?.message ?? 'Yakunlab bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  const cancel = async () => {
    if (!confirm('Buyurtmani qaytarasizmi? U boshqa haydovchilarga o‘rtaga tushadi.')) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/driver/orders/${id}/cancel`);
      setActive(null);
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Bekor qilib bo‘lmadi');
    } finally {
      setBusy(false);
    }
  };

  // Live meter: waiting time + its cost, distance fare, total.
  const waitSec = liveWaitSec(active, now);
  const waitFee = waitFeeFor(waitSec, tariff);
  const distanceFare = tariff ? computeZonedFare(trackedKm, trackedOutsideKm, tariff) : 0;
  const hasPickup =
    Number.isFinite(Number(active.pickupLat)) && Number.isFinite(Number(active.pickupLng));
  const hasDestination =
    active.destinationLat != null &&
    active.destinationLng != null &&
    Number.isFinite(Number(active.destinationLat)) &&
    Number.isFinite(Number(active.destinationLng));
  const goingToPickup =
    active.status === 'ACCEPTED' || active.status === 'ON_THE_WAY' || active.status === 'ARRIVED';
  const showDestinationNav =
    hasDestination && (active.status === 'ARRIVED' || active.status === 'IN_PROGRESS');

  const stepLabel = LABEL[active.status] ?? active.status;

  return (
    <>
      {/* HERO */}
      <header className="relative bg-ink text-white px-5 pt-7 pb-7 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 100% 0%, rgba(59,155,255,0.45), transparent 60%)',
          }}
        />
        <div className="relative flex items-center justify-between mb-5">
          <div className="min-w-0">
            <p className="text-[11px] uppercase tracking-widest text-neutral-400 font-semibold">
              Buyurtma
            </p>
            <p className="text-base font-bold tracking-wider tabular-nums mt-0.5">
              #{active.id.slice(0, 8).toUpperCase()}
            </p>
          </div>
          <span className="text-[11px] uppercase tracking-wider bg-gold text-ink px-3 py-1.5 rounded-full font-bold shrink-0">
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
                {active.pickupAddress || 'Manzil aniqlanmagan'}
              </p>
              {active.destinationAddress && (
                <p className="mt-1 text-sm text-neutral-600">
                  <span className="text-neutral-400 mr-1">→</span>
                  {active.destinationAddress}
                </p>
              )}
            </div>
          </div>
          {((goingToPickup && hasPickup) || showDestinationNav) && (
            <div className="px-4 py-3 border-b border-line flex flex-col gap-2">
              {goingToPickup && hasPickup && (
                <NavButton
                  label="Mijozga yo‘l ko‘rsatish"
                  onClick={() =>
                    openYandexNavigator(Number(active.pickupLat), Number(active.pickupLng))
                  }
                />
              )}
              {showDestinationNav && (
                <NavButton
                  label="Manzilga yo‘l ko‘rsatish"
                  secondary={goingToPickup}
                  onClick={() =>
                    openYandexNavigator(Number(active.destinationLat), Number(active.destinationLng))
                  }
                />
              )}
            </div>
          )}
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

      {/* WAITING at pickup: time, its cost and the fare so far */}
      {active.status === 'ARRIVED' && (
        <section className="px-6 mt-4 space-y-3">
          <WaitPanel
            title="Mijozni kutish"
            seconds={waitSec}
            fee={waitFee}
            tariff={tariff}
            counting={isWaitCounting(active)}
            moving={!!active.waitMoving}
          />
          {tariff && (
            <FareCard
              distanceFare={distanceFare}
              waitFee={waitFee}
              tariff={tariff}
              distanceLabel="Minimal"
            />
          )}
        </section>
      )}

      {/* CHAT with the passenger */}
      <OrderChat
        orderId={active.id}
        enabled={active.status !== 'COMPLETED' && active.status !== 'CANCELLED'}
      />

      {/* IN PROGRESS metric */}
      {active.status === 'IN_PROGRESS' && (
        <section className="px-6 mt-4 space-y-3">
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
            {tariff && zoneActive(tariff) && trackedOutsideKm > 0 && (
              <p className="relative mt-1 text-xs font-semibold text-amber-300 tabular-nums">
                Hududdan tashqari: {trackedOutsideKm.toFixed(2)} km · 1 km {fmtSum(tariff.outsidePricePerKm)} so‘m
              </p>
            )}
          </div>

          <WaitPanel
            title="Kutish (jami)"
            seconds={waitSec}
            fee={waitFee}
            tariff={tariff}
            counting={isWaitCounting(active)}
            moving={!!active.waitMoving}
            toggle={{
              running: !!active.waitStartedAt,
              pending: waitPending,
              onToggle: () => void toggleWait(),
            }}
          />

          {tariff && <FareCard distanceFare={distanceFare} waitFee={waitFee} tariff={tariff} />}
          {tariff && <TariffLine tariff={tariff} />}
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
            <div className="border-t border-line pt-2 mt-2">
              <SummaryRow
                label="Sof daromad"
                value={`+${fmt(Number(active.price) - Number(active.commission))} so‘m`}
                bold
              />
            </div>
            <SummaryRow label="Narx" value={`${fmt(active.price)} so‘m`} />
            {Number(active.waitingFee ?? 0) > 0 && (
              <SummaryRow
                label={`Kutish (${active.waitingMinutes ?? 0} daq)`}
                value={`+${fmt(active.waitingFee ?? 0)} so‘m`}
              />
            )}
            {Number(active.outsideFee ?? 0) > 0 && (
              <SummaryRow
                label={`Hududdan tashqari (${Number(active.outsideKm ?? 0).toFixed(1)} km)`}
                value={`${fmt(active.outsideFee ?? 0)} so‘m`}
              />
            )}
            <SummaryRow label="Komissiya" value={`-${fmt(active.commission)} so‘m`} />
            {Number(active.discount ?? 0) > 0 && (
              <SummaryRow
                label="Promo chegirma (balansga qaytarildi)"
                value={`-${fmt(active.discount)} so‘m`}
              />
            )}
            {Number(active.bonusUsed ?? 0) > 0 && (
              <SummaryRow
                label="Mijoz bonusidan (balansga tushdi)"
                value={`+${fmt(active.bonusUsed)} so‘m`}
              />
            )}
            <div className="border-t border-line pt-2 mt-2">
              <SummaryRow
                label="Naqd olinadi"
                value={`${fmt(
                  Math.max(
                    0,
                    Number(active.price) -
                      Number(active.discount ?? 0) -
                      Number(active.bonusUsed ?? 0),
                  ),
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
            <XCircle size={16} /> Buyurtmani qaytarish
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
    <div className="relative flex items-start justify-between">
      {/* connector line (behind circles) */}
      <div
        aria-hidden
        className="absolute top-4 left-[10%] right-[10%] h-[3px] bg-neutral-800 rounded-full"
      />
      <div
        aria-hidden
        className="absolute top-4 left-[10%] h-[3px] bg-gold rounded-full transition-all duration-300"
        style={{
          width: `${Math.max(0, currentIdx) * (80 / (STEPS.length - 1))}%`,
        }}
      />
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        const pending = i > currentIdx;
        return (
          <div
            key={step.key}
            className="relative flex-1 flex flex-col items-center"
          >
            <span
              className={
                'w-9 h-9 rounded-full flex items-center justify-center text-sm font-extrabold transition-colors ring-2 ' +
                (active
                  ? 'bg-gold text-ink ring-gold shadow-lg shadow-gold/40 scale-110'
                  : done
                    ? 'bg-gold text-ink ring-gold/70'
                    : 'bg-neutral-900 text-neutral-500 ring-neutral-700')
              }
            >
              {done ? <Check size={18} strokeWidth={3.2} /> : i + 1}
            </span>
            <p
              className={
                'mt-2 text-[11px] uppercase tracking-wide font-bold text-center leading-tight ' +
                (active
                  ? 'text-gold'
                  : done
                    ? 'text-neutral-200'
                    : 'text-neutral-500')
              }
            >
              {step.short}
            </p>
          </div>
        );
      })}
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

/** "Yo‘l ko‘rsatish" — Yandex Navigator (web map fallback). */
function NavButton({
  label,
  onClick,
  secondary,
}: {
  label: string;
  onClick: () => void;
  secondary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        'w-full h-11 rounded-xl text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98] ' +
        (secondary ? 'border border-line bg-white text-ink' : 'bg-ink text-gold')
      }
    >
      <Navigation size={16} strokeWidth={2.4} /> {label}
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
