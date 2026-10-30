// Mirror of backend/src/common/utils/fare.ts — the live estimate in the
// driver app must match what the server charges at the end of the ride.

export interface TariffTier {
  uptoKm: number;
  price: number;
}

export interface FareTariff {
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

/** Commission for a fare: percentage when configured, else the fixed fee. */
export function commissionFor(fare: number, t: FareTariff): number {
  return t.commissionPercent && t.commissionPercent > 0
    ? Math.round((fare * t.commissionPercent) / 100)
    : t.commissionPerOrder;
}
