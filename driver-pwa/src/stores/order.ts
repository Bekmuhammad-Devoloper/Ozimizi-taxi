import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export type OrderStatus =
  | 'PENDING'
  | 'ACCEPTED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CANCELLED';

export interface OrderModel {
  id: string;
  status: OrderStatus;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string | null;
  distanceKm?: string | null;
  price?: string | null;
  commission?: string | null;
  createdAt?: string;
}

export interface IncomingOrder {
  orderId: string;
  pickup: { lat: number; lng: number; address?: string | null };
  distanceFromDriver: number;
  receivedAt: number;
}

interface OrderState {
  active: OrderModel | null;
  incoming: IncomingOrder | null;
  history: OrderModel[];
  trackedDistanceKm: number;
  setActive: (o: OrderModel | null) => void;
  setIncoming: (o: IncomingOrder | null) => void;
  setHistory: (o: OrderModel[]) => void;
  addToDistance: (km: number) => void;
  resetDistance: () => void;
}

// Persist `active` + `trackedDistanceKm` so a refresh mid-ride doesn't
// strand the driver. `incoming` and `history` are intentionally transient —
// incoming offers expire in 15s and history is re-fetched on dashboard mount.
export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      active: null,
      incoming: null,
      history: [],
      trackedDistanceKm: 0,
      setActive: (active) => set({ active }),
      setIncoming: (incoming) => set({ incoming }),
      setHistory: (history) => set({ history }),
      addToDistance: (km) =>
        set((s) => ({ trackedDistanceKm: s.trackedDistanceKm + km })),
      resetDistance: () => set({ trackedDistanceKm: 0 }),
    }),
    {
      name: 'taxi-driver-order',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        active: s.active,
        trackedDistanceKm: s.trackedDistanceKm,
      }),
    },
  ),
);
