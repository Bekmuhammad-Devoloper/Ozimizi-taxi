import { getPosition } from '@/lib/native';

export interface Pos {
  lat: number;
  lng: number;
}

/** Tashkent centre — until the phone tells us where we are. */
export const DEFAULT_POS: Pos = { lat: 41.3111, lng: 69.2797 };

const KEY = 'moviy-last-pos';

/** Last GPS fix on this device (taxi home screen or food pages). */
export function lastLocation(): Pos | null {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    return p && Number.isFinite(p.lat) && Number.isFinite(p.lng) ? { lat: p.lat, lng: p.lng } : null;
  } catch {
    return null;
  }
}

export function rememberLocation(p: Pos) {
  try {
    localStorage.setItem(KEY, JSON.stringify({ lat: p.lat, lng: p.lng, at: Date.now() }));
  } catch {
    /* ignore */
  }
}

/** One GPS fix (same helper as the taxi home screen), remembered for next time. */
export async function currentLocation(): Promise<Pos> {
  const f = await getPosition();
  const p = { lat: f.lat, lng: f.lng };
  rememberLocation(p);
  return p;
}
