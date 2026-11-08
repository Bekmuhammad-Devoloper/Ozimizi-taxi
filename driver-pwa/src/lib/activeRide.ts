import { api } from '@/lib/api';

/** A ride this driver has taken and not finished. */
export const RIDE_STATUSES = ['ACCEPTED', 'ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'];

/**
 * The ride this driver is on right now, from the server. A server without
 * /driver/orders/active (older version) answers 404: then the newest ride in
 * the history that is still going.
 */
export async function fetchActiveRide(): Promise<any | null> {
  try {
    const { data } = await api.get('/driver/orders/active');
    return data ?? null;
  } catch (e: any) {
    if (e?.response?.status !== 404) throw e;
  }
  const { data } = await api.get('/driver/orders/history');
  const list: any[] = Array.isArray(data) ? data : [];
  return list.find((o) => RIDE_STATUSES.includes(o?.status)) ?? null;
}
