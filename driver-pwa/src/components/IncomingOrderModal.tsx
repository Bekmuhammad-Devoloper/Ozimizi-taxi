'use client';
import { useEffect, useState } from 'react';
import { MiniMap } from '@/components/MiniMap';
import { useRouter } from 'next/navigation';
import { IncomingOrder, useOrderStore } from '@/stores/order';
import { acceptDelivery } from '@/stores/delivery';
import { api } from '@/lib/api';
import { stopOrderAlarm } from '@/hooks/useDriverSocket';

const TIMEOUT_SECONDS = 15;

export function IncomingOrderModal() {
  const incoming = useOrderStore((s) => s.incoming);
  const setIncoming = useOrderStore((s) => s.setIncoming);
  const setActive = useOrderStore((s) => s.setActive);
  const resetDistance = useOrderStore((s) => s.resetDistance);
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = useState(TIMEOUT_SECONDS);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!incoming) return;
    const total = incoming.offerSeconds ?? TIMEOUT_SECONDS;
    // Count from when it arrived (the modal may mount a moment later).
    const left = () => Math.max(0, Math.ceil(total - (Date.now() - incoming.receivedAt) / 1000));
    setSecondsLeft(left());
    const tick = setInterval(() => setSecondsLeft(left()), 500);
    return () => clearInterval(tick);
  }, [incoming]);

  // Time is up: silence the alarm and close (a personal offer moves on to
  // the next driver on the server side).
  useEffect(() => {
    if (incoming && secondsLeft === 0) {
      stopOrderAlarm(incoming.orderId);
      setIncoming(null);
    }
  }, [incoming, secondsLeft, setIncoming]);

  if (!incoming) return null;

  const decline = () => {
    stopOrderAlarm(incoming.orderId);
    // Passes a personal offer on at once; in the middle it stops the re-rings for me.
    void api.post(`/driver/orders/${incoming.orderId}/decline`).catch(() => undefined);
    setIncoming(null);
  };

  if (incoming.kind === 'delivery') {
    // Food delivery: take it and go to the courier screen.
    const acceptDel = async () => {
      if (busy) return;
      stopOrderAlarm(incoming.orderId);
      setBusy(true);
      try {
        await acceptDelivery(incoming.orderId);
        setIncoming(null);
        router.push('/delivery/active');
      } catch (e: any) {
        alert(e?.response?.data?.message ?? 'Qabul qilib bo‘lmadi');
        setIncoming(null);
      } finally {
        setBusy(false);
      }
    };
    return (
      <DeliveryOffer
        offer={incoming}
        secondsLeft={secondsLeft}
        busy={busy}
        onDecline={decline}
        onAccept={acceptDel}
      />
    );
  }

  const accept = async () => {
    if (busy) return;
    stopOrderAlarm(incoming.orderId);
    setBusy(true);
    try {
      const { data } = await api.post(`/driver/orders/${incoming.orderId}/accept`);
      resetDistance();
      setActive({
        id: data.id,
        status: data.status,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupAddress: data.pickupAddress,
      });
      setIncoming(null);
      router.push('/order/active');
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Qabul qilib bo‘lmadi');
      setIncoming(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">Yangi buyurtma</h2>
          <span
            className={
              'min-w-12 h-12 px-2 rounded-full flex items-center justify-center text-lg font-extrabold tabular-nums ' +
              (secondsLeft <= 5 ? 'bg-red-600 text-white animate-pulse' : 'bg-gold text-ink')
            }
          >
            {secondsLeft}
          </span>
        </div>
        <p
          className={
            'mb-5 text-xs font-bold uppercase tracking-wider ' +
            (incoming.mode === 'all' ? 'text-red-600' : 'text-emerald-700')
          }
        >
          {incoming.mode === 'all'
            ? 'Hammaga yuborildi — birinchi qabul qilgan oladi'
            : 'Faqat sizga taklif — eng yaqin haydovchisiz'}
        </p>

        <dl className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <dt className="text-neutral-500">Olib ketish</dt>
            <dd className="text-right max-w-[60%]">
              {incoming.pickup.address || 'Manzil aniqlanmagan'}
            </dd>
          </div>
          {incoming.destination && (
            <div className="flex justify-between text-sm">
              <dt className="text-neutral-500">Qayerga</dt>
              <dd className="text-right max-w-[60%]">
                {incoming.destination.address ||
                  `${incoming.destination.lat.toFixed(4)}, ${incoming.destination.lng.toFixed(4)}`}
              </dd>
            </div>
          )}
          <div className="flex justify-between text-sm">
            <dt className="text-neutral-500">Sizgacha masofa</dt>
            <dd className="font-semibold">
              {incoming.distanceFromDriver.toFixed(1)} km
            </dd>
          </div>
          {incoming.estimatedPrice != null && (
            <div className="flex justify-between text-sm">
              <dt className="text-neutral-500">Taxminiy safar</dt>
              <dd className="font-semibold">
                ≈ {incoming.estimatedKm} km · {Math.round(incoming.estimatedPrice).toLocaleString('uz')} so‘m
              </dd>
            </div>
          )}
        </dl>

        <div className="aspect-video w-full rounded-md overflow-hidden border border-line mb-6">
          <MiniMap lat={Number(incoming.pickup.lat)} lng={Number(incoming.pickup.lng)} />
        </div>

        <div className="flex gap-3">
          <button
            onClick={decline}
            className="flex-1 h-14 border border-line rounded-md text-sm font-medium"
          >
            Rad etish
          </button>
          <button
            onClick={accept}
            disabled={busy}
            className="flex-[2] h-14 bg-ink text-gold rounded-md text-base font-bold disabled:opacity-40"
          >
            Qabul qilish
          </button>
        </div>
      </div>
    </div>
  );
}

/** Offer dialog for a food delivery (pickup = kitchen, destination = client). */
function DeliveryOffer({
  offer,
  secondsLeft,
  busy,
  onDecline,
  onAccept,
}: {
  offer: IncomingOrder;
  secondsLeft: number;
  busy: boolean;
  onDecline: () => void;
  onAccept: () => void;
}) {
  const fmt = (v: number | null | undefined) => Math.round(Number(v ?? 0)).toLocaleString('uz');
  const prep = offer.readyAt
    ? 'Tayyor ✅'
    : offer.prepMinutes
      ? `~${offer.prepMinutes} daqiqa`
      : 'Tayyorlanmoqda';
  return (
    <div className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-end sm:items-center justify-center">
      <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6 max-h-[100dvh] overflow-y-auto">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-semibold">
            🍽 Yetkazish{offer.number != null ? ` #${offer.number}` : ''}
          </h2>
          <span
            className={
              'min-w-12 h-12 px-2 rounded-full flex items-center justify-center text-lg font-extrabold tabular-nums ' +
              (secondsLeft <= 5 ? 'bg-red-600 text-white animate-pulse' : 'bg-gold text-ink')
            }
          >
            {secondsLeft}
          </span>
        </div>
        <p
          className={
            'mb-5 text-xs font-bold uppercase tracking-wider ' +
            (offer.mode === 'all' ? 'text-red-600' : 'text-emerald-700')
          }
        >
          {offer.mode === 'all'
            ? 'Hammaga yuborildi — birinchi qabul qilgan oladi'
            : 'Faqat sizga taklif — eng yaqin kuryersiz'}
        </p>

        <dl className="space-y-3 mb-4">
          <div className="flex justify-between gap-3 text-sm">
            <dt className="text-neutral-500 shrink-0">Oshxona</dt>
            <dd className="text-right max-w-[65%]">
              {offer.pickup.address || offer.kitchenName || 'Manzil aniqlanmagan'}
            </dd>
          </div>
          <div className="flex justify-between gap-3 text-sm">
            <dt className="text-neutral-500 shrink-0">Oshxonagacha</dt>
            <dd className="font-semibold">{Number(offer.distanceFromDriver).toFixed(1)} km</dd>
          </div>
          {offer.destination && (
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-neutral-500 shrink-0">Qayerga</dt>
              <dd className="text-right max-w-[65%]">
                {offer.destination.address ||
                  `${offer.destination.lat.toFixed(4)}, ${offer.destination.lng.toFixed(4)}`}
                {offer.estimatedKm != null && (
                  <span className="block text-xs text-neutral-500">
                    oshxonadan ≈ {offer.estimatedKm} km
                  </span>
                )}
              </dd>
            </div>
          )}
          {offer.itemsCount != null && (
            <div className="flex justify-between gap-3 text-sm">
              <dt className="text-neutral-500 shrink-0">Taomlar</dt>
              <dd className="font-semibold">{offer.itemsCount} ta</dd>
            </div>
          )}
          <div className="flex justify-between gap-3 text-sm">
            <dt className="text-neutral-500 shrink-0">Tayyorlash</dt>
            <dd className="font-semibold">{prep}</dd>
          </div>
        </dl>

        <div className="rounded-xl bg-ink text-white p-4 mb-4 space-y-2">
          {offer.total != null && (
            <div className="flex justify-between items-baseline gap-3">
              <span className="text-xs text-neutral-400">Mijozdan olinadi</span>
              <span className="text-lg font-extrabold tabular-nums">
                {fmt(offer.total)} so‘m{' '}
                <span className="text-xs font-normal text-neutral-400">(naqd)</span>
              </span>
            </div>
          )}
          {offer.estimatedPrice != null && (
            <div className="flex justify-between items-baseline gap-3">
              <span className="text-xs text-neutral-400">Sizning haqingiz</span>
              <span className="text-lg font-extrabold tabular-nums text-gold">
                {fmt(offer.estimatedPrice)} so‘m
              </span>
            </div>
          )}
        </div>

        <div className="aspect-[2/1] w-full rounded-md overflow-hidden border border-line mb-6">
          <MiniMap lat={Number(offer.pickup.lat)} lng={Number(offer.pickup.lng)} />
        </div>

        <div className="flex gap-3">
          <button
            onClick={onDecline}
            className="flex-1 h-14 border border-line rounded-md text-sm font-medium"
          >
            Rad etish
          </button>
          <button
            onClick={onAccept}
            disabled={busy}
            className="flex-[2] h-14 bg-ink text-gold rounded-md text-base font-bold disabled:opacity-40"
          >
            Qabul qilish
          </button>
        </div>
      </div>
    </div>
  );
}
