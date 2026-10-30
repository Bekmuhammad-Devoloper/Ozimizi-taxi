'use client';
import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Search, MapPin, Clock, Loader2, Map as MapIcon, X } from 'lucide-react';
import { Place, recentPlaces, searchPlaces } from '@/lib/geocode';
import type { LatLng } from './MapView';

interface Props {
  near?: LatLng | null;
  onPick: (p: Place) => void;
  onPickOnMap: () => void;
  onClose: () => void;
}

/** Full-screen destination search: recent places, live suggestions, "pick on map". */
export function DestinationSheet({ near, onPick, onPickOnMap, onClose }: Props) {
  const [q, setQ] = useState('');
  const [rows, setRows] = useState<Place[]>([]);
  const [busy, setBusy] = useState(false);
  const [recent, setRecent] = useState<Place[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    setRecent(recentPlaces());
    setTimeout(() => input.current?.focus(), 80);
  }, []);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setRows([]);
      setBusy(false);
      return;
    }
    setBusy(true);
    timer.current = window.setTimeout(() => {
      void searchPlaces(q, near).then((r) => {
        setRows(r);
        setBusy(false);
      });
    }, 450);
    return () => {
      if (timer.current) window.clearTimeout(timer.current);
    };
  }, [q, near]);

  const list = q.trim().length >= 2 ? rows : recent;

  return (
    <div className="fixed inset-0 z-[70] bg-paper flex flex-col max-w-md mx-auto animate-in slide-in-from-bottom-4 duration-300">
      <div className="safe-top px-4 pt-3 pb-3 bg-white border-b border-line">
        <div className="flex items-center gap-2">
          <button onClick={onClose} className="w-11 h-11 rounded-2xl flex items-center justify-center text-ink active:bg-neutral-100">
            <ArrowLeft size={22} />
          </button>
          <div className="flex-1 h-12 rounded-2xl bg-paper border border-line flex items-center px-3 gap-2 focus-within:border-ink focus-within:ring-2 focus-within:ring-gold/40 transition">
            <Search size={18} className="text-neutral-400 shrink-0" />
            <input
              ref={input}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Qayerga boramiz?"
              className="flex-1 bg-transparent outline-none text-base font-semibold"
            />
            {busy ? (
              <Loader2 size={16} className="animate-spin text-neutral-400" />
            ) : q ? (
              <button onClick={() => setQ('')} className="text-neutral-400">
                <X size={16} />
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        <button onClick={onPickOnMap} className="w-full flex items-center gap-3 px-5 py-3.5 bg-white border-b border-line text-left active:bg-neutral-50">
          <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center">
            <MapIcon size={18} />
          </span>
          <span className="flex-1">
            <span className="block font-bold">Xaritada belgilash</span>
            <span className="block text-xs text-neutral-500">Pin bilan aniq joyni tanlang</span>
          </span>
        </button>

        {list.length > 0 && (
          <p className="px-5 pt-4 pb-1 text-[11px] font-bold uppercase tracking-widest text-neutral-500">
            {q.trim().length >= 2 ? 'Topilgan manzillar' : 'So‘nggi manzillar'}
          </p>
        )}
        {list.map((p) => (
          <button key={p.id} onClick={() => onPick(p)} className="w-full flex items-center gap-3 px-5 py-3 text-left active:bg-white">
            <span className="w-10 h-10 rounded-xl bg-white border border-line text-neutral-500 flex items-center justify-center shrink-0">
              {q.trim().length >= 2 ? <MapPin size={17} /> : <Clock size={17} />}
            </span>
            <span className="min-w-0">
              <span className="block font-semibold truncate">{p.name}</span>
              {p.detail && <span className="block text-xs text-neutral-500 truncate">{p.detail}</span>}
            </span>
          </button>
        ))}
        {q.trim().length >= 2 && !busy && rows.length === 0 && (
          <p className="px-5 py-8 text-sm text-neutral-500 text-center">Topilmadi — boshqacha yozib ko‘ring yoki xaritada belgilang</p>
        )}
        {q.trim().length < 2 && recent.length === 0 && (
          <p className="px-5 py-8 text-sm text-neutral-500 text-center">Ko‘cha, mahalla yoki joy nomini yozing</p>
        )}
      </div>
    </div>
  );
}
