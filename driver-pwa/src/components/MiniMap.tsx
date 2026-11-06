'use client';
import { useEffect, useRef, useState } from 'react';
import type { CircleMarker, Map as LeafletMap, Polyline } from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { Pt } from '@/lib/voice-nav';

/** Same colour as the empty tiles, so nothing flashes dark while a map loads. */
const BACKDROP = '#F2EFE9';

const PIN = `<svg width="34" height="44" viewBox="0 0 34 44" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M17 43C17 43 32 27.5 32 16.5C32 8 25.3 1 17 1S2 8 2 16.5C2 27.5 17 43 17 43Z" fill="#0a0a0a" stroke="#3b9bff" stroke-width="2"/><circle cx="17" cy="16.5" r="6" fill="#3b9bff"/></svg>`;

/**
 * A real tile map in place of the page that used to load in an iframe (each of
 * those opened dark). Optionally draws the route and the car.
 */
export function MiniMap({
  lat,
  lng,
  route,
  me,
  className,
}: {
  lat: number;
  lng: number;
  route?: Pt[] | null;
  me?: Pt | null;
  className?: string;
}) {
  const box = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const lineRef = useRef<Polyline | null>(null);
  const carRef = useRef<CircleMarker | null>(null);
  const fittedRef = useRef<Pt[] | null>(null);
  const LRef = useRef<typeof import('leaflet') | null>(null);
  const [ready, setReady] = useState(false);
  const ok = Number.isFinite(Number(lat)) && Number.isFinite(Number(lng));

  useEffect(() => {
    if (!ok) return;
    let gone = false;
    void import('leaflet').then((L) => {
      if (gone || !box.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(box.current, {
        center: [lat, lng],
        zoom: 15,
        zoomControl: false,
        scrollWheelZoom: false,
      });
      map.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '© OpenStreetMap',
      }).addTo(map);
      L.marker([lat, lng], {
        icon: L.divIcon({ html: PIN, className: '', iconSize: [34, 44], iconAnchor: [17, 43] }),
        interactive: false,
      }).addTo(map);
      mapRef.current = map;
      setReady(true);
    });
    return () => {
      gone = true;
      setReady(false);
      mapRef.current?.remove();
      mapRef.current = null;
      lineRef.current = null;
      carRef.current = null;
      fittedRef.current = null;
    };
  }, [lat, lng, ok]);

  useEffect(() => {
    const map = mapRef.current;
    const L = LRef.current;
    if (!map || !L) return;
    if (route && route.length > 1) {
      const pts = route.map((p) => [p.lat, p.lng] as [number, number]);
      if (lineRef.current) lineRef.current.setLatLngs(pts);
      else lineRef.current = L.polyline(pts, { color: '#3b9bff', weight: 5, opacity: 0.9 }).addTo(map);
      // Frame the whole way once per route; after that the driver may pan freely.
      if (fittedRef.current !== route) {
        fittedRef.current = route;
        map.fitBounds(L.latLngBounds(pts), { padding: [24, 24], maxZoom: 16 });
      }
    }
    if (me) {
      if (carRef.current) carRef.current.setLatLng([me.lat, me.lng]);
      else {
        carRef.current = L.circleMarker([me.lat, me.lng], {
          radius: 8,
          color: '#ffffff',
          weight: 3,
          fillColor: '#0a0a0a',
          fillOpacity: 1,
        }).addTo(map);
      }
    }
  }, [ready, route, me?.lat, me?.lng]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!ok) return null;
  return (
    <div
      ref={box}
      className={className ?? 'w-full h-full'}
      style={{ background: BACKDROP, isolation: 'isolate' }}
    />
  );
}
