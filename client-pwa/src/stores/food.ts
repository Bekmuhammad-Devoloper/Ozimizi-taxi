import { create } from 'zustand';
import { FOOD_RANK, FoodOrder, foodNoticeText } from '@/lib/food';
import { nativeNotify } from '@/lib/native';

/**
 * Where an order snapshot came from:
 *  - socket: live push (announce even the first time we see the order)
 *  - fetch:  polling / page load (announce only a change from a known state)
 *  - self:   the response to this client's own action (never announce)
 */
export type FoodSource = 'socket' | 'fetch' | 'self';

interface FoodState {
  orders: Record<string, FoodOrder>;
  /** Merge one order; returns the snapshot kept (an older-status update is ignored). */
  upsert: (o: FoodOrder, source: FoodSource) => FoodOrder;
  upsertMany: (list: FoodOrder[], source: FoodSource) => void;
  reset: () => void;
}

function announce(o: FoodOrder, kind: 'status' | 'courier') {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('food-order-update', { detail: { order: o, kind } }));
  const t = foodNoticeText(o, kind);
  void nativeNotify(`${t.emoji} ${t.title}`, t.body);
  try {
    if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
  } catch {
    /* ignore */
  }
}

function merge(prev: FoodOrder | undefined, o: FoodOrder, source: FoodSource): FoodOrder {
  if (prev && FOOD_RANK[o.status] < FOOD_RANK[prev.status]) return prev; // stale
  if (source !== 'self') {
    const changed = prev ? prev.status !== o.status : source === 'socket';
    if (changed && o.status !== 'NEW') announce(o, 'status');
    else if (prev && prev.status === o.status && !prev.courier && o.courier) announce(o, 'courier');
  }
  return o;
}

/** Live food orders of this client (not persisted; seeded from the API). */
export const useFoodStore = create<FoodState>()((set, get) => ({
  orders: {},
  upsert: (o, source) => {
    const prev = get().orders[o.id];
    const kept = merge(prev, o, source);
    if (kept !== prev) set((s) => ({ orders: { ...s.orders, [o.id]: kept } }));
    return kept;
  },
  upsertMany: (list, source) => {
    const cur = get().orders;
    const next = { ...cur };
    for (const o of list) next[o.id] = merge(cur[o.id], o, source);
    set({ orders: next });
  },
  reset: () => set({ orders: {} }),
}));
