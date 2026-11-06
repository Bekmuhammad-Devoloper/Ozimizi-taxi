'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import { Trash2, Undo2 } from 'lucide-react';
import 'leaflet/dist/leaflet.css';

export interface ZonePoint {
  lat: number;
  lng: number;
}

const DEFAULT_CENTER: [number, number] = [40.54, 71.06];

/** Draw the zone on the map: every click adds a corner of the polygon. */
export function ZoneEditor({ points, onChange }: { points: ZonePoint[]; onChange: (p: ZonePoint[]) => void }) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const L = useRef<typeof import('leaflet') | null>(null);
  const latest = useRef(points);
  latest.current = points;
  const change = useRef(onChange);
  change.current = onChange;
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import('leaflet').then((mod) => {
      if (cancelled || !el.current || map.current) return;
      L.current = mod;
      const first = latest.current[0];
      const m = mod.map(el.current, { zoomControl: true, attributionControl: true });
      mod
        .tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' })
        .addTo(m);
      m.setView(first ? [first.lat, first.lng] : DEFAULT_CENTER, 12);
      m.on('click', (e: any) => {
        change.current([...latest.current, { lat: e.latlng.lat, lng: e.latlng.lng }]);
      });
      layer.current = mod.layerGroup().addTo(m);
      map.current = m;
      setTimeout(() => m.invalidateSize(), 80);
      setReady(true);
    });
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
    };
  }, []);

  // Redraw whenever the corners change; fit once when the saved zone arrives.
  const fitted = useRef(false);
  useEffect(() => {
    const mod = L.current;
    const m = map.current;
    if (!ready || !mod || !m || !layer.current) return;
    layer.current.clearLayers();
    const ll = points.map((p) => [p.lat, p.lng] as [number, number]);
    if (ll.length >= 3) {
      mod.polygon(ll, { color: '#1d6fe0', weight: 2, fillColor: '#3b9bff', fillOpacity: 0.18 }).addTo(layer.current);
    } else if (ll.length === 2) {
      mod.polyline(ll, { color: '#1d6fe0', weight: 2 }).addTo(layer.current);
    }
    for (const c of ll) {
      mod
        .circleMarker(c, { radius: 5, color: '#0b3d91', fillColor: '#fff', fillOpacity: 1, weight: 2 })
        .addTo(layer.current);
    }
    if (!fitted.current && ll.length >= 3) {
      fitted.current = true;
      m.fitBounds(mod.latLngBounds(ll), { padding: [24, 24] });
    }
  }, [ready, points]);

  return (
    <div>
      <div ref={el} className="h-72 w-full rounded-xl overflow-hidden border border-line isolate" />
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => onChange(points.slice(0, -1))}
          disabled={!points.length}
          className="btn-secondary"
        >
          <Undo2 size={15} /> Oxirgi nuqtani o‘chirish
        </button>
        <button type="button" onClick={() => onChange([])} disabled={!points.length} className="btn-secondary">
          <Trash2 size={15} /> Tozalash
        </button>
        <span className="text-xs text-neutral-500">
          {points.length < 3 ? `Kamida 3 nuqta kerak (hozir ${points.length})` : `${points.length} ta nuqta`}
        </span>
      </div>
    </div>
  );
}
