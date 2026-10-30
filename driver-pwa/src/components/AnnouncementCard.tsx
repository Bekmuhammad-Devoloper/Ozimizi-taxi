'use client';
import { useEffect, useState } from 'react';
import { Megaphone } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/date';

interface Announcement {
  id: string;
  title: string;
  text: string;
  createdAt: string;
}

/** Latest admin broadcast on the driver home screen (replaces the old tips box). */
export function AnnouncementCard() {
  const [items, setItems] = useState<Announcement[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    const load = () =>
      api
        .get<Announcement[]>('/driver/announcements')
        .then((r) => setItems(r.data))
        .catch(() => {});
    load();
    window.addEventListener('announcement', load);
    return () => window.removeEventListener('announcement', load);
  }, []);

  const latest = items[0];

  return (
    <section className="px-6 mt-8 mb-6">
      <div className="bg-ink text-white rounded-2xl p-5 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute -right-8 -top-8 w-32 h-32 rounded-full bg-gold/20 blur-2xl"
        />
        <div className="relative flex items-center gap-2 mb-2">
          <Megaphone size={14} className="text-gold" />
          <p className="text-[10px] uppercase tracking-widest text-gold font-bold">
            Admin xabarlari
          </p>
          {latest && (
            <span className="ml-auto text-[10px] text-neutral-400">{fmtDateTime(latest.createdAt)}</span>
          )}
        </div>
        {latest ? (
          <>
            <p className="relative text-sm font-bold">{latest.title}</p>
            <p className="relative mt-1 text-sm leading-relaxed text-neutral-300 whitespace-pre-wrap">
              {latest.text}
            </p>
            {items.length > 1 && (
              <button
                type="button"
                onClick={() => setExpanded((v) => !v)}
                className="relative mt-3 text-xs font-semibold text-gold"
              >
                {expanded ? 'Yopish' : `Oldingi xabarlar (${items.length - 1})`}
              </button>
            )}
            {expanded && (
              <ul className="relative mt-2 space-y-2 border-t border-white/10 pt-2">
                {items.slice(1).map((a) => (
                  <li key={a.id}>
                    <p className="text-xs font-semibold">{a.title}</p>
                    <p className="text-xs text-neutral-400 whitespace-pre-wrap">{a.text}</p>
                    <p className="text-[10px] text-neutral-500 mt-0.5">{fmtDateTime(a.createdAt)}</p>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <p className="relative text-sm leading-relaxed text-neutral-300">
            Hozircha yangi xabar yo‘q. Admin e’lonlari shu yerda ko‘rinadi.
          </p>
        )}
      </div>
    </section>
  );
}
