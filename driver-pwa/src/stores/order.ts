import { create } from 'zustand';

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

export const useOrderStore = create<OrderState>((set) => ({
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
}));
