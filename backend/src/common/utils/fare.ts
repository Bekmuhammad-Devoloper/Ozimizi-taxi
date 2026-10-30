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

export interface FareTariff {
  pricePerKm: number | string;
  minimumFare: number | string;
  tiers?: TariffTier[] | null;
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
