// Live ride meter helpers shared by /order/active and /taximeter: the
// waiting clock, its fee and the running fare — the same formulas the server
// uses when it completes the ride (order.service complete()).
import type { OrderModel } from '@/stores/order';
import { computeFare, type FareTariff } from '@/lib/fare';

/** GET /driver/tariff */
export interface DriverTariff extends FareTariff {
  waitingFreeMinutes?: number;
  waitingPricePerMinute?: number;
}

// ---- server clock ----------------------------------------------------------
// Waiting / ride timers subtract server timestamps (waitTickAt, startedAt)
// from "now". A phone whose clock is off by a few seconds (or minutes) made
// the timer jump whenever a server value replaced a local one, so we keep an
// estimate of (device time − server time). Each sample is a server
// timestamp of "right now" taken when it arrives; network delay only makes a
// sample larger, so the smallest recent one is the best estimate.
const offsetSamples: number[] = [];
let clockOffsetMs = 0;

/** Record a server timestamp that was "now" on the server just before it reached us. */
export function noteServerTime(iso: string | null | undefined): void {
  if (!iso) return;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return;
  offsetSamples.push(Date.now() - t);
  if (offsetSamples.length > 8) offsetSamples.shift();
  clockOffsetMs = Math.min(...offsetSamples);
}

/** Current time on the server's clock (ms). */
export function serverNow(): number {
  return Date.now() - clockOffsetMs;
}

// ---- waiting -----------------------------------------------------------------

/** The waiting clock is running: pickup wait, or a mid-ride pause. */
export function isWaitCounting(o: OrderModel | null | undefined): boolean {
  if (!o) return false;
  return o.status === 'ARRIVED' || (o.status === 'IN_PROGRESS' && !!o.waitStartedAt);
}

/**
 * Waiting shown live: the server's metered total plus the time since its
 * last tick — unless the car was moving at that tick (then it's not counted).
 */
export function liveWaitSec(o: OrderModel, now: number = serverNow()): number {
  const base = Number(o.waitingSeconds ?? 0);
  if (!isWaitCounting(o) || o.waitMoving) return base;
  const since = o.waitTickAt ?? (o.status === 'ARRIVED' ? o.arrivedAt : o.waitStartedAt);
  if (!since) return base;
  return base + Math.max(0, (now - new Date(since).getTime()) / 1000);
}

/** Waiting fee: whole minutes beyond the free ones × price per minute. */
export function waitFeeFor(waitSec: number, t: DriverTariff | null | undefined): number {
  if (!t) return 0;
  const billable = Math.max(0, Math.ceil(waitSec / 60 - Number(t.waitingFreeMinutes ?? 0)));
  return billable * Number(t.waitingPricePerMinute ?? 0);
}

/** Running fare: distance fare (tiers / per km / minimum) + waiting fee. */
export function liveFare(km: number, waitSec: number, t: DriverTariff): number {
  return computeFare(km, t) + waitFeeFor(waitSec, t);
}

// ---- formatting ----------------------------------------------------------------

/** 75 → "01:15", 3725 → "1:02:05". */
export function fmtClock(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p = (n: number) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${p(m)}:${p(ss)}` : `${p(m)}:${p(ss)}`;
}

/** 12000 → "12 000" (uz grouping). */
export function fmtSum(v: unknown): string {
  return Math.round(Number(v ?? 0) || 0).toLocaleString('uz');
}
