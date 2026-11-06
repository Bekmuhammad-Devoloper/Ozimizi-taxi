'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Image from 'next/image';
import {
  Phone,
  XCircle,
  Car,
  Crown,
  Receipt,
  Gift,
  RotateCcw,
  Clock,
  ExternalLink,
  ChevronLeft,
  Loader2,
  CheckCircle2,
  Ban,
  Hourglass,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { MapView } from '@/components/MapView';
import { StatusSteps } from '@/components/StatusSteps';
import { OrderChat } from '@/components/OrderChat';
import { api, API_BASE, errMsg } from '@/lib/api';
import { assetUrl } from '@/lib/asset';
import { fmtDateTime } from '@/lib/date';
import { money, STATUS_HINT, STATUS_LABEL } from '@/lib/status';
import { useOrderStore, isActiveStatus, ClientOrder } from '@/stores/order';
import { useAuthStore } from '@/stores/auth';
import { cn } from '@/lib/cn';

/** GET /client/tariff — only the waiting part is needed here. */
interface WaitTariff {
  waitingFreeMinutes: number;
  waitingPricePerMinute: number;
}

/** Re-read the order this often while the waiting meter matters (server corrects for driving). */
const WAIT_POLL_MS = 30_000;

export default function OrderPage() {
  const active = useOrderStore((s) => s.active);
  const { id } = useParams<{ id: string }>();
  const live = !!active && active.id === id && isActiveStatus(active.status);
  return (
    <Shell full={live}>
      <OrderInner />
    </Shell>
  );
}

function OrderInner() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const active = useOrderStore((s) => s.active);
  const setActive = useOrderStore((s) => s.setActive);
  const driverPos = useOrderStore((s) => s.driverPos);
  const [order, setOrder] = useState<ClientOrder | null>(active && active.id === id ? active : null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [tariff, setTariff] = useState<WaitTariff | null>(null);
  const [vh, setVh] = useState(844);
  useEffect(() => {
    const set = () => setVh(window.innerHeight);
    set();
    window.addEventListener('resize', set);
    return () => window.removeEventListener('resize', set);
  }, []);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get<ClientOrder>(`/client/orders/${id}`);
      setOrder(data);
      if (isActiveStatus(data.status) || (active && active.id === id)) setActive(data);
    } catch (e) {
      setErr(errMsg(e, 'Buyurtma topilmadi'));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    api
      .get<WaitTariff>('/client/tariff')
      .then((r) =>
        setTariff({
          waitingFreeMinutes: Number(r.data?.waitingFreeMinutes ?? 0),
          waitingPricePerMinute: Number(r.data?.waitingPricePerMinute ?? 0),
        }),
      )
      .catch(() => {});
  }, []);
  // While the waiting meter runs, refresh the authoritative count now and then.
  const meterOn = !!order && (order.status === 'ARRIVED' || (order.status === 'IN_PROGRESS' && !!order.waitRunning));
  useEffect(() => {
    if (!meterOn) return;
    const t = window.setInterval(() => void load(), WAIT_POLL_MS);
    return () => window.clearInterval(t);
  }, [meterOn, load]);
  useEffect(() => {
    if (active && active.id === id) setOrder(active);
  }, [active, id]);
  useEffect(() => {
    const h = () => void load();
    const onVis = () => {
      if (document.visibilityState === 'visible') void load();
    };
    window.addEventListener('bonus-decided', h);
    document.addEventListener('visibilitychange', onVis);
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      window.removeEventListener('bonus-decided', h);
      document.removeEventListener('visibilitychange', onVis);
      clearInterval(t);
    };
  }, [load]);

  const cancel = async () => {
    if (!order) return;
    const warn =
      order.status === 'ARRIVED'
        ? 'Haydovchi allaqachon yetib kelgan. Bekor qilsangiz bonus balansingizdan jarima yechilishi mumkin. Davom etasizmi?'
        : 'Buyurtma bekor qilinsinmi?';
    if (!confirm(warn)) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post<ClientOrder>(`/client/orders/${order.id}/cancel`);
      setOrder(data);
      setActive(data);
    } catch (e) {
      setErr(errMsg(e, 'Bekor qilib bo‘lmadi'));
    } finally {
      setBusy(false);
    }
  };

  if (!order) {
    return (
      <div className="p-6 pt-16 flex flex-col items-center text-center text-sm text-neutral-500">
        {err ? (
          <>
            <Ban size={28} className="text-neutral-300 mb-2" />
            {err}
            <button onClick={() => router.push('/home')} className="mt-4 h-11 px-5 rounded-xl bg-ink text-gold font-bold">
              Asosiyga qaytish
            </button>
          </>
        ) : (
          <>
            <Loader2 size={24} className="animate-spin mb-2" /> Yuklanmoqda…
          </>
        )}
      </div>
    );
  }

  const d = order.driver;
  const live = isActiveStatus(order.status);
  const driverLatLng = driverPos ?? (d?.lat != null && d?.lng != null ? { lat: d.lat, lng: d.lng } : null);
  const showDriver = live && order.status !== 'PENDING' && driverLatLng;
  const cashDue = Math.max(0, Number(order.price ?? 0) - Number(order.discount ?? 0) - Number(order.bonusUsed ?? 0));
  const waitedSec = Math.max(0, Math.floor((now - new Date(order.createdAt).getTime()) / 1000));

  // ---------- live: map + sheet ----------
  if (live) {
    return (
      <div className="relative h-full">
        <MapView
          center={{ lat: order.pickupLat, lng: order.pickupLng }}
          zoom={15}
          pickup={{ lat: order.pickupLat, lng: order.pickupLng }}
          pulse={order.status === 'PENDING'}
          dest={order.destinationLat != null && order.destinationLng != null ? { lat: order.destinationLat, lng: order.destinationLng } : null}
          driver={showDriver ? driverLatLng : null}
          follow={order.status === 'IN_PROGRESS' && driverLatLng ? driverLatLng : null}
          padBottom={Math.round(vh * 0.66)}
          offsetY={Math.round(vh * 0.2)}
          className="absolute inset-0 z-0"
        />

        {/* top overlay */}
        <div className="absolute top-0 inset-x-0 z-10 safe-top px-4 pt-3 flex items-center gap-3 pointer-events-none">
          <button
            onClick={() => router.push('/home')}
            className="pointer-events-auto w-11 h-11 rounded-2xl bg-white/95 backdrop-blur shadow-lg flex items-center justify-center text-ink active:scale-95 transition"
          >
            <ChevronLeft size={22} />
          </button>
          <div className="pointer-events-auto flex-1 h-11 rounded-2xl bg-ink/90 backdrop-blur text-white px-4 flex items-center gap-2 shadow-lg">
            {order.status === 'PENDING' ? (
              <Loader2 size={16} className="animate-spin text-gold shrink-0" />
            ) : (
              <span className="w-2 h-2 rounded-full bg-gold animate-pulse shrink-0" />
            )}
            <span className="font-bold text-sm truncate">{STATUS_LABEL[order.status]}</span>
            {order.etaMinutes != null && (order.status === 'ACCEPTED' || order.status === 'ON_THE_WAY') && (
              <span className="ml-auto text-xs font-bold text-gold whitespace-nowrap">~{order.etaMinutes} daq</span>
            )}
          </div>
        </div>

        {/* sheet */}
        <div
          className="absolute inset-x-0 bottom-0 z-20 max-h-[64%] flex flex-col rounded-t-[2rem] bg-paper shadow-[0_-12px_40px_rgba(0,0,0,.18)] animate-in slide-in-from-bottom-6 duration-500"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 5.75rem)' }}
        >
          <div className="mx-auto w-10 h-1 rounded-full bg-neutral-300 mt-3 shrink-0" />
          <div className="overflow-y-auto no-scrollbar px-5 pt-3 pb-2 space-y-4">
            <div>
              <h1 className="text-xl font-extrabold">{STATUS_LABEL[order.status]}</h1>
              <p className="mt-0.5 text-sm text-neutral-500 leading-snug">{STATUS_HINT[order.status]}</p>
            </div>
            <StatusSteps status={order.status} />

            {order.status === 'PENDING' && (
              <div className="rounded-2xl bg-ink text-white p-4 flex items-center gap-3">
                <span className="relative w-11 h-11 rounded-xl bg-gold/15 flex items-center justify-center shrink-0">
                  <Car size={20} className="text-gold" />
                  <span className="absolute inset-0 rounded-xl ring-2 ring-gold/60 animate-ping" />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-bold">Yaqin haydovchilarga yuborildi</p>
                  <p className="text-xs text-neutral-400">Odatda 1 daqiqa ichida topiladi</p>
                </div>
                <span className="font-mono text-sm text-gold tabular-nums">
                  {String(Math.floor(waitedSec / 60)).padStart(2, '0')}:{String(waitedSec % 60).padStart(2, '0')}
                </span>
              </div>
            )}

            {(order.status === 'ARRIVED' || (order.status === 'IN_PROGRESS' && (order.waitRunning || Number(order.waitingSeconds ?? 0) > 0))) && (
              <WaitingCard order={order} tariff={tariff} now={now} />
            )}

            {d && <DriverCard d={d} order={order} />}

            {order.status !== 'PENDING' && d && (
              <div className="-mx-5">
                <OrderChat orderId={order.id} enabled driverName={d.fullName.split(' ')[0]} />
              </div>
            )}

            <div className="relative rounded-2xl border border-line bg-white px-3.5 py-2.5 text-sm">
              <span aria-hidden className="absolute left-[21px] top-6 bottom-6 w-0.5 bg-neutral-200" />
              <p className="flex items-start gap-2.5 py-1">
                <span className="mt-1 w-4 h-4 rounded-full bg-ink flex items-center justify-center shrink-0 relative z-10">
                  <span className="w-1.5 h-1.5 rounded-full bg-gold" />
                </span>
                <span className="line-clamp-2">{order.pickupAddress ?? `${order.pickupLat.toFixed(5)}, ${order.pickupLng.toFixed(5)}`}</span>
              </p>
              <p className="flex items-start gap-2.5 py-1">
                <span className="mt-0.5 w-4 h-4 rounded bg-gold text-[9px] font-extrabold flex items-center justify-center shrink-0 relative z-10">B</span>
                <span className={'line-clamp-2 ' + (order.destinationAddress ? '' : 'text-neutral-400')}>
                  {order.destinationAddress ?? 'Manzil ko‘rsatilmagan — haydovchiga aytasiz'}
                </span>
              </p>
            </div>

            {err && <p className="text-sm text-red-600">{err}</p>}

            {order.status !== 'IN_PROGRESS' && (
              <button
                onClick={() => void cancel()}
                disabled={busy}
                className="w-full h-12 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-bold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition"
              >
                <XCircle size={18} /> Bekor qilish
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ---------- finished ----------
  const done = order.status === 'COMPLETED';
  return (
    <div className="animate-in fade-in duration-300">
      <header className="bg-ink text-white px-5 pt-10 pb-8 rounded-b-[2rem] relative overflow-hidden">
        <div aria-hidden className={'absolute -right-12 -top-12 w-56 h-56 rounded-full blur-3xl ' + (done ? 'bg-emerald-400/30' : 'bg-red-400/25')} />
        <button onClick={() => router.push('/home')} className="relative text-sm text-neutral-300 flex items-center gap-1 mb-4">
          <ChevronLeft size={16} /> Asosiy
        </button>
        <div className="relative flex items-center gap-4">
          <span className={'w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ' + (done ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300')}>
            {done ? <CheckCircle2 size={28} /> : <Ban size={28} />}
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">Buyurtma #{order.id.slice(0, 8).toUpperCase()}</p>
            <h1 className="text-2xl font-extrabold">{STATUS_LABEL[order.status]}</h1>
            <p className="text-sm text-neutral-300">{fmtDateTime(order.completedAt ?? order.cancelledAt ?? order.createdAt)}</p>
          </div>
        </div>
      </header>

      {d && (
        <section className="px-5 mt-4">
          <DriverCard d={d} order={order} />
        </section>
      )}

      {done && <Completed order={order} cashDue={cashDue} onRefresh={load} />}

      {order.status === 'CANCELLED' && (
        <section className="px-5 mt-4">
          <div className="rounded-2xl border border-line bg-white p-4 text-sm">
            <p className="font-bold">Buyurtma bekor qilindi</p>
            {Number(order.cancelPenalty ?? 0) > 0 ? (
              <p className="mt-1 text-red-600">Haydovchi yetib kelgan edi — bonus balansingizdan {money(order.cancelPenalty)} so‘m jarima yechildi.</p>
            ) : (
              <p className="mt-1 text-neutral-500">Jarima yo‘q.</p>
            )}
          </div>
        </section>
      )}

      {err && <p className="px-5 mt-3 text-sm text-red-600">{err}</p>}

      <section className="px-5 mt-5">
        <button
          onClick={() => router.push('/home')}
          className="w-full h-14 rounded-2xl bg-ink text-gold font-extrabold flex items-center justify-center gap-2 shadow-[0_12px_30px_-10px_rgba(0,0,0,.6)] active:scale-[0.98] transition"
        >
          <RotateCcw size={18} /> Yana taksi chaqirish
        </button>
      </section>
    </div>
  );
}

/** Live waiting meter: seconds so far + the running tail since the last server tick, priced by the tariff. */
function WaitingCard({ order, tariff, now }: { order: ClientOrder; tariff: WaitTariff | null; now: number }) {
  const base = Math.max(0, Number(order.waitingSeconds ?? 0));
  const tick = order.waitTickAt ? new Date(order.waitTickAt).getTime() : NaN;
  const running = !!order.waitRunning;
  const sec = Math.floor(base + (running && Number.isFinite(tick) ? Math.max(0, (now - tick) / 1000) : 0));
  const freeMin = Math.max(0, tariff?.waitingFreeMinutes ?? 0);
  const perMin = Math.max(0, tariff?.waitingPricePerMinute ?? 0);
  // Same rule as the server at the end of the ride: whole minutes beyond the free ones.
  const billable = Math.max(0, Math.ceil(sec / 60 - freeMin));
  const fee = Math.max(billable * perMin, Number(order.waitingFee ?? 0) || 0);
  const freeLeft = Math.max(0, Math.ceil(freeMin * 60 - sec));
  const inFree = !!tariff && freeLeft > 0;
  const paid = fee > 0;
  const arrived = order.status === 'ARRIVED';

  return (
    <div className={cn('rounded-2xl p-4 border', paid ? 'bg-ink text-white border-ink' : 'bg-white border-line shadow-sm')}>
      <div className="flex items-center gap-3">
        <span className={cn('relative w-11 h-11 rounded-xl flex items-center justify-center shrink-0', paid ? 'bg-gold/15 text-gold' : 'bg-gold/15 text-gold-deep')}>
          <Hourglass size={20} className={running ? 'animate-pulse' : ''} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold leading-tight">{arrived ? 'Haydovchi kutmoqda' : running ? 'Kutish (to‘xtash)' : 'Kutish vaqti'}</p>
          <p className={cn('text-xs leading-snug', paid ? 'text-neutral-400' : 'text-neutral-500')}>
            {!running && !arrived
              ? 'Hozir hisoblanmayapti · yakuniy narxga qo‘shiladi'
              : !tariff
                ? 'Kutish vaqti hisoblanmoqda'
                : perMin === 0
                  ? 'Kutish bepul'
                  : inFree
                    ? `Bepul kutish: yana ${fmtClock(freeLeft)}`
                    : `${money(perMin)} so‘m / daqiqa`}
          </p>
        </div>
        <span className={cn('font-mono text-2xl font-extrabold tabular-nums', paid ? 'text-gold' : 'text-ink')}>{fmtClock(sec)}</span>
      </div>
      {tariff && perMin > 0 && freeMin > 0 && (
        <div className={cn('mt-3 h-1.5 rounded-full overflow-hidden', paid ? 'bg-white/10' : 'bg-neutral-100')}>
          <div
            className={cn('h-full rounded-full transition-[width] duration-1000', inFree ? 'bg-gold' : 'bg-red-400')}
            style={{ width: `${Math.min(100, (sec / (freeMin * 60)) * 100)}%` }}
          />
        </div>
      )}
      {tariff && perMin > 0 && (
        <div className={cn('mt-3 flex items-center justify-between text-sm', paid ? 'text-neutral-300' : 'text-neutral-500')}>
          <span>{freeMin > 0 ? `Birinchi ${freeMin} daqiqa bepul` : 'Kutish haqi'}</span>
          <span className={cn('font-extrabold tabular-nums', paid ? 'text-gold text-base' : 'text-ink')}>{paid ? `+ ${money(fee)} so‘m` : '0 so‘m'}</span>
        </div>
      )}
    </div>
  );
}

function fmtClock(total: number) {
  const s = Math.max(0, Math.floor(total));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${ss}` : `${String(m).padStart(2, '0')}:${ss}`;
}

function DriverCard({ d, order }: { d: NonNullable<ClientOrder['driver']>; order: ClientOrder }) {
  const live = isActiveStatus(order.status);
  const car = [d.carModel, d.carColor].filter(Boolean).join(', ');
  return (
    <div className="rounded-2xl border border-line bg-white overflow-hidden shadow-sm">
      <div className="p-4 flex items-center gap-3">
        <span className="w-14 h-14 rounded-2xl bg-neutral-100 flex items-center justify-center shrink-0 overflow-hidden">
          {d.carPhotoUrl ? (
            <Image src={assetUrl(d.carPhotoUrl)} alt="" width={56} height={56} className="w-full h-full object-cover" />
          ) : d.avatarUrl ? (
            <Image src={assetUrl(d.avatarUrl)} alt="" width={56} height={56} className="w-full h-full object-cover" />
          ) : (
            <Car size={24} className="text-neutral-400" />
          )}
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-extrabold truncate flex items-center gap-1.5">
            {d.fullName}
            {d.isBranded && <Crown size={14} className="text-gold-deep" />}
          </p>
          <p className="text-sm text-neutral-600 truncate">{car || 'Mashina'}</p>
          {d.carPlate && (
            <span className="inline-block mt-1 font-mono text-[13px] font-bold bg-neutral-100 border border-line rounded-md px-1.5 py-0.5 tracking-wide">
              {d.carPlate}
            </span>
          )}
        </div>
        {live && (
          <a href={`tel:${d.phone}`} className="w-12 h-12 rounded-2xl bg-gold text-ink flex items-center justify-center shrink-0 shadow-[0_8px_20px_-8px_rgba(59,155,255,.9)] active:scale-95 transition">
            <Phone size={20} />
          </a>
        )}
      </div>
      {order.etaMinutes != null && (order.status === 'ACCEPTED' || order.status === 'ON_THE_WAY') && (
        <p className="px-4 pb-3 text-sm text-neutral-600 flex items-center gap-1.5">
          <Clock size={14} className="text-gold-deep" /> Taxminan <b>{order.etaMinutes} daqiqada</b> yetib keladi
        </p>
      )}
    </div>
  );
}

function Completed({ order, cashDue, onRefresh }: { order: ClientOrder; cashDue: number; onRefresh: () => Promise<void> }) {
  const client = useAuthStore((s) => s.client);
  const setClient = useAuthStore((s) => s.setClient);
  const [max, setMax] = useState<number | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api
      .get(`/client/orders/${order.id}/bonus-max`)
      .then((r) => {
        setMax(Number(r.data?.max ?? 0));
        setNote(r.data?.promoNote ?? null);
        if (r.data?.max > 0) setAmount(String(r.data.max));
      })
      .catch(() => setMax(0));
  }, [order.id, order.bonusUsed]);

  useEffect(() => {
    const h = (e: Event) => {
      const p = (e as CustomEvent).detail;
      if (p?.orderId !== order.id) return;
      setSent(false);
      void onRefresh();
      api.get('/client/me').then((r) => setClient(r.data)).catch(() => {});
    };
    window.addEventListener('bonus-decided', h);
    return () => window.removeEventListener('bonus-decided', h);
  }, [order.id, onRefresh, setClient]);

  const pay = async () => {
    const a = Number(amount.replace(/\D/g, ''));
    if (!a) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/client/orders/${order.id}/bonus`, { amount: a });
      setSent(true);
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const duration =
    order.acceptedAt && order.completedAt
      ? Math.max(1, Math.round((new Date(order.completedAt).getTime() - new Date(order.acceptedAt).getTime()) / 60000))
      : null;

  return (
    <>
      <section className="px-5 mt-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold flex items-center gap-1.5">
              <Receipt size={12} /> Safar cheki
            </p>
            {order.receiptNo && <span className="text-xs font-mono font-bold text-neutral-500">№ {order.receiptNo}</span>}
          </div>
          <dl className="mt-2 text-sm divide-y divide-dashed divide-neutral-200">
            <Row k="Qayerdan" v={order.pickupAddress ?? '—'} />
            {order.destinationAddress && <Row k="Qayerga" v={order.destinationAddress} />}
            <Row k="Masofa" v={`${Number(order.distanceKm ?? 0).toFixed(1)} km`} />
            {duration != null && <Row k="Davomiylik" v={`${duration} daqiqa`} />}
            {(order.waitingMinutes ?? 0) > 0 && <Row k={`Kutish (${order.waitingMinutes} daq)`} v={`${money(order.waitingFee)} so‘m`} />}
            {Number((order as any).outsideFee ?? 0) > 0 && (
              <Row
                k={`Hududdan tashqari (${Number((order as any).outsideKm ?? 0).toFixed(1)} km)`}
                v={`${money((order as any).outsideFee)} so‘m`}
              />
            )}
            <Row k="Narx" v={`${money(order.price)} so‘m`} />
            {Number(order.discount ?? 0) > 0 && <Row k="Promo chegirma" v={`− ${money(order.discount)} so‘m`} />}
            {Number(order.bonusUsed ?? 0) > 0 && <Row k="Bonusdan to‘landi" v={`− ${money(order.bonusUsed)} so‘m`} />}
          </dl>
          <div className="mt-3 rounded-xl bg-gold/15 border border-gold/40 px-3 py-2.5 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-gold-deep">To‘lanadi</span>
            <span className="text-2xl font-extrabold tabular-nums">{money(cashDue)} so‘m</span>
          </div>
          <div className="mt-3 flex gap-2 text-sm">
            <a href={`${API_BASE}/uploads/receipts/${order.id}.png`} target="_blank" rel="noreferrer" className="flex-1 h-10 rounded-xl border border-line flex items-center justify-center gap-1.5 font-semibold active:bg-neutral-50">
              <Receipt size={14} /> Chek rasmi
            </a>
            <a href={`${origin}/receipt/${order.id}`} target="_blank" rel="noreferrer" className="flex-1 h-10 rounded-xl border border-line flex items-center justify-center gap-1.5 font-semibold active:bg-neutral-50">
              <ExternalLink size={14} /> Chek sahifasi
            </a>
          </div>
        </div>
      </section>

      {cashDue > 0 && (max ?? 0) > 0 && (
        <section className="px-5 mt-4">
          <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/20 to-gold/5 p-4">
            <p className="font-bold flex items-center gap-2">
              <Gift size={16} className="text-gold-deep" /> Bonusdan to‘lash
            </p>
            <p className="mt-1 text-xs text-neutral-600">
              Balansingiz <b>{money(client?.balance)} so‘m</b>. Bu safar uchun ko‘pi bilan <b>{money(max)} so‘m</b>. Haydovchi tasdiqlaydi.
            </p>
            {note && <p className="mt-1 text-[11px] text-neutral-500 whitespace-pre-line">🎟 {note}</p>}
            {sent ? (
              <p className="mt-3 text-sm font-semibold text-emerald-700 flex items-center gap-1.5">
                <Loader2 size={14} className="animate-spin" /> Haydovchiga yuborildi — tasdiqlashini kuting
              </p>
            ) : (
              <div className="mt-3 flex gap-2">
                <input value={amount} onChange={(e) => setAmount(e.target.value.replace(/\D/g, ''))} inputMode="numeric" className="input flex-1 tabular-nums font-bold" placeholder={String(max)} />
                <button onClick={() => void pay()} disabled={busy} className="h-12 px-5 rounded-lg bg-ink text-gold font-bold disabled:opacity-50 active:scale-[0.98]">
                  To‘lash
                </button>
              </div>
            )}
            {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
          </div>
        </section>
      )}
    </>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 py-1.5">
      <dt className="text-neutral-500 shrink-0">{k}</dt>
      <dd className="font-semibold text-right tabular-nums">{v}</dd>
    </div>
  );
}
