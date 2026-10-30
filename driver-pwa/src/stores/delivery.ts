import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { api } from '@/lib/api';
import type { DriverInfo } from '@/stores/auth';

/**
 * Food deliveries (courier side). Taxi drivers who switched on
 * "Yetkazish buyurtmalarini olish" and couriers get these offers through the
 * same socket events as taxi orders (`new_order` with `kind: 'delivery'`).
 */

export type DeliveryStatus =
  | 'NEW'
  | 'COOKING' // the kitchen is still cooking
  | 'READY' // food is ready at the kitchen
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export interface DeliveryItem {
  name: string;
  price: number;
  qty: number;
}

export interface DeliveryKitchen {
  id?: string;
  name: string;
  phone?: string | null;
  address?: string | null;
  lat: number;
  lng: number;
  logoUrl?: string | null;
}

/** Courier view of a delivery (GET /driver/deliveries/active etc.). */
export interface DeliveryView {
  id: string;
  number: number;
  status: DeliveryStatus;
  items: DeliveryItem[];
  itemsTotal: number;
  deliveryFee: number;
  /** Cash to collect from the client (food + delivery). */
  total: number;
  distanceKm?: number | null;
  address?: string | null;
  lat: number;
  lng: number;
  /** Client phone. */
  phone?: string | null;
  comment?: string | null;
  prepMinutes?: number | null;
  cancelledBy?: string | null;
  createdAt?: string | null;
  acceptedAt?: string | null;
  readyAt?: string | null;
  courierAssignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  kitchen: DeliveryKitchen | null;
  clientName?: string | null;
  courierCommission?: number;
}

/** Offer-shaped payload (GET /driver/deliveries/available). */
export interface DeliveryOffer {
  kind: 'delivery';
  orderId: string;
  number: number;
  mode?: 'personal' | 'all';
  offerSeconds?: number;
  pickup: { lat: number; lng: number; address?: string | null };
  destination?: { lat: number; lng: number; address?: string | null } | null;
  /** km from the driver to the kitchen. */
  distanceFromDriver: number;
  /** km kitchen → client. */
  estimatedKm?: number | null;
  /** The courier's delivery fee. */
  estimatedPrice?: number | null;
  kitchenName?: string | null;
  itemsCount?: number | null;
  total?: number | null;
  readyAt?: string | null;
  prepMinutes?: number | null;
  createdAt?: string | null;
}

export const LIVE_DELIVERY_STATUSES: DeliveryStatus[] = ['COOKING', 'READY', 'PICKED_UP'];

/** The delivery is still being carried out (not delivered / cancelled). */
export function isDeliveryLive(d?: DeliveryView | null): d is DeliveryView {
  return !!d && LIVE_DELIVERY_STATUSES.includes(d.status);
}

/** Couriers always take deliveries; taxi drivers only when switched on. */
export function takesDeliveries(
  d?: Pick<DriverInfo, 'kind' | 'acceptDelivery'> | null,
): boolean {
  return d?.kind === 'courier' || !!d?.acceptDelivery;
}

interface DeliveryState {
  active: DeliveryView | null;
  setActive: (d: DeliveryView | null) => void;
}

// Persisted so a refresh mid-delivery doesn't strand the courier; the server
// copy (GET /driver/deliveries/active) is re-read on app start anyway.
export const useDeliveryStore = create<DeliveryState>()(
  persist(
    (set) => ({
      active: null,
      setActive: (active) => set({ active }),
    }),
    {
      name: 'taxi-driver-delivery',
      storage: createJSONStorage(() => localStorage),
    },
  ),
);

function isView(v: unknown): v is DeliveryView {
  return !!v && typeof v === 'object' && typeof (v as DeliveryView).id === 'string';
}

let syncing: Promise<DeliveryView | null> | null = null;

/**
 * Re-read the active delivery from the server. When the server no longer
 * lists the one we hold (delivered on another device, cancelled while the
 * app was closed) its final state is looked up in the history so the page
 * can show it. A finished delivery kept locally (summary screen) is left
 * alone. Network errors keep the local copy.
 */
export function syncActiveDelivery(): Promise<DeliveryView | null> {
  if (syncing) return syncing;
  syncing = (async () => {
    const startId = useDeliveryStore.getState().active?.id ?? null;
    try {
      const { data } = await api.get('/driver/deliveries/active');
      const st = useDeliveryStore.getState();
      // Accepted / released meanwhile — don't overwrite with a stale answer.
      if ((st.active?.id ?? null) !== startId && !isView(data)) return st.active;
      if (isView(data)) {
        st.setActive(data);
        return data;
      }
      const local = st.active;
      if (!isDeliveryLive(local)) return local;
      try {
        const { data: hist } = await api.get('/driver/deliveries/history');
        const found = Array.isArray(hist)
          ? (hist as DeliveryView[]).find((h) => h?.id === local.id)
          : undefined;
        const now = useDeliveryStore.getState();
        if (now.active?.id !== local.id) return now.active;
        if (found && !LIVE_DELIVERY_STATUSES.includes(found.status)) {
          const merged = { ...local, ...found };
          now.setActive(merged);
          return merged;
        }
      } catch {
        return useDeliveryStore.getState().active;
      }
      // Not ours any more (e.g. taken back by the admin).
      useDeliveryStore.getState().setActive(null);
      return null;
    } catch {
      return useDeliveryStore.getState().active;
    }
  })().finally(() => {
    syncing = null;
  });
  return syncing;
}

/** Take a delivery (offer modal or the "Mavjud" list). */
export async function acceptDelivery(id: string): Promise<DeliveryView> {
  const { data } = await api.post<DeliveryView>(`/driver/deliveries/${id}/accept`);
  useDeliveryStore.getState().setActive(data);
  return data;
}
