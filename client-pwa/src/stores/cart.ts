import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';

export interface CartKitchen {
  id: string;
  name: string;
  logoUrl?: string | null;
  minOrder: number;
}

export interface CartLine {
  itemId: string;
  kitchenId: string;
  name: string;
  price: number;
  photoUrl?: string | null;
  qty: number;
}

export interface CartItemInput {
  id: string;
  name: string;
  price: number;
  photoUrl?: string | null;
}

export interface CartGroup {
  kitchen: CartKitchen;
  lines: CartLine[];
}

interface CartState {
  /** Kitchens that have lines in the cart (several at once is fine). */
  kitchens: Record<string, CartKitchen>;
  lines: CartLine[];
  /** Adds one of this item (any kitchen — the cart holds several). */
  add: (kitchen: CartKitchen, item: CartItemInput) => void;
  setQty: (itemId: string, qty: number) => void;
  /** Refresh one kitchen's names/prices from its live menu; drops items no longer offered. Returns removed names. */
  sync: (kitchen: CartKitchen, menu: CartItemInput[]) => string[];
  /** Drops one kitchen's lines (e.g. after its order was placed). */
  removeKitchen: (kitchenId: string) => void;
  clear: () => void;
}

const MAX_QTY = 50;

/** Kitchens still referenced by the lines (keeps the map tidy). */
function prune(kitchens: Record<string, CartKitchen>, lines: CartLine[]): Record<string, CartKitchen> {
  const used = new Set(lines.map((l) => l.kitchenId));
  const out: Record<string, CartKitchen> = {};
  for (const id of Object.keys(kitchens)) if (used.has(id)) out[id] = kitchens[id];
  return out;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      kitchens: {},
      lines: [],
      add: (kitchen, item) => {
        const s = get();
        const existing = s.lines.find((l) => l.itemId === item.id);
        set({
          kitchens: { ...s.kitchens, [kitchen.id]: kitchen },
          lines: existing
            ? s.lines.map((l) => (l.itemId === item.id ? { ...l, qty: Math.min(MAX_QTY, l.qty + 1) } : l))
            : [...s.lines, { itemId: item.id, kitchenId: kitchen.id, name: item.name, price: item.price, photoUrl: item.photoUrl, qty: 1 }],
        });
      },
      setQty: (itemId, qty) =>
        set((s) => {
          const lines =
            qty <= 0
              ? s.lines.filter((l) => l.itemId !== itemId)
              : s.lines.map((l) => (l.itemId === itemId ? { ...l, qty: Math.min(MAX_QTY, Math.round(qty)) } : l));
          return { lines, kitchens: prune(s.kitchens, lines) };
        }),
      sync: (kitchen, menu) => {
        const s = get();
        const mine = s.lines.filter((l) => l.kitchenId === kitchen.id);
        if (!mine.length) return [];
        const byId = new Map(menu.map((m) => [m.id, m]));
        const removed = mine.filter((l) => !byId.has(l.itemId)).map((l) => l.name);
        const lines = s.lines
          .filter((l) => l.kitchenId !== kitchen.id || byId.has(l.itemId))
          .map((l) => {
            if (l.kitchenId !== kitchen.id) return l;
            const m = byId.get(l.itemId)!;
            return { ...l, name: m.name, price: m.price, photoUrl: m.photoUrl };
          });
        set({ kitchens: prune({ ...s.kitchens, [kitchen.id]: kitchen }, lines), lines });
        return removed;
      },
      removeKitchen: (kitchenId) =>
        set((s) => {
          const lines = s.lines.filter((l) => l.kitchenId !== kitchenId);
          return { lines, kitchens: prune(s.kitchens, lines) };
        }),
      clear: () => set({ kitchens: {}, lines: [] }),
    }),
    {
      name: 'moviy-food-cart',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ kitchens: s.kitchens, lines: s.lines }),
      // v1 held a single `kitchen` and lines without kitchenId.
      migrate: (persisted: any, version) => {
        if (version < 2 && persisted) {
          const k: CartKitchen | null = persisted.kitchen ?? null;
          const lines: CartLine[] = k && Array.isArray(persisted.lines) ? persisted.lines.map((l: any) => ({ ...l, kitchenId: k.id })) : [];
          return { kitchens: k && lines.length ? { [k.id]: k } : {}, lines };
        }
        return persisted as { kitchens: Record<string, CartKitchen>; lines: CartLine[] };
      },
    },
  ),
);

export const cartCount = (lines: CartLine[]) => lines.reduce((s, l) => s + l.qty, 0);
export const cartSum = (lines: CartLine[]) => lines.reduce((s, l) => s + l.price * l.qty, 0);

/** Lines grouped by kitchen, in the order the kitchens were first added. */
export function cartGroups(lines: CartLine[], kitchens: Record<string, CartKitchen>): CartGroup[] {
  const out: CartGroup[] = [];
  const at = new Map<string, CartGroup>();
  for (const l of lines) {
    let g = at.get(l.kitchenId);
    if (!g) {
      g = { kitchen: kitchens[l.kitchenId] ?? { id: l.kitchenId, name: 'Oshxona', minOrder: 0 }, lines: [] };
      at.set(l.kitchenId, g);
      out.push(g);
    }
    g.lines.push(l);
  }
  return out;
}
