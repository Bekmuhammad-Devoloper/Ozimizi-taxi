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

export interface DriverPublic {
  id: string;
  fullName: string;
  phone: string;
  avatarUrl?: string | null;
  carModel?: string | null;
  carColor?: string | null;
  carPlate?: string | null;
  carPhotoUrl?: string | null;
  isBranded?: boolean;
  lat?: number | null;
  lng?: number | null;
}

export interface ClientOrder {
  id: string;
  status: OrderStatus;
  pickupLat: number;
  pickupLng: number;
  pickupAddress?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationAddress?: string | null;
  distanceKm?: string | null;
  price?: string | null;
  discount?: string | null;
  bonusUsed?: string | null;
  waitingMinutes?: number;
  waitingFee?: string | number | null;
  /** Live waiting meter: seconds counted so far (pickup wait + paid pauses). */
  waitingSeconds?: number | null;
  /** The meter is running right now (car at the pickup, or a mid-ride pause). */
  waitRunning?: boolean | null;
  /** Server time of the last meter tick; while running, add the time since then. */
  waitTickAt?: string | null;
  cancelPenalty?: string | null;
  receiptNo?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  arrivedAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  cancelledAt?: string | null;
  driver: DriverPublic | null;
  etaMinutes?: number | null;
}

export interface OrderMessage {
  id: string;
  orderId: string;
  sender: 'client' | 'driver';
  text: string;
  createdAt: string;
}

export const ACTIVE_STATUSES: OrderStatus[] = ['PENDING', 'ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'];
export const isActiveStatus = (s?: OrderStatus | null) => !!s && ACTIVE_STATUSES.includes(s);

interface OrderState {
  active: ClientOrder | null;
  driverPos: { lat: number; lng: number; at: string } | null;
  messages: OrderMessage[];
  unread: number;
  setActive: (o: ClientOrder | null) => void;
  setDriverPos: (p: { lat: number; lng: number; at: string } | null) => void;
  setMessages: (m: OrderMessage[]) => void;
  addMessage: (m: OrderMessage) => void;
  clearUnread: () => void;
}

export const useOrderStore = create<OrderState>()(
  persist(
    (set) => ({
      active: null,
      driverPos: null,
      messages: [],
      unread: 0,
      setActive: (active) =>
        set((s) => ({
          active,
          // New order → forget the previous ride's chat and car position.
          ...(active && s.active?.id !== active.id ? { messages: [], unread: 0, driverPos: null } : {}),
          ...(active ? {} : { driverPos: null }),
        })),
      setDriverPos: (driverPos) => set({ driverPos }),
      setMessages: (messages) => set({ messages }),
      addMessage: (m) =>
        set((s) => ({
          messages: s.messages.some((x) => x.id === m.id) ? s.messages : [...s.messages, m],
          unread: m.sender === 'driver' ? s.unread + 1 : s.unread,
        })),
      clearUnread: () => set({ unread: 0 }),
    }),
    {
      name: 'moviy-client-order',
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ active: s.active }),
    },
  ),
);
