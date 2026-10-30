// Food delivery: API shapes (backend/src/modules/food), labels and helpers.

export type FoodOrderStatus = 'NEW' | 'COOKING' | 'READY' | 'PICKED_UP' | 'DELIVERED' | 'REJECTED' | 'CANCELLED';

export interface KitchenCard {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  isOpen: boolean;
  prepMinutes: number;
  minOrder: number;
  itemsCount: number;
  distanceKm: number | null;
  deliveryFee: number | null;
}

export interface KitchenInfo {
  id: string;
  name: string;
  description?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  phone?: string | null;
  isOpen: boolean;
  prepMinutes: number;
  minOrder: number;
  lat: number;
  lng: number;
  distanceKm: number | null;
  deliveryFee: number | null;
  /** 'taxi' = too far for couriers: a taxi delivers it at the taxi tariff (when the API reports it). */
  courierMode?: FoodCourierMode | null;
}

export interface MenuCategory {
  id: string;
  name: string;
}

export interface MenuItem {
  id: string;
  categoryId: string | null;
  name: string;
  description?: string | null;
  price: number;
  photoUrl?: string | null;
}

export interface KitchenMenu {
  kitchen: KitchenInfo;
  categories: MenuCategory[];
  items: MenuItem[];
}

export interface FoodOrderLine {
  itemId: string;
  name: string;
  price: number;
  qty: number;
}

export interface FoodCourier {
  id: string;
  fullName: string;
  phone: string;
  avatarUrl?: string | null;
  kind?: 'taxi' | 'courier' | string | null;
  carModel?: string | null;
  carPlate?: string | null;
  lat?: number | null;
  lng?: number | null;
}

export type FoodDeliveryType = 'delivery' | 'pickup';
export type FoodCourierMode = 'courier' | 'taxi';

export interface FoodOrder {
  id: string;
  number: number;
  status: FoodOrderStatus;
  items: FoodOrderLine[];
  itemsTotal: number;
  deliveryFee: number;
  total: number;
  distanceKm: number | null;
  address: string | null;
  lat: number;
  lng: number;
  phone: string | null;
  comment: string | null;
  prepMinutes: number | null;
  /** 'pickup' = the client collects it at the kitchen (no delivery fee). */
  deliveryType?: FoodDeliveryType | null;
  /** false = the kitchen delivers it itself (no platform courier). */
  needsCourier?: boolean | null;
  /** 'taxi' = beyond the courier range, a taxi driver delivers it. */
  courierMode?: FoodCourierMode | string | null;
  /** Paid from the bonus balance. */
  bonusUsed?: number | null;
  /** Cash to pay = total − bonus. */
  cashDue?: number | null;
  /** Same id on the orders placed together from several kitchens. */
  groupId?: string | null;
  rejectReason?: string | null;
  cancelledBy?: string | null;
  createdAt: string;
  acceptedAt?: string | null;
  readyAt?: string | null;
  courierAssignedAt?: string | null;
  pickedUpAt?: string | null;
  deliveredAt?: string | null;
  cancelledAt?: string | null;
  kitchen: {
    id: string;
    name: string;
    phone?: string | null;
    logoUrl?: string | null;
    address?: string | null;
    lat: number;
    lng: number;
  } | null;
  courier: FoodCourier | null;
}

export const FOOD_ACTIVE: FoodOrderStatus[] = ['NEW', 'COOKING', 'READY', 'PICKED_UP'];
export const isFoodActive = (s?: FoodOrderStatus | null) => !!s && FOOD_ACTIVE.includes(s);

/** Progress rank — statuses only move forward, so a lower rank is a stale update. */
export const FOOD_RANK: Record<FoodOrderStatus, number> = {
  NEW: 0,
  COOKING: 1,
  READY: 2,
  PICKED_UP: 3,
  DELIVERED: 4,
  REJECTED: 4,
  CANCELLED: 4,
};

export const FOOD_STATUS_LABEL: Record<FoodOrderStatus, string> = {
  NEW: 'Oshxona ko‘rib chiqmoqda',
  COOKING: 'Tayyorlanmoqda',
  READY: 'Tayyor, kuryerni kutmoqda',
  PICKED_UP: 'Kuryer yo‘lda',
  DELIVERED: 'Yetkazildi',
  REJECTED: 'Oshxona rad etdi',
  CANCELLED: 'Bekor qilindi',
};

export const FOOD_STATUS_SHORT: Record<FoodOrderStatus, string> = {
  NEW: 'Yangi',
  COOKING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  PICKED_UP: 'Yo‘lda',
  DELIVERED: 'Yetkazildi',
  REJECTED: 'Rad etildi',
  CANCELLED: 'Bekor qilindi',
};

/** How the order reaches the client. */
export type FoodFlow = 'pickup' | 'kitchen' | 'taxi' | 'courier';

export function foodFlow(o: Pick<FoodOrder, 'deliveryType' | 'needsCourier' | 'courierMode' | 'courier'>): FoodFlow {
  if (o.deliveryType === 'pickup') return 'pickup';
  // A courier already on it wins over the kitchen's earlier choice.
  if (o.needsCourier === false && !o.courier) return 'kitchen';
  if (o.courierMode === 'taxi' || o.courier?.kind === 'taxi') return 'taxi';
  return 'courier';
}

export const isPickup = (o: Pick<FoodOrder, 'deliveryType'>) => o.deliveryType === 'pickup';

/** Status label that knows self-pickup / the kitchen's own delivery / taxi delivery. */
export function foodStatusLabel(o: FoodOrder): string {
  const f = foodFlow(o);
  if (f === 'pickup') {
    if (o.status === 'READY') return 'Tayyor, olib ketishingiz mumkin';
    if (o.status === 'PICKED_UP' || o.status === 'DELIVERED') return 'Olindi';
  } else if (f === 'kitchen') {
    if (o.status === 'READY') return 'Tayyor, oshxona yetkazadi';
    if (o.status === 'PICKED_UP') return 'Oshxona yetkazmoqda';
  } else if (f === 'taxi') {
    if (o.status === 'READY') return 'Tayyor, taksini kutmoqda';
    if (o.status === 'PICKED_UP') return 'Taksi yo‘lda';
  }
  return FOOD_STATUS_LABEL[o.status];
}

export function foodStatusShort(o: FoodOrder): string {
  if (isPickup(o) && (o.status === 'DELIVERED' || o.status === 'PICKED_UP')) return 'Olindi';
  return FOOD_STATUS_SHORT[o.status];
}

export interface FoodStep {
  key: Exclude<FoodOrderStatus, 'REJECTED' | 'CANCELLED'>;
  title: string;
  at: keyof FoodOrder;
}

export const FOOD_STEPS: FoodStep[] = [
  { key: 'NEW', title: 'Buyurtma yuborildi', at: 'createdAt' },
  { key: 'COOKING', title: 'Oshxona qabul qildi — tayyorlanmoqda', at: 'acceptedAt' },
  { key: 'READY', title: 'Ovqat tayyor', at: 'readyAt' },
  { key: 'PICKED_UP', title: 'Kuryer yo‘lda', at: 'pickedUpAt' },
  { key: 'DELIVERED', title: 'Yetkazildi', at: 'deliveredAt' },
];

export const PICKUP_STEPS: FoodStep[] = [
  { key: 'NEW', title: 'Qabul qilindi', at: 'createdAt' },
  { key: 'COOKING', title: 'Tayyorlanmoqda', at: 'acceptedAt' },
  { key: 'READY', title: 'Tayyor, olib ketishingiz mumkin', at: 'readyAt' },
  { key: 'DELIVERED', title: 'Olindi', at: 'deliveredAt' },
];

/** Tracker steps for this order's delivery flow. */
export function foodSteps(o: FoodOrder): FoodStep[] {
  const f = foodFlow(o);
  if (f === 'pickup') return PICKUP_STEPS;
  if (f === 'kitchen') return FOOD_STEPS.map((s) => (s.key === 'PICKED_UP' ? { ...s, title: 'Oshxona yetkazmoqda' } : s));
  if (f === 'taxi') return FOOD_STEPS.map((s) => (s.key === 'PICKED_UP' ? { ...s, title: 'Taksi yo‘lda' } : s));
  return FOOD_STEPS;
}

/** Cash the client hands over (total − bonus). */
export const foodCashDue = (o: FoodOrder) => Math.max(0, Number(o.cashDue ?? Number(o.total) - Number(o.bonusUsed ?? 0)));

/** Turn-by-turn links to a point (the kitchen, for self-pickup). */
export function navLinks(lat: number, lng: number) {
  const ll = `${Number(lat)},${Number(lng)}`;
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${ll}`,
    yandex: `https://yandex.uz/maps/?rtext=~${ll}&rtt=auto`,
  };
}

/** Random id shared by the orders placed together (crypto.randomUUID when available). */
export function newGroupId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  } catch {
    /* insecure context */
  }
  const h = (n: number) => Array.from({ length: n }, () => Math.floor(Math.random() * 16).toString(16)).join('');
  return `${h(8)}-${h(4)}-4${h(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${h(3)}-${h(12)}`;
}

/**
 * Uploaded files (/uploads/food/x.jpg) live on the API origin; nginx serves
 * /uploads/ directly (long cache), so the trailing /api is dropped.
 */
export function foodImg(url?: string | null): string {
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  const origin = (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001').replace(/\/$/, '').replace(/\/api$/, '');
  return origin + (url.startsWith('/') ? url : '/' + url);
}

export const fmtKm = (km?: number | null) => (km == null ? '' : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`);

/** "2× Lavash, 1× Cola" */
export const itemsSummary = (items: FoodOrderLine[]) => items.map((i) => `${i.qty}× ${i.name}`).join(', ');

export const courierKindLabel = (c: FoodCourier) => (c.kind === 'taxi' ? 'Taksi haydovchisi' : 'Kuryer');

/** Text for a status-change notification (toast + native). */
export function foodNoticeText(o: FoodOrder, kind: 'status' | 'courier'): { emoji: string; title: string; body: string } {
  const k = o.kitchen?.name ?? 'Oshxona';
  const c = o.courier;
  const f = foodFlow(o);
  if (kind === 'courier' && c) {
    return {
      emoji: c.kind === 'taxi' ? '🚕' : '🛵',
      title: c.kind === 'taxi' ? 'Taksi haydovchisi biriktirildi' : 'Kuryer biriktirildi',
      body: `${c.fullName}${c.carPlate ? ' · ' + c.carPlate : ''} · #${o.number}`,
    };
  }
  switch (o.status) {
    case 'COOKING':
      return { emoji: '👨‍🍳', title: 'Oshxona buyurtmani qabul qildi', body: `${k} · ~${o.prepMinutes ?? 30} daqiqada tayyor bo‘ladi` };
    case 'READY':
      if (f === 'pickup') return { emoji: '✅', title: 'Ovqat tayyor — olib ketishingiz mumkin', body: o.kitchen?.address ? `${k} · ${o.kitchen.address}` : k };
      if (f === 'kitchen') return { emoji: '✅', title: 'Ovqat tayyor', body: 'Oshxona o‘zi yetkazib beradi' };
      return {
        emoji: '✅',
        title: 'Ovqat tayyor',
        body: c ? `${c.fullName} olib ketadi` : f === 'taxi' ? 'Taksi olib ketishini kutmoqda' : 'Kuryer olib ketishini kutmoqda',
      };
    case 'PICKED_UP':
      if (f === 'kitchen') return { emoji: '🛵', title: 'Oshxona yetkazmoqda', body: `#${o.number} yo‘lda` };
      if (f === 'taxi') return { emoji: '🚕', title: 'Taksi yo‘lda', body: c ? `${c.fullName} buyurtmangizni olib kelmoqda` : `#${o.number} yo‘lda` };
      return { emoji: '🛵', title: 'Kuryer yo‘lda', body: c ? `${c.fullName} buyurtmangizni olib kelmoqda` : `#${o.number} yo‘lda` };
    case 'DELIVERED':
      return { emoji: '🎉', title: f === 'pickup' ? 'Buyurtma olindi' : 'Buyurtma yetkazildi', body: 'Yoqimli ishtaha!' };
    case 'REJECTED':
      return { emoji: '❌', title: 'Oshxona buyurtmani rad etdi', body: o.rejectReason ?? k };
    case 'CANCELLED':
      return { emoji: '❌', title: 'Ovqat buyurtmasi bekor qilindi', body: `#${o.number} · ${k}` };
    default:
      return { emoji: '🍔', title: 'Buyurtma yuborildi', body: f === 'pickup' ? `${k} · o‘zingiz olib ketasiz` : k };
  }
}
