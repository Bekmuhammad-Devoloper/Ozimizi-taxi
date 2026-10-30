'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, Marker, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';

export interface LatLng {
  lat: number;
  lng: number;
}

interface Props {
  center: LatLng;
  zoom?: number;
  /** Pin stays in the middle; the map moves under it (choose a point). */
  pinAtCenter?: boolean;
  /** Which point the centre pin represents (affects its look). */
  pinKind?: 'pickup' | 'dest';
  onMoveStart?: () => void;
  onMoveEnd?: (c: LatLng) => void;
  pickup?: LatLng | null;
  /** Pulsing rings around the pickup pin (searching for a driver). */
  pulse?: boolean;
  dest?: LatLng | null;
  /** Route polyline (pickup → dest). */
  route?: LatLng[] | null;
  driver?: LatLng | null;
  /** Re-center the map whenever this changes (e.g. follow the car). */
  follow?: LatLng | null;
  /** Extra bottom padding (px) so fitBounds keeps markers above a sheet. */
  padBottom?: number;
  /** Shift the view so `center`/pickup sits this many px above the middle. */
  offsetY?: number;
  className?: string;
}

const CAR_ICON = `<div style="width:40px;height:40px;border-radius:50%;background:#3b9bff;border:3px solid #0a0a0a;box-shadow:0 8px 18px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:21px">🚕</div>`;
const PIN_A = `<svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 43C17 43 32 27.5 32 16.5C32 8 25.3 1 17 1S2 8 2 16.5C2 27.5 17 43 17 43Z" fill="#0a0a0a" stroke="#3b9bff" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="#3b9bff"/></svg>`;
const PIN_B = `<svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 43C17 43 32 27.5 32 16.5C32 8 25.3 1 17 1S2 8 2 16.5C2 27.5 17 43 17 43Z" fill="#3b9bff" stroke="#0a0a0a" stroke-width="2"/><text x="17" y="21.5" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-weight="800" font-size="13" fill="#0a0a0a">B</text></svg>`;
const pinHtml = (pulse: boolean) =>
  `<div class="pin-wrap">${pulse ? '<span class="pin-pulse"></span><span class="pin-pulse delay"></span>' : ''}${PIN_A}</div>`;

/**
 * Leaflet map with OpenStreetMap tiles (client-side only). The root is
 * isolated so Leaflet's internal z-indexes never leak over app overlays.
 * Effects key on primitive lat/lng values and a `ready` flag, so markers are
 * (re)applied once the map exists and never re-fit on unrelated renders.
 */
export function MapView({
  center,
  zoom = 16,
  pinAtCenter,
  pinKind = 'pickup',
  onMoveStart,
  onMoveEnd,
  pickup,
  pulse,
  dest,
  route,
  driver,
  follow,
  padBottom = 0,
  offsetY = 0,
  className,
}: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const pickupM = useRef<Marker | null>(null);
  const destM = useRef<Marker | null>(null);
  const driverM = useRef<Marker | null>(null);
  const routeL = useRef<Polyline | null>(null);
  const routeBg = useRef<Polyline | null>(null);
  const onMoveRef = useRef(onMoveEnd);
  const onStartRef = useRef(onMoveStart);
  onMoveRef.current = onMoveEnd;
  onStartRef.current = onMoveStart;
  const [ready, setReady] = useState(false);

  const pLat = pickup?.lat;
  const pLng = pickup?.lng;
  const bLat = dest?.lat;
  const bLng = dest?.lng;
  const dLat = driver?.lat;
  const dLng = driver?.lng;
  const fLat = follow?.lat;
  const fLng = follow?.lng;
  const routeKey = route ? `${route.length}:${route[0]?.lat},${route[0]?.lng}:${route[route.length - 1]?.lat},${route[route.length - 1]?.lng}` : '';

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      const m = mod.map(el.current, { zoomControl: false, attributionControl: true });
      mod.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(m);
      m.setView([center.lat, center.lng], zoom);
      if (offsetY) m.panBy([0, offsetY], { animate: false });
      m.on('movestart', () => onStartRef.current?.());
      m.on('moveend', () => {
        const c = m.getCenter();
        onMoveRef.current?.({ lat: c.lat, lng: c.lng });
      });
      map.current = m;
      setTimeout(() => m.invalidateSize(), 60);
      setTimeout(() => m.invalidateSize(), 400);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pickup marker (+ pulse)
  useEffect(() => {
    const m = map.current;
    const mod = L.current;
    if (!ready || !m || !mod) return;
    if (pLat != null && pLng != null) {
      const icon = mod.divIcon({ html: pinHtml(!!pulse), className: '', iconSize: [34, 44], iconAnchor: [17, 43] });
      if (!pickupM.current) pickupM.current = mod.marker([pLat, pLng], { icon, interactive: false }).addTo(m);
      else {
        pickupM.current.setLatLng([pLat, pLng]);
        pickupM.current.setIcon(icon);
      }
    } else if (pickupM.current) {
      pickupM.current.remove();
      pickupM.current = null;
    }
  }, [ready, pLat, pLng, pulse]);

  // Destination marker
  useEffect(() => {
    const m = map.current;
    const mod = L.current;
    if (!ready || !m || !mod) return;
    if (bLat != null && bLng != null) {
      if (!destM.current) {
        destM.current = mod
          .marker([bLat, bLng], { icon: mod.divIcon({ html: PIN_B, className: '', iconSize: [34, 44], iconAnchor: [17, 43] }), interactive: false })
          .addTo(m);
      } else destM.current.setLatLng([bLat, bLng]);
    } else if (destM.current) {
      destM.current.remove();
      destM.current = null;
    }
  }, [ready, bLat, bLng]);

  // Route polyline (dark casing + gold core)
  useEffect(() => {
    const m = map.current;
    const mod = L.current;
    if (!ready || !m || !mod) return;
    routeL.current?.remove();
    routeBg.current?.remove();
    routeL.current = null;
    routeBg.current = null;
    if (route && route.length > 1) {
      const pts = route.map((p) => [p.lat, p.lng] as [number, number]);
      routeBg.current = mod.polyline(pts, { color: '#0a0a0a', weight: 7, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }).addTo(m);
      routeL.current = mod.polyline(pts, { color: '#3b9bff', weight: 3.5, opacity: 1, lineCap: 'round', lineJoin: 'round' }).addTo(m);
    }
  }, [ready, routeKey, route]);

  // Driver marker
  useEffect(() => {
    const m = map.current;
    const mod = L.current;
    if (!ready || !m || !mod) return;
    if (dLat != null && dLng != null) {
      if (!driverM.current) {
        driverM.current = mod
          .marker([dLat, dLng], { icon: mod.divIcon({ html: CAR_ICON, className: '', iconSize: [40, 40], iconAnchor: [20, 20] }), interactive: false })
          .addTo(m);
      } else driverM.current.setLatLng([dLat, dLng]);
    } else if (driverM.current) {
      driverM.current.remove();
      driverM.current = null;
    }
  }, [ready, dLat, dLng]);

  // Follow / recenter
  useEffect(() => {
    const m = map.current;
    if (!ready || !m || fLat == null || fLng == null) return;
    m.panTo([fLat, fLng], { animate: true });
  }, [ready, fLat, fLng]);

  // Fit: driver+pickup while the car comes; pickup+dest (+route) while planning.
  useEffect(() => {
    const m = map.current;
    const mod = L.current;
    if (!ready || !m || !mod || fLat != null || pLat == null || pLng == null) return;
    let b: import('leaflet').LatLngBounds | null = null;
    if (dLat != null && dLng != null) b = mod.latLngBounds([pLat, pLng], [dLat, dLng]);
    else if (bLat != null && bLng != null) {
      b = mod.latLngBounds([pLat, pLng], [bLat, bLng]);
      if (route && route.length > 1) route.forEach((p) => b!.extend([p.lat, p.lng]));
    }
    if (!b) return;
    m.fitBounds(b.pad(0.2), { animate: true, maxZoom: 16, paddingBottomRight: [40, padBottom], paddingTopLeft: [40, 90] });
  }, [ready, dLat, dLng, pLat, pLng, bLat, bLng, fLat, padBottom, routeKey, route]);

  return (
    <div className={'isolate ' + (className ?? 'relative h-64')}>
      <div ref={el} className="absolute inset-0 bg-neutral-200" />
      {pinAtCenter && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-full z-[500] drop-shadow-xl">
          {/* eslint-disable-next-line react/no-danger */}
          <div dangerouslySetInnerHTML={{ __html: pinKind === 'dest' ? PIN_B : PIN_A }} />
        </div>
      )}
    </div>
  );
}
