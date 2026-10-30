import { api } from '@/lib/api';

/** Food delivery types + helpers shared by the admin and kitchen panels. */

export type FoodStatus =
  | 'NEW'
  | 'COOKING'
  | 'READY'
  | 'PICKED_UP'
  | 'DELIVERED'
  | 'REJECTED'
  | 'CANCELLED';

export const FOOD_STATUSES: FoodStatus[] = [
  'NEW',
  'COOKING',
  'READY',
  'PICKED_UP',
  'DELIVERED',
  'REJECTED',
  'CANCELLED',
];

export const FOOD_STATUS_LABEL: Record<FoodStatus, string> = {
  NEW: 'Yangi',
  COOKING: 'Tayyorlanmoqda',
  READY: 'Tayyor',
  PICKED_UP: 'Kuryerda',
  DELIVERED: 'Yetkazildi',
  REJECTED: 'Rad etildi',
  CANCELLED: 'Bekor qilindi',
};

export const FOOD_STATUS_TONE: Record<FoodStatus, string> = {
  NEW: 'bg-blue-50 text-blue-700 border-blue-200',
  COOKING: 'bg-gold/15 text-gold-deep border-gold/40',
  READY: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  PICKED_UP: 'bg-violet-50 text-violet-700 border-violet-200',
  DELIVERED: 'bg-green-50 text-green-700 border-green-200',
  REJECTED: 'bg-red-50 text-red-700 border-red-200',
  CANCELLED: 'bg-red-50 text-red-700 border-red-200',
};

export const foodStatusLabel = (s: string) =>
  FOOD_STATUS_LABEL[s as FoodStatus] ?? s;

export const isFoodFinal = (s: string) =>
  s === 'DELIVERED' || s === 'REJECTED' || s === 'CANCELLED';

export interface KitchenStats {
  items: number;
  today: number;
  active: number;
  sales: number;
  commission: number;
}

export interface Kitchen {
  id: string;
  name: string;
  phone: string | null;
  address: string | null;
  lat: number;
  lng: number;
  logoUrl: string | null;
  description: string | null;
  username: string;
  isActive: boolean;
  isOpen: boolean;
  prepMinutes: number;
  minOrder: string;
  commissionPercent: string;
  sort: number;
  /** Closed-loop wallet (admin tops it up, commission is taken from it). */
  balance?: string;
  /** Default for new orders: call a platform courier (false = own delivery). */
  needsCourier?: boolean;
  /** 'custom' = per-km prices below (or global), 'taxi' = taxi tariff. */
  deliveryPricing?: 'custom' | 'taxi';
  deliveryBaseFee?: string | null;
  deliveryFreeKm?: string | null;
  deliveryPerKm?: string | null;
  /** Farther than this → a taxi at the taxi tariff (null = no limit). */
  courierMaxKm?: string | null;
  createdAt: string;
  updatedAt?: string;
  stats?: KitchenStats | null;
}

/** 'dish' taom, 'raw' xom ashyo, 'semi' yarim tayyor mahsulot. */
export type MenuItemKind = 'dish' | 'raw' | 'semi';

export const MENU_KIND_LABEL: Record<MenuItemKind, string> = {
  dish: 'Taom',
  raw: 'Xom ashyo',
  semi: 'Yarim tayyor mahsulot',
};

export const MENU_KIND_TONE: Record<MenuItemKind, string> = {
  dish: 'bg-neutral-100 text-neutral-600 border-neutral-200',
  raw: 'bg-lime-50 text-lime-800 border-lime-200',
  semi: 'bg-orange-50 text-orange-700 border-orange-200',
};

/** A courier/driver attached to a kitchen ("o‘z kuryerlari"). */
export interface KitchenCourier {
  driverId: string;
  fullName: string;
  phone: string;
  kind: 'taxi' | 'courier';
  isOnline: boolean;
  carPlate: string | null;
}

export interface KitchenLedgerRow {
  id: string;
  kind: string;
  /** Positive = the kitchen received money, negative = taken from it. */
  amount: number;
  note: string | null;
  createdAt: string;
}

export interface KitchenWallet {
  balance: number;
  ledger: KitchenLedgerRow[];
}

export interface MenuCategory {
  id: string;
  kitchenId?: string;
  name: string;
  sort: number;
}

export interface MenuItem {
  id: string;
  kitchenId?: string;
  categoryId: string | null;
  name: string;
  description: string | null;
  price: string;
  photoUrl: string | null;
  isAvailable: boolean;
  sort: number;
  kind?: MenuItemKind;
}

export interface MenuResponse {
  kitchen: Kitchen;
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
  kind?: 'taxi' | 'courier';
  carModel?: string | null;
  carPlate?: string | null;
  avatarUrl?: string | null;
}

/** Order view returned by the API (client / kitchen / admin share it). */
export interface FoodOrder {
  id: string;
  number: number;
  status: FoodStatus;
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
  rejectReason: string | null;
  cancelledBy: string | null;
  createdAt: string;
  acceptedAt: string | null;
  readyAt: string | null;
  courierAssignedAt: string | null;
  pickedUpAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  kitchen: {
    id: string;
    name: string;
    phone: string | null;
    logoUrl: string | null;
    address: string | null;
  } | null;
  courier: FoodCourier | null;
  /** 'pickup' = the client collects it at the kitchen. */
  deliveryType?: 'delivery' | 'pickup';
  /** false = the kitchen delivers it itself (no platform courier). */
  needsCourier?: boolean;
  /** 'taxi' = too far for couriers — a taxi delivers it at the taxi tariff. */
  courierMode?: 'courier' | 'taxi';
  /** Part paid from the client's bonus balance. */
  bonusUsed?: number;
  /** Cash to collect from the client (total − bonusUsed). */
  cashDue?: number;
  /** 'kitchen' = typed in by the kitchen (phone / walk-in client). */
  createdBy?: 'client' | 'kitchen';
  groupId?: string | null;
  clientName?: string | null;
  kitchenCommission?: number;
  dispatchStage?: 'own' | 'personal' | 'all' | null;
}

export interface AdminFoodOrder extends FoodOrder {
  clientName: string | null;
  clientPhone: string | null;
  courierCommission: number;
  kitchenCommission: number;
  dispatchStage: 'own' | 'personal' | 'all' | null;
}

export interface FoodSummary {
  today: number;
  active: number;
  delivered_today: number;
  turnover_today: number;
  commission_month: number;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

/** Uploaded files come back relative (/uploads/food/x.jpg). */
export function resolveMediaUrl(raw?: string | null): string {
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('blob:')) return raw;
  return API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
}

/** 12 500 → "12 500" (Uzbek grouping, same as the other pages). */
export const som = (v: number | string | null | undefined) =>
  Number(v ?? 0).toLocaleString('uz');

const pad = (n: number) => String(n).padStart(2, '0');

/** "23:15" */
export function timeHM(s?: string | Date | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Minutes since the given moment (never negative). */
export function minutesSince(s?: string | Date | null, now = Date.now()): number {
  if (!s) return 0;
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now - t) / 60000));
}

/** "45 s", "3 daq 5 s", "1 soat 2 daq" */
export function fmtDuration(totalSec: number): string {
  const s = Math.max(0, Math.round(totalSec));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} daq${s % 60 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  return `${h} soat${m % 60 ? ` ${m % 60} daq` : ''}`;
}

/** Multipart photo upload (field "file") → relative URL. */
export async function uploadFoodPhoto(path: string, file: File): Promise<string> {
  const fd = new FormData();
  fd.append('file', file);
  const { data } = await api.post<{ url: string }>(path, fd, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data.url;
}

export const osmLink = (lat: number, lng: number) =>
  `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=17/${lat}/${lng}`;

const valid = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180 &&
  !(lat === 0 && lng === 0);

/**
 * Pull coordinates out of whatever the admin pastes: "41.31, 69.27",
 * a Google Maps link (@lat,lng / ?q=lat,lng / !3dlat!4dlng), a Yandex link
 * (ll= / pt= / whatshere — those are lng,lat!), an OpenStreetMap link
 * (mlat/mlon, #map=z/lat/lng) or a 2GIS link (m=lng,lat).
 */
export function parseLatLng(input: string): { lat: number; lng: number } | null {
  let s = (input ?? '').trim();
  if (!s) return null;
  try {
    s = decodeURIComponent(s);
  } catch {
    /* keep as is */
  }
  const N = '(-?\\d{1,3}(?:\\.\\d+)?)';
  const pick = (re: RegExp, lngFirst = false) => {
    const m = s.match(re);
    if (!m) return null;
    const a = Number(m[1]);
    const b = Number(m[2]);
    const lat = lngFirst ? b : a;
    const lng = lngFirst ? a : b;
    return valid(lat, lng) ? { lat, lng } : null;
  };

  // Google: the place pin (!3d..!4d..) is more exact than the viewport (@).
  const google =
    pick(new RegExp(`!3d${N}!4d${N}`)) ??
    pick(new RegExp(`[?&](?:q|query|destination|daddr|center)=${N}\\s*,\\+?\\s*${N}`)) ??
    pick(new RegExp(`/(?:search|place|dir)/${N}\\s*,\\+?\\s*${N}`)) ??
    pick(new RegExp(`@${N},${N}`));
  if (google) return google;

  // OpenStreetMap
  const osm =
    pick(new RegExp(`mlat=${N}&mlon=${N}`)) ??
    pick(new RegExp(`#map=\\d+/${N}/${N}`));
  if (osm) return osm;

  // Yandex and 2GIS put longitude first.
  const lngFirst =
    pick(new RegExp(`whatshere\\[point\\]=${N},${N}`), true) ??
    pick(new RegExp(`[?&]pt=${N},${N}`), true) ??
    pick(new RegExp(`[?&]ll=${N},${N}`), true) ??
    pick(new RegExp(`[?&]m=${N},${N}`), true);
  if (lngFirst) return lngFirst;

  // Plain "lat, lng" (or "lat lng").
  const m = s.match(new RegExp(`^${N}\\s*[,;\\s]\\s*${N}$`));
  if (m) {
    let lat = Number(m[1]);
    let lng = Number(m[2]);
    // Uzbekistan: lat ≈ 37–46, lng ≈ 56–74 — the ranges never overlap, so
    // a pair typed as "lng, lat" can be safely swapped back.
    if (Math.abs(lat) > 90 || (lat > 50 && lat < 80 && lng > 30 && lng < 50)) {
      [lat, lng] = [lng, lat];
    }
    return valid(lat, lng) ? { lat, lng } : null;
  }
  return null;
}

/** Short share links can't be expanded from the browser (CORS). */
export const isShortMapLink = (s: string) =>
  /(goo\.gl|maps\.app\.goo\.gl|yandex\.[a-z]+\/maps\/-\/|go\.2gis\.com)/i.test(s);

export function genPassword(len = 10): string {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < len; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

export const apiError = (e: any, fallback = 'Xato'): string => {
  const m = e?.response?.data?.message ?? e?.message;
  return Array.isArray(m) ? m.join(', ') : m || fallback;
};
