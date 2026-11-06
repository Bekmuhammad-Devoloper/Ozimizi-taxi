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
  discount?: string | null;
  bonusUsed?: string | null;
  arrivedAt?: string | null;
  startedAt?: string | null;
  waitingMinutes?: number;
  waitingFee?: string | null;
  outsideKm?: string | number | null;
  outsideFee?: string | number | null;
  waitingSeconds?: number;
  waitStartedAt?: string | null;
  // Waiting meter: last server tick and whether the car was moving then.
  waitTickAt?: string | null;
  waitMoving?: boolean;
  cancelPenalty?: string | null;
  destinationAddress?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  /** 'bot' | 'app' | 'street' (taximeter ride — passenger picked up on the street). */
  source?: string | null;
  createdAt?: string;
}

export interface IncomingOrder {
  orderId: string;
  pickup: { lat: number; lng: number; address?: string | null };
  destination?: { lat: number; lng: number; address?: string | null } | null;
  estimatedKm?: number | null;
  estimatedPrice?: number | null;
  distanceFromDriver: number;
  receivedAt: number;
  /** 'personal' = offered only to this driver; 'all' = fell to the middle. */
  mode?: 'personal' | 'all';
  /** How long the offer rings (server setting, default 15 s). */
  offerSeconds?: number;
  // ---- food delivery offers (`kind: 'delivery'`) ----
  // pickup = the kitchen, destination = the client, distanceFromDriver = km
  // to the kitchen, estimatedKm = kitchen → client, estimatedPrice = the
  // courier's delivery fee.
  kind?: 'taxi' | 'delivery';
  /** Short delivery number (#123). */
  number?: number | null;
  kitchenName?: string | null;
  itemsCount?: number | null;
  /** Cash to collect from the client (food + delivery). */
  total?: number | null;
  prepMinutes?: number | null;
  /** Set when the kitchen already marked the food ready. */
  readyAt?: string | null;
}

/** Passenger wants to pay part of a finished ride from bonus; driver confirms. */
export interface BonusRequest {
  id: string;
  orderId: string;
  amount: number;
  clientName: string;
  price: number;
  cashAfter: number;
}

/** Whether the app currently has a GPS fix to send — without one the
 *  server never broadcasts orders to this driver. */
export type GpsStatus = 'searching' | 'ok' | 'denied' | 'unavailable';

interface OrderState {
  active: OrderModel | null;
  incoming: IncomingOrder | null;
  bonusRequest: BonusRequest | null;
  gpsStatus: GpsStatus;
  setGpsStatus: (s: GpsStatus) => void;
  history: OrderModel[];
  trackedDistanceKm: number;
  /** Part of trackedDistanceKm driven outside the admin's zone. */
  trackedOutsideKm: number;
  setActive: (o: OrderModel | null) => void;
  /**
   * Merge fields into the CURRENT active order (read at call time, never a
   * stale render copy). No-op when the active order is another one.
   */
  patchActive: (
    id: string,
    patch: Partial<OrderModel> | ((cur: OrderModel) => Partial<OrderModel>),
  ) => void;
  /** A "Kutish" / "Davom etish" request is in flight (not persisted). */
  waitPending: boolean;
  setWaitPending: (v: boolean) => void;
  setIncoming: (o: IncomingOrder | null) => void;
  setBonusRequest: (r: BonusRequest | null) => void;
  setHistory: (o: OrderModel[]) => void;
  addToDistance: (km: number, outside?: boolean) => void;
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
      bonusRequest: null,
      gpsStatus: 'searching',
      setGpsStatus: (gpsStatus) => set({ gpsStatus }),
      history: [],
      trackedDistanceKm: 0,
      trackedOutsideKm: 0,
      setActive: (active) => set({ active }),
      patchActive: (id, patch) =>
        set((s) => {
          if (!s.active || s.active.id !== id) return s;
          const p = typeof patch === 'function' ? patch(s.active) : patch;
          if (!p || Object.keys(p).length === 0) return s;
          return { active: { ...s.active, ...p } };
        }),
      waitPending: false,
      setWaitPending: (waitPending) => set({ waitPending }),
      setIncoming: (incoming) => set({ incoming }),
      setBonusRequest: (bonusRequest) => set({ bonusRequest }),
      setHistory: (history) => set({ history }),
      addToDistance: (km, outside = false) =>
        set((s) => ({
          trackedDistanceKm: s.trackedDistanceKm + km,
          trackedOutsideKm: s.trackedOutsideKm + (outside ? km : 0),
        })),
      resetDistance: () => set({ trackedDistanceKm: 0, trackedOutsideKm: 0 }),
    }),
    {
      name: 'taxi-driver-order',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({
        active: s.active,
        trackedDistanceKm: s.trackedDistanceKm,
        trackedOutsideKm: s.trackedOutsideKm,
      }),
    },
  ),
);
