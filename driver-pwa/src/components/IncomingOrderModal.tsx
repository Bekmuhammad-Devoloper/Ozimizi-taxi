'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useOrderStore } from '@/stores/order';
import { api } from '@/lib/api';

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
    setSecondsLeft(TIMEOUT_SECONDS);
    const tick = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    return () => clearInterval(tick);
  }, [incoming]);

  // Clear the incoming order outside of any setState updater
  useEffect(() => {
    if (incoming && secondsLeft === 0) {
      setIncoming(null);
    }
  }, [incoming, secondsLeft, setIncoming]);

  if (!incoming) return null;

  const accept = async () => {
    if (busy) return;
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
        <div className="flex justify-between items-baseline mb-6">
          <h2 className="text-lg font-semibold">Yangi buyurtma</h2>
          <span className="text-sm tabular-nums text-neutral-500">{secondsLeft}s</span>
        </div>

        <dl className="space-y-3 mb-6">
          <div className="flex justify-between text-sm">
            <dt className="text-neutral-500">Olib ketish</dt>
            <dd className="text-right max-w-[60%]">
              {incoming.pickup.address || 'Manzil aniqlanmagan'}
            </dd>
          </div>
          <div className="flex justify-between text-sm">
            <dt className="text-neutral-500">Sizgacha masofa</dt>
            <dd className="font-semibold">
              {incoming.distanceFromDriver.toFixed(1)} km
            </dd>
          </div>
        </dl>

        <div className="aspect-video w-full rounded-md overflow-hidden border border-line mb-6">
          <iframe
            title="map"
            src={`https://www.openstreetmap.org/export/embed.html?bbox=${
              incoming.pickup.lng - 0.01
            }%2C${incoming.pickup.lat - 0.01}%2C${
              incoming.pickup.lng + 0.01
            }%2C${
              incoming.pickup.lat + 0.01
            }&layer=mapnik&marker=${incoming.pickup.lat}%2C${incoming.pickup.lng}`}
            className="w-full h-full border-0"
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={() => setIncoming(null)}
            className="flex-1 h-12 border border-line rounded-md text-sm font-medium"
          >
            Rad etish
          </button>
          <button
            onClick={accept}
            disabled={busy}
            className="flex-1 h-12 bg-ink text-white rounded-md text-sm font-medium disabled:opacity-40"
          >
            Qabul qilish
          </button>
        </div>
      </div>
    </div>
  );
}
