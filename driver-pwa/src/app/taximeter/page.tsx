'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  CarTaxiFront,
  CheckCircle2,
  ChevronRight,
  Flag,
  Home,
  Loader2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { TariffLine, WaitPanel } from '@/components/RideMeter';
import { api } from '@/lib/api';
import { commissionFor, computeFare } from '@/lib/fare';
import {
  fmtClock,
  fmtSum,
  isWaitCounting,
  liveWaitSec,
  noteServerTime,
  serverNow,
  waitFeeFor,
} from '@/lib/meter';
import {
  meterSession,
  orderFields,
  syncActiveOrder,
  useTariff,
  useTicker,
  useWaitToggle,
} from '@/hooks/useMeter';
import { getLastKnownPosition } from '@/hooks/useDriverSocket';
import { useAuthStore } from '@/stores/auth';
import { isDeliveryLive, useDeliveryStore } from '@/stores/delivery';
import { OrderModel, useOrderStore } from '@/stores/order';

export default function TaximeterPage() {
  return (
    <Shell>
      <TaximeterInner />
    </Shell>
  );
}

const isLive = (o: OrderModel | null | undefined) =>
  !!o && o.status !== 'COMPLETED' && o.status !== 'CANCELLED';

/** Where the car is now: a fresh fix from the app's GPS watcher, else ask the OS. */
function currentPosition(): Promise<{ lat: number; lng: number }> {
  const fresh = getLastKnownPosition(15_000);
  if (fresh) return Promise.resolve(fresh);
  return new Promise((resolve, reject) => {
    const fallback = () => {
      const last = getLastKnownPosition(120_000);
      if (last) resolve(last);
      else reject(new Error('no-gps'));
    };
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      fallback();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      fallback,
      { enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 },
    );
  });
}

/** A street ride still running on the server (lost response, cleared storage…). */
async function findServerStreetRide(): Promise<OrderModel | null> {
  try {
    const { data } = await api.get('/driver/orders/history');
    const o = Array.isArray(data)
      ? data.find((x: any) => x?.source === 'street' && x?.status === 'IN_PROGRESS')
      : null;
    return o ? ({ id: o.id, ...orderFields(o), source: 'street' } as OrderModel) : null;
  } catch {
    return null;
  }
}

function TaximeterInner() {
  const router = useRouter();
  const driver = useAuthStore((s) => s.driver);
  const setDriver = useAuthStore((s) => s.setDriver);
  const active = useOrderStore((s) => s.active);
  const setActive = useOrderStore((s) => s.setActive);
  const patchActive = useOrderStore((s) => s.patchActive);
  const resetDistance = useOrderStore((s) => s.resetDistance);
  const trackedKm = useOrderStore((s) => s.trackedDistanceKm);
  const waitPending = useOrderStore((s) => s.waitPending);
  const gpsStatus = useOrderStore((s) => s.gpsStatus);
  const delivery = useDeliveryStore((s) => s.active);
  const tariff = useTariff();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const toggleWait = useWaitToggle(setErr);
  useTicker(1000);
  const now = serverNow();

  useEffect(() => {
    meterSession.shown = true;
  }, []);

  const ride = active?.source === 'street' ? active : null;
  const otherOrder = active && active.source !== 'street' && isLive(active) ? active : null;
  const otherDelivery = isDeliveryLive(delivery);

  // Restore after a restart: re-read the stored ride from the server (it
  // may have been cancelled meanwhile); with nothing stored, pick up a ride
  // the server still has running.
  const rideId = ride?.id;
  useEffect(() => {
    if (rideId) {
      void syncActiveOrder(rideId);
      return;
    }
    if (isLive(useOrderStore.getState().active)) return;
    let alive = true;
    void findServerStreetRide().then((o) => {
      if (!alive || !o || isLive(useOrderStore.getState().active)) return;
      resetDistance();
      setActive(o);
    });
    return () => {
      alive = false;
    };
  }, [rideId, resetDistance, setActive]);

  // ---- actions ---------------------------------------------------------------

  const start = async () => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      let pos: { lat: number; lng: number };
      try {
        pos = await currentPosition();
      } catch {
        setErr('Joylashuv aniqlanmadi — GPS yoqilganini tekshiring va qayta bosing.');
        return;
      }
      const { data } = await api.post('/driver/street/start', { lat: pos.lat, lng: pos.lng });
      noteServerTime(data?.startedAt);
      resetDistance();
      setActive({ id: data.id, ...orderFields(data), source: 'street' } as OrderModel);
    } catch (e: any) {
      // The ride may already exist (lost response / double tap) — take it.
      const existing = await findServerStreetRide();
      if (existing && !isLive(useOrderStore.getState().active)) {
        resetDistance();
        setActive(existing);
        return;
      }
      setErr(e?.response?.data?.message ?? 'Safarni boshlab bo‘lmadi. Internetni tekshiring.');
    } finally {
      setBusy(false);
    }
  };

  const finish = async () => {
    const cur = useOrderStore.getState().active;
    if (busy || !cur || cur.source !== 'street' || cur.status !== 'IN_PROGRESS') return;
    const id = cur.id;
    const km = useOrderStore.getState().trackedDistanceKm;
    const est = tariff
      ? computeFare(km, tariff) + waitFeeFor(liveWaitSec(cur, serverNow()), tariff)
      : null;
    const ok = confirm(
      `Safarni tugatasizmi?${est != null ? `\nNarx: ${fmtSum(est)} so‘m` : ''}\nMasofa: ${km.toFixed(2)} km`,
    );
    if (!ok) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post(`/driver/orders/${id}/complete`, {
        distanceKm: Number(Math.min(km, 500).toFixed(3)),
      });
      patchActive(id, { ...orderFields(data), status: 'COMPLETED', waitStartedAt: null });
      api.get('/driver/me').then((r) => setDriver(r.data)).catch(() => {});
    } catch (e: any) {
      // The server may have finished it although the answer was lost.
      try {
        const { data: fresh } = await api.get(`/driver/orders/${id}`);
        if (fresh?.id === id && fresh.status && fresh.status !== 'IN_PROGRESS') {
          patchActive(id, { ...orderFields(fresh), waitStartedAt: null });
          return;
        }
      } catch {
        /* show the error */
      }
      setErr(e?.response?.data?.message ?? 'Yakunlab bo‘lmadi. Internetni tekshiring.');
    } finally {
      setBusy(false);
    }
  };

  const newClient = () => {
    setErr(null);
    resetDistance();
    setActive(null);
  };

  const goHome = () => {
    resetDistance();
    setActive(null);
    router.replace('/dashboard');
  };

  // ---- screens ---------------------------------------------------------------

  if (driver?.kind === 'courier') {
    return (
      <Blocked text="Taksometr faqat taksi haydovchilari uchun." href="/dashboard" cta="Bosh sahifa" />
    );
  }
  if (!ride && otherOrder) {
    return (
      <Blocked
        text="Sizda faol buyurtma bor — avval uni yakunlang."
        href="/order/active"
        cta="Faol buyurtmaga o‘tish"
      />
    );
  }
  if (!ride && otherDelivery) {
    return (
      <Blocked
        text="Sizda faol yetkazish bor — avval uni yakunlang."
        href="/delivery/active"
        cta="Yetkazishga o‘tish"
      />
    );
  }

  const status = ride?.status;
  const running = status === 'IN_PROGRESS';
  const done = status === 'COMPLETED';
  const cancelled = status === 'CANCELLED';

  // Live meter (same formula as the server: distance fare + waiting fee).
  const waitSec = ride ? liveWaitSec(ride, now) : 0;
  const waitFee = waitFeeFor(waitSec, tariff);
  const distanceFare = tariff ? computeFare(trackedKm, tariff) : 0;
  const total = distanceFare + waitFee;
  const startedMs = ride?.startedAt
    ? new Date(ride.startedAt).getTime()
    : ride?.createdAt
      ? new Date(ride.createdAt).getTime()
      : null;
  const rideSec = startedMs ? Math.max(0, (now - startedMs) / 1000) : 0;
  const gpsBad = running && (gpsStatus === 'denied' || gpsStatus === 'unavailable');

  const pill = running
    ? ride?.waitStartedAt
      ? 'Kutish'
      : 'Safarda'
    : done
      ? 'Yakunlandi'
      : cancelled
        ? 'Bekor qilindi'
        : 'Bo‘sh';

  return (
    <>
      {/* HERO: the meter itself */}
      <header className="relative bg-ink text-white px-5 pt-7 pb-6 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 100% 0%, rgba(59,155,255,0.5), transparent 60%)',
          }}
        />
        <div className="relative flex items-center justify-between gap-3">
          <Link
            href="/dashboard"
            aria-label="Bosh sahifa"
            className="w-9 h-9 rounded-full bg-white/10 ring-1 ring-white/15 flex items-center justify-center active:scale-95 shrink-0"
          >
            <ArrowLeft size={16} />
          </Link>
          <p className="flex-1 text-sm font-bold tracking-wide flex items-center gap-2">
            <CarTaxiFront size={18} className="text-gold" /> Taksometr
          </p>
          <span
            className={
              'text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full font-bold shrink-0 ' +
              (cancelled
                ? 'bg-red-600 text-white'
                : running && ride?.waitStartedAt
                  ? 'bg-orange-400 text-ink'
                  : 'bg-gold text-ink')
            }
          >
            {pill}
          </span>
        </div>

        {running && (
          <div className="relative mt-6 text-center">
            <p className="text-[10px] uppercase tracking-widest text-gold font-bold">Yo‘l haqi</p>
            <p className="mt-1 text-6xl font-extrabold tabular-nums leading-none">
              {tariff ? fmtSum(total) : '—'}
            </p>
            <p className="mt-1 text-sm text-neutral-400">so‘m</p>
            {tariff && (
              <p className="mt-2 text-xs text-neutral-400 tabular-nums">
                Yo‘l {fmtSum(distanceFare)} + kutish {fmtSum(waitFee)}
              </p>
            )}
            <div className="mt-5 grid grid-cols-3 gap-2">
              <Stat label="Masofa" value={trackedKm.toFixed(2)} unit="km" />
              <Stat label="Safar vaqti" value={fmtClock(rideSec)} />
              <Stat label="Kutish" value={fmtClock(waitSec)} highlight={!!ride?.waitStartedAt} />
            </div>
          </div>
        )}

        {!ride || (!running && !done && !cancelled) ? (
          <p className="relative mt-5 text-sm text-neutral-300 leading-relaxed">
            Ko‘chadan olingan yo‘lovchi uchun (bot yoki ilovadan emas). Mijoz mashinaga
            o‘tirgach <b className="text-white">“Klient oldim”</b> ni bosing — narx GPS masofa va
            kutish vaqti bo‘yicha hisoblanadi.
          </p>
        ) : null}
      </header>

      {/* RUNNING: waiting (time + cost) with the toggle */}
      {running && ride && (
        <section className="px-6 mt-4 space-y-3">
          {gpsBad && (
            <div className="rounded-xl px-3 py-2.5 text-xs font-medium flex items-start gap-2 border bg-orange-50 text-orange-800 border-orange-200">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>
                {gpsStatus === 'denied'
                  ? 'Joylashuvga ruxsat berilmagan — masofa hisoblanmayapti.'
                  : 'GPS signali yo‘q — masofa hisoblanmayapti. GPS yoqilganini tekshiring.'}
              </span>
            </div>
          )}
          <WaitPanel
            title="Kutish"
            seconds={waitSec}
            fee={waitFee}
            tariff={tariff}
            counting={isWaitCounting(ride)}
            moving={!!ride.waitMoving}
            toggle={{
              running: !!ride.waitStartedAt,
              pending: waitPending,
              onToggle: () => void toggleWait(),
            }}
          />
          {tariff && (
            <p className="text-[11px] text-neutral-500 text-center">
              Komissiya: {fmtSum(commissionFor(total, tariff))} so‘m
            </p>
          )}
        </section>
      )}

      {/* DONE: summary */}
      {done && ride && <Summary ride={ride} />}

      {cancelled && (
        <section className="px-6 mt-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <XCircle size={28} className="mx-auto text-red-600 mb-2" />
            <p className="text-base font-bold text-red-700">Safar bekor qilindi</p>
            <p className="text-xs text-red-700/80 mt-1">Administrator tomonidan bekor qilingan.</p>
          </div>
        </section>
      )}

      {err && <p className="px-6 mt-3 text-sm text-red-600">{err}</p>}

      {/* THE main button */}
      <section className="px-6 mt-6 mb-4 space-y-3">
        {!ride && (
          <MainButton onClick={start} busy={busy} icon={<UserPlus size={26} strokeWidth={2.4} />}>
            Klient oldim
          </MainButton>
        )}
        {running && (
          <MainButton
            onClick={finish}
            busy={busy}
            dark
            icon={<Flag size={24} strokeWidth={2.4} />}
          >
            Safarni tugatish
          </MainButton>
        )}
        {(done || cancelled) && (
          <>
            <MainButton onClick={newClient} icon={<UserPlus size={26} strokeWidth={2.4} />}>
              Yangi mijoz
            </MainButton>
            <button
              type="button"
              onClick={goHome}
              className="w-full h-12 rounded-2xl border border-line bg-white text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98]"
            >
              <Home size={16} /> Bosh sahifa
            </button>
          </>
        )}
        {!ride && tariff && <TariffLine tariff={tariff} />}
      </section>
    </>
  );
}

function Stat({
  label,
  value,
  unit,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        'rounded-xl px-2 py-2.5 ring-1 ' +
        (highlight ? 'bg-orange-400/15 ring-orange-400/40' : 'bg-white/5 ring-white/10')
      }
    >
      <p className="text-[9px] uppercase tracking-widest text-neutral-400 font-bold">{label}</p>
      <p className="mt-1 text-lg font-extrabold tabular-nums leading-none">
        {value}
        {unit && <span className="ml-1 text-[10px] font-medium text-neutral-400">{unit}</span>}
      </p>
    </div>
  );
}

function MainButton({
  onClick,
  busy,
  dark,
  icon,
  children,
}: {
  onClick: () => void;
  busy?: boolean;
  dark?: boolean;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-busy={busy}
      className={
        'w-full h-20 rounded-2xl text-xl font-extrabold flex items-center justify-center gap-3 shadow-lg active:scale-[0.98] disabled:opacity-70 select-none touch-manipulation ' +
        (dark ? 'bg-ink text-gold shadow-black/30' : 'bg-gold text-ink shadow-gold/40')
      }
    >
      {busy ? <Loader2 size={24} className="animate-spin" /> : icon}
      {children}
    </button>
  );
}

function Summary({ ride }: { ride: OrderModel }) {
  const price = Number(ride.price ?? 0);
  const commission = Number(ride.commission ?? 0);
  const waitingFee = Number(ride.waitingFee ?? 0);
  return (
    <section className="px-6 mt-4">
      <div className="bg-white border-2 border-gold rounded-2xl p-5">
        <div className="flex items-center gap-2 mb-3">
          <CheckCircle2 size={20} className="text-gold-deep" />
          <p className="text-base font-bold">Safar yakunlandi</p>
        </div>
        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
          Mijozdan olinadi (naqd)
        </p>
        <p className="mt-1 text-5xl font-extrabold tabular-nums leading-none text-ink">
          {fmtSum(price)}
          <span className="ml-2 text-base font-semibold text-neutral-500">so‘m</span>
        </p>
        <div className="mt-4 border-t border-line pt-2">
          <Row label="Masofa" value={`${Number(ride.distanceKm ?? 0).toFixed(2)} km`} />
          <Row
            label={`Kutish (${fmtClock(Number(ride.waitingSeconds ?? 0))})`}
            value={`${fmtSum(waitingFee)} so‘m`}
          />
          <Row label="Komissiya" value={`-${fmtSum(commission)} so‘m`} />
        </div>
        <div className="border-t border-line pt-2 mt-2">
          <Row label="Sof daromad" value={`+${fmtSum(price - commission)} so‘m`} bold />
        </div>
      </div>
    </section>
  );
}

function Row({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between py-1">
      <span className="text-sm text-neutral-500">{label}</span>
      <span className={'text-sm tabular-nums ' + (bold ? 'font-bold text-ink' : 'font-medium')}>
        {value}
      </span>
    </div>
  );
}

function Blocked({ text, href, cta }: { text: string; href: string; cta: string }) {
  return (
    <div className="px-6 pt-16 text-center">
      <CarTaxiFront size={32} className="mx-auto text-gold mb-3" />
      <p className="text-sm text-neutral-600 mb-6">{text}</p>
      <Link
        href={href}
        className="inline-flex items-center gap-1 h-11 px-6 rounded-xl bg-gold text-ink text-sm font-bold"
      >
        {cta} <ChevronRight size={16} />
      </Link>
    </div>
  );
}
