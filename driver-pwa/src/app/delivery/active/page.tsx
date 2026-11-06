'use client';
import { useCallback, useEffect, useState } from 'react';
import { MiniMap } from '@/components/MiniMap';
import { NavCard } from '@/components/NavCard';
import { useVoiceNav, VoiceNavView } from '@/hooks/useVoiceNav';
import { useRouter } from 'next/navigation';
import {
  Phone,
  MapPin,
  Navigation,
  CheckCircle2,
  Check,
  XCircle,
  ChefHat,
  PackageCheck,
  Undo2,
  MessageSquare,
  Clock,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtDateTime, fmtTime } from '@/lib/date';
import { openYandexNavigator } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import {
  DeliveryStatus,
  DeliveryView,
  isDeliveryLive,
  syncActiveDelivery,
  useDeliveryStore,
} from '@/stores/delivery';
import { FitText } from '@/components/FitText';

export default function ActiveDeliveryPage() {
  return (
    <Shell>
      <Inner />
    </Shell>
  );
}

function Inner() {
  const d = useDeliveryStore((s) => s.active);
  const setDelivery = useDeliveryStore((s) => s.setActive);
  const setDriver = useAuthStore((s) => s.setDriver);
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  const refresh = useCallback(
    () => syncActiveDelivery().finally(() => setLoading(false)),
    [],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Poll every 10 s while the delivery is in progress (the kitchen may mark
  // it ready, the client / admin may cancel it).
  const live = isDeliveryLive(d);
  useEffect(() => {
    if (!live) return;
    const t = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(t);
  }, [live, refresh]);

  // Socket `delivery_update` (see useDriverSocket) and returning to the app.
  useEffect(() => {
    const onUpdate = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    window.addEventListener('delivery-update', onUpdate);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('delivery-update', onUpdate);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  // Ticks the "ready in N min" estimate.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  // Voice directions: to the kitchen until the food is collected, then to the client.
  const stops = d?.group && d.group.length > 1 ? d.group : null;
  const collected = stops
    ? stops.every((g) => g.status === 'PICKED_UP' || g.status === 'DELIVERED')
    : d?.status === 'PICKED_UP';
  const nav = useVoiceNav(
    !d || !live
      ? null
      : collected
        ? { lat: Number(d.lat), lng: Number(d.lng) }
        : d.kitchen
          ? { lat: Number(d.kitchen.lat), lng: Number(d.kitchen.lng) }
          : null,
    'dest',
  );

  if (!d) {
    return (
      <div className="px-6 pt-16 text-center">
        {loading ? (
          <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
        ) : (
          <>
            <p className="text-sm text-neutral-500 mb-6">Faol yetkazish yo‘q.</p>
            <button
              onClick={() => router.replace('/dashboard')}
              className="h-11 px-6 border border-line rounded-xl text-sm font-semibold"
            >
              Bosh sahifa
            </button>
          </>
        )}
      </div>
    );
  }

  const finish = () => {
    setDelivery(null);
    router.replace('/dashboard');
  };

  // Several kitchens of one client: collect from each, then one hand-over.
  const group = d.group && d.group.length > 1 ? d.group : null;
  const sum = (k: 'total' | 'itemsTotal' | 'deliveryFee') =>
    group ? group.reduce((s, g) => s + Number(g[k] ?? 0), 0) : Number(d[k] ?? 0);
  const cashAll = sum('total');
  const itemsAll = sum('itemsTotal');
  const feeAll = sum('deliveryFee');
  const allPicked = group
    ? group.every((g) => g.status === 'PICKED_UP' || g.status === 'DELIVERED')
    : d.status === 'PICKED_UP';

  const act = async (path: 'picked-up' | 'delivered', id = d.id) => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post<DeliveryView>(`/driver/deliveries/${id}/${path}`);
      if (group && path === 'picked-up') {
        // The next kitchen becomes the current stop.
        await syncActiveDelivery();
        return;
      }
      setDelivery(
        group && path === 'delivered'
          ? { ...d, ...data, group: group.map((g) => ({ ...g, status: 'DELIVERED' as DeliveryStatus })) }
          : { ...d, ...data },
      );
      if (path === 'delivered') {
        api.get('/driver/me').then((r) => setDriver(r.data)).catch(() => {});
      }
    } catch (e: any) {
      // The server may have moved on (cancelled, or the response was lost).
      await syncActiveDelivery();
      setErr(e?.response?.data?.message ?? 'Xato');
    } finally {
      setBusy(false);
    }
  };

  const pickedUp = (stop: Pick<DeliveryView, 'id' | 'status'> = d) => {
    if (
      stop.status === 'COOKING' &&
      !confirm('Oshxona hali “tayyor” deb belgilamagan. Buyurtmani qo‘lingizga oldingizmi?')
    ) {
      return;
    }
    void act('picked-up', stop.id);
  };

  const delivered = () => {
    if (!confirm(`Buyurtma mijozga topshirildi va ${fmt(cashAll)} so‘m naqd olindimi?`)) return;
    void act('delivered');
  };

  const release = async () => {
    if (!confirm('Buyurtmani qaytarasizmi? U boshqa kuryerga taklif qilinadi.')) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/driver/deliveries/${d.id}/release`);
      setDelivery(null);
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Qaytarib bo‘lmadi');
      void syncActiveDelivery();
    } finally {
      setBusy(false);
    }
  };

  const picked = allPicked;
  const itemsCount = (d.items ?? []).reduce((s, i) => s + Number(i.qty ?? 0), 0);
  const commission = Number(d.courierCommission ?? 0);

  const header = (
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
            🍽 Yetkazish
          </p>
          <p className="text-base font-bold tracking-wider tabular-nums mt-0.5">
            #{d.number}
          </p>
        </div>
        <span
          className={
            'text-[11px] uppercase tracking-wider px-3 py-1.5 rounded-full font-bold shrink-0 ' +
            (d.status === 'CANCELLED' || d.status === 'REJECTED'
              ? 'bg-red-600 text-white'
              : 'bg-gold text-ink')
          }
        >
          {LABEL[d.status] ?? d.status}
        </span>
      </div>
      <StepProgress status={d.status} />
    </header>
  );

  // ---- cancelled -----------------------------------------------------------
  if (d.status === 'CANCELLED' || d.status === 'REJECTED') {
    return (
      <>
        {header}
        <section className="px-6 mt-4">
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-center">
            <XCircle size={28} className="mx-auto text-red-600 mb-2" />
            <p className="text-base font-bold text-red-700">Buyurtma bekor qilindi</p>
            <p className="text-xs text-red-700/80 mt-1">
              #{d.number}
              {d.kitchen?.name ? ` · ${d.kitchen.name}` : ''}
              {d.cancelledBy === 'client'
                ? ' · mijoz bekor qildi'
                : d.cancelledBy === 'admin'
                  ? ' · administrator bekor qildi'
                  : ''}
            </p>
            {d.pickedUpAt && (
              <p className="text-xs text-red-700 mt-3 font-semibold">
                Buyurtmani oshxonaga qaytaring yoki administrator bilan bog‘laning.
              </p>
            )}
          </div>
        </section>
        <section className="px-6 mt-6 mb-4">
          <PrimaryAction
            icon={<Check size={18} strokeWidth={2.4} />}
            onClick={finish}
            label="Bosh sahifa"
          />
        </section>
      </>
    );
  }

  // ---- delivered -----------------------------------------------------------
  if (d.status === 'DELIVERED') {
    return (
      <>
        {header}
        <section className="px-6 mt-4">
          <div className="bg-white border-2 border-gold rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-3">
              <CheckCircle2 size={20} className="text-gold-deep" />
              <p className="text-base font-bold">Yetkazildi</p>
            </div>
            <SummaryRow label="Mijozdan olingan naqd" value={`${fmt(cashAll)} so‘m`} bold />
            <SummaryRow label="Taomlar" value={`${fmt(itemsAll)} so‘m`} />
            <SummaryRow label="Yetkazish haqi" value={`${fmt(feeAll)} so‘m`} />
            <SummaryRow label="Komissiya" value={`-${fmt(commission)} so‘m`} />
            <div className="border-t border-line pt-2 mt-2">
              <SummaryRow
                label="Sof daromad"
                value={`+${fmt(feeAll - commission)} so‘m`}
                bold
              />
            </div>
            {d.deliveredAt && (
              <p className="mt-2 text-xs text-neutral-500">{fmtDateTime(d.deliveredAt)}</p>
            )}
          </div>
        </section>
        <section className="px-6 mt-6 mb-4">
          <PrimaryAction
            icon={<Check size={18} strokeWidth={2.4} />}
            onClick={finish}
            label="Bosh sahifa"
          />
        </section>
      </>
    );
  }

  // ---- in progress ---------------------------------------------------------
  const kitchenCard = d.kitchen && (
    <section className="px-6 mt-4">
      <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 flex items-start gap-3">
          <span className="w-11 h-11 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
            <ChefHat size={18} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Oshxona
            </p>
            <p className="text-sm font-bold leading-snug">{d.kitchen.name}</p>
            {d.kitchen.address && (
              <p className="text-xs text-neutral-600 mt-0.5 leading-snug">{d.kitchen.address}</p>
            )}
          </div>
          {d.kitchen.phone && (
            <a
              href={`tel:${d.kitchen.phone}`}
              className="w-11 h-11 rounded-full bg-gold text-ink flex items-center justify-center shadow-md shadow-gold/40 active:scale-95 shrink-0"
              aria-label="Oshxonaga qo‘ng‘iroq"
            >
              <Phone size={18} strokeWidth={2.4} />
            </a>
          )}
        </div>
        <KitchenStatus d={d} now={now} />
        {!picked && (
          <NavButton lat={d.kitchen.lat} lng={d.kitchen.lng} label="Oshxonaga yo‘l ko‘rsatish" />
        )}
        {!picked && <MapFrame lat={d.kitchen.lat} lng={d.kitchen.lng} nav={nav} />}
      </div>
    </section>
  );

  const clientCard = (
    <section className="px-6 mt-4">
      <div className="bg-white border border-line rounded-2xl overflow-hidden shadow-sm">
        <div className="px-4 py-3 flex items-center gap-3 border-b border-line">
          <div className="w-11 h-11 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold text-lg shrink-0">
            {d.clientName?.[0]?.toUpperCase() ?? 'M'}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Mijoz
            </p>
            <p className="text-sm font-bold truncate">{d.clientName || 'Mijoz'}</p>
            {d.phone && <p className="text-xs text-neutral-500">{d.phone}</p>}
          </div>
          {d.phone && (
            <a
              href={`tel:${d.phone}`}
              className="w-11 h-11 rounded-full bg-gold text-ink flex items-center justify-center shadow-md shadow-gold/40 active:scale-95 shrink-0"
              aria-label="Mijozga qo‘ng‘iroq"
            >
              <Phone size={18} strokeWidth={2.4} />
            </a>
          )}
        </div>
        <div className="px-4 py-3 flex items-start gap-2">
          <MapPin size={16} className="text-gold-deep mt-0.5 shrink-0" strokeWidth={2.2} />
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
              Yetkazish manzili
            </p>
            <p className="text-sm text-ink leading-snug mt-0.5">
              {d.address || `${Number(d.lat).toFixed(5)}, ${Number(d.lng).toFixed(5)}`}
            </p>
            {d.distanceKm != null && (
              <p className="text-xs text-neutral-500 mt-0.5">oshxonadan ≈ {d.distanceKm} km</p>
            )}
          </div>
        </div>
        {d.comment && (
          <div className="mx-4 mb-3 rounded-xl bg-gold/10 border border-gold/30 px-3 py-2 flex gap-2">
            <MessageSquare size={14} className="text-gold-deep shrink-0 mt-0.5" />
            <p className="text-xs text-gold-deep leading-relaxed">{d.comment}</p>
          </div>
        )}
        <NavButton lat={d.lat} lng={d.lng} label="Mijozga yo‘l ko‘rsatish" />
        {picked && <MapFrame lat={d.lat} lng={d.lng} nav={nav} />}
      </div>
    </section>
  );

  return (
    <>
      {header}

      <NavCard nav={nav} />

      {group && (
        <GroupStops
          group={group}
          current={d.id}
          busy={busy}
          onPick={(g) => pickedUp(g)}
        />
      )}

      {/* The current target first: the kitchen, then the client. */}
      {picked ? (
        <>
          {clientCard}
          {kitchenCard}
        </>
      ) : (
        <>
          {kitchenCard}
          {clientCard}
        </>
      )}

      {/* ITEMS */}
      <section className="px-6 mt-4">
        <div className="bg-white border border-line rounded-2xl overflow-hidden">
          <p className="px-4 pt-3 pb-2 text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            Buyurtma tarkibi · {itemsCount} ta
          </p>
          <ul className="divide-y divide-line">
            {(d.items ?? []).map((it, i) => (
              <li key={i} className="px-4 py-2.5 flex justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="font-bold tabular-nums">{it.qty} ×</span> {it.name}
                </span>
                <span className="tabular-nums text-neutral-600 shrink-0">
                  {fmt(Number(it.price) * Number(it.qty))}
                </span>
              </li>
            ))}
          </ul>
          <div className="px-4 py-3 border-t border-line flex justify-between text-sm">
            <span className="text-neutral-500">Taomlar</span>
            <span className="font-semibold tabular-nums">{fmt(d.itemsTotal)} so‘m</span>
          </div>
        </div>
      </section>

      {/* CASH TO COLLECT */}
      <section className="px-6 mt-4 space-y-3">
        <div className="bg-ink text-white rounded-2xl p-5 relative overflow-hidden">
          <div
            aria-hidden
            className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gold/20 blur-2xl"
          />
          <p className="relative text-[10px] uppercase tracking-widest text-gold font-bold">
            Mijozdan olinadi (naqd)
          </p>
          <FitText className="relative mt-2 text-5xl font-extrabold tabular-nums leading-none">
            {fmt(cashAll)}
            <span className="ml-2 text-base font-normal text-neutral-400">so‘m</span>
          </FitText>
          <p className="relative mt-2 text-xs text-neutral-400">
            Taomlar {fmt(itemsAll)} + yetkazish {fmt(feeAll)} so‘m
            {group ? ` · ${group.length} ta oshxona` : ''}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="bg-white border border-line rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
              Sizning haqingiz
            </p>
            <p className="mt-1.5 text-2xl font-extrabold tabular-nums leading-none text-ink">
              {fmt(feeAll)}
            </p>
          </div>
          <div className="bg-gold/10 border border-gold/40 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-gold-deep font-bold">
              Komissiya
            </p>
            {commission > 0 ? (
              <p className="mt-1.5 text-2xl font-extrabold tabular-nums leading-none text-ink">
                {fmt(commission)}
              </p>
            ) : (
              <p className="mt-1.5 text-[11px] leading-snug text-gold-deep">
                Yetkazilgach balansdan yechiladi
              </p>
            )}
          </div>
        </div>
      </section>

      {err && <p className="px-6 mt-3 text-sm text-red-600">{err}</p>}

      {/* ACTIONS */}
      <section className="px-6 mt-6 mb-4">
        {!allPicked && d.status === 'NEW' && (
          <p className="mb-3 text-sm text-center text-neutral-600">
            {d.kitchen?.name ?? 'Oshxona'} buyurtmani hali tasdiqlamadi — tasdiqlashi bilan xabar keladi.
          </p>
        )}
        {!allPicked && (d.status === 'COOKING' || d.status === 'READY' || d.status === 'NEW') && (
          <>
            {d.status !== 'NEW' && (
              <PrimaryAction
                icon={<PackageCheck size={18} strokeWidth={2.4} />}
                onClick={() => pickedUp()}
                disabled={busy}
                label={group ? `${d.kitchen?.name ?? 'Oshxona'}dan oldim` : 'Buyurtmani oldim'}
              />
            )}
            <button
              onClick={release}
              disabled={busy}
              className="mt-3 w-full h-11 inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold active:scale-[0.98] disabled:opacity-50"
            >
              <Undo2 size={16} /> Qaytarish
            </button>
          </>
        )}
        {allPicked && (
          <PrimaryAction
            icon={<CheckCircle2 size={18} strokeWidth={2.4} />}
            onClick={delivered}
            disabled={busy}
            label={group ? `Hammasi yetkazildi, ${fmt(cashAll)} so‘m oldim` : 'Yetkazildi, pulni oldim'}
          />
        )}
      </section>
    </>
  );
}

const STOP_LABEL: Partial<Record<DeliveryStatus, string>> = {
  NEW: 'Oshxona hali tasdiqlamadi',
  COOKING: 'Tayyorlanmoqda',
  READY: 'Tayyor — olib keting',
  PICKED_UP: 'Olindi ✓',
  DELIVERED: 'Yetkazildi',
};

/** One client, several kitchens: every pick-up stop with its state and an "oldim" button. */
function GroupStops({
  group,
  current,
  busy,
  onPick,
}: {
  group: DeliveryView[];
  current: string;
  busy: boolean;
  onPick: (g: DeliveryView) => void;
}) {
  const done = group.filter((g) => g.status === 'PICKED_UP' || g.status === 'DELIVERED').length;
  return (
    <section className="px-6 mt-4">
      <div className="bg-white border-2 border-gold rounded-2xl overflow-hidden">
        <p className="px-4 pt-3 pb-2 text-sm font-bold">
          🍽 {group.length} ta oshxonadan yig‘asiz · {done}/{group.length} olindi
        </p>
        <ul className="divide-y divide-line">
          {group.map((g, i) => {
            const picked = g.status === 'PICKED_UP' || g.status === 'DELIVERED';
            const canPick = g.status === 'COOKING' || g.status === 'READY';
            const count = (g.items ?? []).reduce((s, it) => s + Number(it.qty ?? 0), 0);
            return (
              <li key={g.id} className={'px-4 py-3 flex items-center gap-3 ' + (g.id === current ? 'bg-gold/10' : '')}>
                <span
                  className={
                    'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ' +
                    (picked ? 'bg-emerald-500 text-white' : 'bg-ink text-white')
                  }
                >
                  {picked ? <Check size={16} strokeWidth={3} /> : i + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold truncate">{g.kitchen?.name ?? 'Oshxona'}</p>
                  <p className="text-xs text-neutral-500">
                    #{g.number} · {count} ta taom · {STOP_LABEL[g.status] ?? g.status}
                  </p>
                </div>
                {g.kitchen?.phone && !picked && (
                  <a
                    href={`tel:${g.kitchen.phone}`}
                    className="w-9 h-9 rounded-full border border-line flex items-center justify-center shrink-0"
                    aria-label="Oshxonaga qo‘ng‘iroq"
                  >
                    <Phone size={15} />
                  </a>
                )}
                {canPick && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onPick(g)}
                    className="h-9 px-3 rounded-xl bg-gold text-ink text-xs font-bold shrink-0 active:scale-95 disabled:opacity-50"
                  >
                    Oldim
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}

/** Kitchen-side state: still cooking (with an estimate), ready, picked up. */
function KitchenStatus({ d, now }: { d: DeliveryView; now: number }) {
  if (d.status === 'PICKED_UP') {
    return (
      <div className="px-4 pb-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-full bg-neutral-100 text-neutral-700 border border-neutral-200">
          <Check size={12} strokeWidth={3} /> Olindi{d.pickedUpAt ? ` · ${fmtTime(d.pickedUpAt)}` : ''}
        </span>
      </div>
    );
  }
  if (d.status === 'READY') {
    return (
      <div className="px-4 pb-3">
        <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-green-50 text-green-700 border border-green-200">
          <CheckCircle2 size={12} /> Tayyor — olib keting
          {d.readyAt ? ` · ${fmtTime(d.readyAt)}` : ''}
        </span>
      </div>
    );
  }
  let eta: string | null = null;
  if (d.acceptedAt && d.prepMinutes) {
    const at = new Date(d.acceptedAt).getTime() + Number(d.prepMinutes) * 60_000;
    const left = Math.ceil((at - now) / 60_000);
    eta =
      left > 0
        ? `≈ ${left} daq qoldi (${fmtTime(new Date(at).toISOString())})`
        : 'tez orada tayyor bo‘ladi';
  } else if (d.prepMinutes) {
    eta = `~${d.prepMinutes} daq`;
  }
  return (
    <div className="px-4 pb-3 flex flex-wrap items-center gap-2">
      <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full bg-orange-50 text-orange-800 border border-orange-200">
        <Clock size={12} /> Tayyorlanmoqda
      </span>
      {eta && <span className="text-xs text-neutral-500">{eta}</span>}
    </div>
  );
}

/** "Yo‘l ko‘rsatish" — route to the point in Yandex Navigator (web map fallback). */
function NavButton({ lat, lng, label }: { lat: number; lng: number; label: string }) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return (
    <div className="px-4 pb-3">
      <button
        type="button"
        onClick={() => openYandexNavigator(Number(lat), Number(lng))}
        className="w-full h-11 rounded-xl bg-ink text-gold text-sm font-bold inline-flex items-center justify-center gap-2 active:scale-[0.98]"
      >
        <Navigation size={16} strokeWidth={2.4} /> {label}
      </button>
    </div>
  );
}

function MapFrame({ lat, lng, nav }: { lat: number; lng: number; nav: VoiceNavView }) {
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return (
    <div className="aspect-[16/10] w-full border-t border-line">
      <MiniMap lat={Number(lat)} lng={Number(lng)} route={nav.route} me={nav.me} />
    </div>
  );
}

const STEPS: { short: string }[] = [
  { short: 'Oshxonaga boring' },
  { short: 'Buyurtmani oling' },
  { short: 'Mijozga yetkazing' },
];

const STEP_INDEX: Partial<Record<DeliveryStatus, number>> = {
  COOKING: 0,
  READY: 1,
  PICKED_UP: 2,
  DELIVERED: 3,
};

const LABEL: Record<string, string> = {
  COOKING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  PICKED_UP: 'Yo‘lda',
  DELIVERED: 'Yetkazildi',
  CANCELLED: 'Bekor qilindi',
  REJECTED: 'Bekor qilindi',
};

function StepProgress({ status }: { status: DeliveryStatus }) {
  const currentIdx = STEP_INDEX[status] ?? -1;
  return (
    <div className="relative flex items-start justify-between">
      <div
        aria-hidden
        className="absolute top-4 left-[16.667%] right-[16.667%] h-[3px] bg-neutral-800 rounded-full"
      />
      <div
        aria-hidden
        className="absolute top-4 left-[16.667%] h-[3px] bg-gold rounded-full transition-all duration-300"
        style={{
          width: `${Math.min(66.667, Math.max(0, currentIdx) * (66.667 / (STEPS.length - 1)))}%`,
        }}
      />
      {STEPS.map((step, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={step.short} className="relative flex-1 flex flex-col items-center">
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
                'mt-2 px-1 text-[11px] uppercase tracking-wide font-bold text-center leading-tight ' +
                (active ? 'text-gold' : done ? 'text-neutral-200' : 'text-neutral-500')
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
      <span className={'text-sm tabular-nums ' + (bold ? 'font-bold text-ink' : 'font-medium')}>
        {value}
      </span>
    </div>
  );
}

function fmt(v: any) {
  return Math.round(Number(v ?? 0)).toLocaleString('uz');
}
