// Mirror of backend/src/common/utils/fare.ts — the live estimate in the
// driver app must match what the server charges at the end of the ride.

export interface TariffTier {
  uptoKm: number;
  price: number;
}

export interface ZonePoint {
  lat: number;
  lng: number;
}

export interface FareTariff {
  /** Admin-drawn zone; km outside it cost outsidePricePerKm. */
  zonePolygon?: ZonePoint[] | null;
  outsidePricePerKm?: number | null;
  pricePerKm: number;
  minimumFare: number;
  tiers?: TariffTier[] | null;
  roundTo?: number;
  commissionPerOrder: number;
  commissionPercent?: number;
}

export function computeFare(distanceKm: number, t: FareTariff): number {
  const km = Math.max(0, Number(distanceKm) || 0);
  const step = t.roundTo || 1000;
  const tiers = (t.tiers ?? [])
    .map((x) => ({ uptoKm: Number(x.uptoKm), price: Number(x.price) }))
    .filter((x) => x.uptoKm > 0 && x.price >= 0)
    .sort((a, b) => a.uptoKm - b.uptoKm);

  let raw: number;
  if (tiers.length) {
    const hit = tiers.find((x) => km <= x.uptoKm);
    const last = tiers[tiers.length - 1];
    raw = hit ? hit.price : last.price + (km - last.uptoKm) * t.pricePerKm;
  } else {
    raw = Math.max(km * t.pricePerKm, t.minimumFare);
  }
  return Math.round(raw / step) * step;
}

/** True when the admin drew a zone and set a price for km outside it. */
export function zoneActive(t: FareTariff | null | undefined): boolean {
  return (t?.zonePolygon?.length ?? 0) >= 3 && Number(t?.outsidePricePerKm) > 0;
}

/** Ray casting: is the point inside the polygon? */
export function insidePolygon(lat: number, lng: number, poly: ZonePoint[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.lng > lng !== b.lng > lng && lat < ((b.lat - a.lat) * (lng - a.lng)) / (b.lng - a.lng) + a.lat) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Fare with the zone: km inside by the normal tariff, km outside at the
 * admin's outside price. Coming back inside continues the normal count.
 */
export function computeZonedFare(totalKm: number, outsideKm: number, t: FareTariff): number {
  if (!zoneActive(t)) return computeFare(totalKm, t);
  const total = Math.max(0, Number(totalKm) || 0);
  const outside = Math.min(total, Math.max(0, Number(outsideKm) || 0));
  const step = t.roundTo || 1000;
  return computeFare(total - outside, t) + Math.round((outside * Number(t.outsidePricePerKm)) / step) * step;
}

/** How much of a planned path lies outside the zone (share 0…1). */
export function outsideShare(path: ZonePoint[], t: FareTariff): number {
  if (!zoneActive(t) || path.length < 2) return 0;
  const poly = t.zonePolygon!;
  let all = 0;
  let out = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const seg = Math.hypot(a.lat - b.lat, (a.lng - b.lng) * Math.cos((a.lat * Math.PI) / 180));
    all += seg;
    if (!insidePolygon((a.lat + b.lat) / 2, (a.lng + b.lng) / 2, poly)) out += seg;
  }
  return all > 0 ? out / all : 0;
}

/** Commission for a fare: percentage when configured, else the fixed fee. */
export function commissionFor(fare: number, t: FareTariff): number {
  return t.commissionPercent && t.commissionPercent > 0
    ? Math.round((fare * t.commissionPercent) / 100)
    : t.commissionPerOrder;
}
