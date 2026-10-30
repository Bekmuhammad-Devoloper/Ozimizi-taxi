import type { LatLng } from '@/components/MapView';
import { haversineKm } from '@/lib/haversine';

/** Reverse geocoding for the pickup label (OpenStreetMap Nominatim, ≤1 req/s). */
let last = 0;
let inflight: AbortController | null = null;

function label(j: { address?: Record<string, string>; display_name?: string; name?: string }): string | null {
  const a = j.address ?? {};
  const parts = [
    j.name && j.name !== a.road ? j.name : null,
    [a.road, a.house_number].filter(Boolean).join(' '),
    a.neighbourhood || a.suburb || a.quarter || a.residential,
    a.city || a.town || a.village || a.county,
  ].filter(Boolean);
  return parts.length ? parts.join(', ') : (j.display_name ?? null);
}

async function throttle() {
  const wait = Math.max(0, 1100 - (Date.now() - last));
  if (wait) await new Promise((r) => setTimeout(r, wait));
  last = Date.now();
}

export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  inflight?.abort();
  await throttle();
  const ctrl = new AbortController();
  inflight = ctrl;
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&zoom=17&accept-language=uz,ru,en`;
    const res = await fetch(url, { signal: ctrl.signal, headers: { Accept: 'application/json' } });
    if (!res.ok) return null;
    return label(await res.json());
  } catch {
    return null;
  }
}

export interface Place {
  id: string;
  name: string;
  detail: string;
  lat: number;
  lng: number;
}

/** Address / place search (Uzbekistan), biased towards `near`. */
export async function searchPlaces(q: string, near?: LatLng | null): Promise<Place[]> {
  const query = q.trim();
  if (query.length < 2) return [];
  inflight?.abort();
  await throttle();
  const ctrl = new AbortController();
  inflight = ctrl;
  try {
    const params = new URLSearchParams({
      format: 'jsonv2',
      q: query,
      countrycodes: 'uz',
      limit: '7',
      addressdetails: '1',
      'accept-language': 'uz,ru,en',
    });
    if (near) {
      const d = 0.35;
      params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
      params.set('bounded', '0');
    }
    const res = await fetch(`https://nominatim.openstreetmap.org/search?${params}`, {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as any[];
    const seen = new Set<string>();
    return rows
      .map((r) => {
        const a = r.address ?? {};
        const name = r.name || [a.road, a.house_number].filter(Boolean).join(' ') || r.display_name.split(',')[0];
        const detail = [a.neighbourhood || a.suburb || a.quarter, a.city || a.town || a.village || a.county]
          .filter(Boolean)
          .join(', ');
        return { id: String(r.place_id), name, detail, lat: Number(r.lat), lng: Number(r.lon) };
      })
      .filter((p) => {
        const k = p.name + '|' + p.detail;
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      });
  } catch {
    return [];
  }
}

export interface RouteInfo {
  distanceKm: number;
  durationMin: number;
  coords: LatLng[];
  exact: boolean;
}

/** Driving route via the public OSRM demo; straight line × 1.3 when unavailable. */
export async function routeBetween(a: LatLng, b: LatLng): Promise<RouteInfo> {
  const fallback = (): RouteInfo => {
    const km = Math.round(haversineKm(a.lat, a.lng, b.lat, b.lng) * 1.3 * 10) / 10;
    return { distanceKm: km, durationMin: Math.max(2, Math.round((km / 25) * 60)), coords: [a, b], exact: false };
  };
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 6000);
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { signal: ctrl.signal });
    clearTimeout(t);
    if (!res.ok) return fallback();
    const j = await res.json();
    const r = j?.routes?.[0];
    if (!r) return fallback();
    const coords = (r.geometry?.coordinates ?? []).map(([lng, lat]: [number, number]) => ({ lat, lng }));
    return {
      distanceKm: Math.round((r.distance / 1000) * 10) / 10,
      durationMin: Math.max(2, Math.round(r.duration / 60)),
      coords: coords.length ? coords : [a, b],
      exact: true,
    };
  } catch {
    return fallback();
  }
}

/** Recently used destinations (per device). */
const RECENT_KEY = 'moviy-recent-dest';
export function recentPlaces(): Place[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}
export function rememberPlace(p: Place) {
  try {
    const list = [p, ...recentPlaces().filter((x) => x.id !== p.id)].slice(0, 6);
    localStorage.setItem(RECENT_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
}
