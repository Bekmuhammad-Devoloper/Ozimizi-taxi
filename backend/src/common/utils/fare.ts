/** Fares are rounded to whole thousands — no 7 500 / 8 200 so‘m prices. */
export const FARE_ROUND_TO = 1000;

export function roundFare(amount: number): number {
  return Math.round(amount / FARE_ROUND_TO) * FARE_ROUND_TO;
}

/** One row of the admin's distance price table: "up to X km → Y so‘m". */
export interface TariffTier {
  uptoKm: number;
  price: number;
}

export interface ZonePoint {
  lat: number;
  lng: number;
}

export interface FareTariff {
  pricePerKm: number | string;
  minimumFare: number | string;
  tiers?: TariffTier[] | null;
  /** Admin-drawn zone; km outside it cost outsidePricePerKm. */
  zonePolygon?: ZonePoint[] | null;
  outsidePricePerKm?: number | string | null;
}

/**
 * Fare for a ride (keep in sync with driver-pwa/src/lib/fare.ts):
 *  - with tiers: the first tier whose limit covers the distance wins;
 *    past the last tier it's lastTier.price + extra km × pricePerKm;
 *  - without tiers: max(distance × pricePerKm, minimumFare).
 * Result is rounded to whole thousands.
 */
export function computeFare(distanceKm: number, t: FareTariff): number {
  const km = Math.max(0, Number(distanceKm) || 0);
  const perKm = Number(t.pricePerKm) || 0;
  const tiers = (t.tiers ?? [])
    .map((x) => ({ uptoKm: Number(x.uptoKm), price: Number(x.price) }))
    .filter((x) => x.uptoKm > 0 && x.price >= 0)
    .sort((a, b) => a.uptoKm - b.uptoKm);

  let raw: number;
  if (tiers.length) {
    const hit = tiers.find((x) => km <= x.uptoKm);
    const last = tiers[tiers.length - 1];
    raw = hit ? hit.price : last.price + (km - last.uptoKm) * perKm;
  } else {
    raw = Math.max(km * perKm, Number(t.minimumFare) || 0);
  }
  return roundFare(raw);
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
  return computeFare(total - outside, t) + roundFare(outside * Number(t.outsidePricePerKm));
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
