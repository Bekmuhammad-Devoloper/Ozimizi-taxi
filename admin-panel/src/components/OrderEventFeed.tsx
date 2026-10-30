'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Cookies from 'js-cookie';
import { Bell, BellOff, X } from 'lucide-react';
import { getAdminSocket } from '@/lib/socket';
import { describeEvent, toneClass, type EventTone, type OrderEventRow } from '@/lib/orderEvents';
import { describeFoodEvent, type FoodOrderEventRow } from '@/lib/foodEvents';

/** Events that also beep and raise a desktop notification. */
const LOUD = new Set(['created', 'broadcast', 'no_drivers', 'cancelled']);
/** Food (delivery) events that beep + notify. */
const FOOD_LOUD = new Set(['created', 'broadcast', 'no_drivers', 'kitchen_rejected', 'cancelled']);
const MUTE_KEY = 'moviy-admin-feed-muted';

/** One toast: a taxi order step or a food order step. */
interface FeedItem {
  key: string;
  icon: string;
  title: string;
  detail: string;
  tone: EventTone;
  href: string;
  linkLabel: string;
}

function role(): string | null {
  const t = Cookies.get('admin_token');
  if (!t) return null;
  try {
    return JSON.parse(atob(t.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role ?? null;
  } catch {
    return null;
  }
}

/** Short two-tone beep (no asset needed). */
function beep(urgent: boolean) {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tones = urgent ? [880, 660, 880, 660] : [740, 988];
    tones.forEach((f, i) => {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = f;
      o.connect(g);
      g.connect(ctx.destination);
      const t = ctx.currentTime + i * 0.18;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.25, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.start(t);
      o.stop(t + 0.17);
    });
    setTimeout(() => ctx.close().catch(() => undefined), 1500);
  } catch {
    /* audio blocked until the admin clicks somewhere */
  }
}

/**
 * Live feed of every order step for the admin (toast in the corner) — taxi
 * orders and food deliveries (🍽). New orders, "fell to the middle", "no free
 * drivers / couriers", kitchen rejections and cancellations also beep and
 * show a desktop notification when the tab is in the background.
 */
export function OrderEventFeed() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);
  // Read the role after mount (the cookie is not available during SSR).
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => setIsAdmin(role() === 'admin'), []);

  useEffect(() => {
    try {
      const m = localStorage.getItem(MUTE_KEY) === '1';
      setMuted(m);
      mutedRef.current = m;
    } catch {
      /* storage blocked */
    }
  }, []);

  useEffect(() => {
    if (!isAdmin) return;
    const socket = getAdminSocket();
    if (!socket) return;

    const push = (item: FeedItem, loud: boolean, urgent: boolean) => {
      setItems((s) => [item, ...s.filter((x) => x.key !== item.key)].slice(0, 5));
      window.setTimeout(() => setItems((s) => s.filter((x) => x.key !== item.key)), loud ? 15000 : 7000);
      if (loud && !mutedRef.current) {
        beep(urgent);
        if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
          try {
            new Notification(`${item.icon} ${item.title}`, { body: item.detail, tag: item.key });
          } catch {
            /* not allowed */
          }
        }
      }
    };

    const onTaxi = (e: OrderEventRow) => {
      if (!e?.id) return;
      const d = describeEvent(e);
      push(
        {
          key: `taxi:${e.id}`,
          ...d,
          href: `/orders?open=${e.orderId}`,
          linkLabel: 'Buyurtma harakatlari →',
        },
        LOUD.has(e.kind),
        e.kind === 'broadcast' || e.kind === 'no_drivers',
      );
    };

    const onFood = (e: FoodOrderEventRow) => {
      if (!e?.id) return;
      const d = describeFoodEvent(e);
      push(
        {
          key: `food:${e.id}`,
          ...d,
          title: `🍽 ${d.title}`,
          href: `/food-orders?open=${e.foodOrderId}`,
          linkLabel: 'Ovqat buyurtmasi harakatlari →',
        },
        FOOD_LOUD.has(e.kind),
        e.kind === 'broadcast' || e.kind === 'no_drivers' || e.kind === 'kitchen_rejected',
      );
    };

    socket.on('order_event', onTaxi);
    socket.on('food_order_event', onFood);
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
    return () => {
      socket.off('order_event', onTaxi);
      socket.off('food_order_event', onFood);
    };
  }, [isAdmin]);

  if (!isAdmin) return null;

  const toggle = () => {
    const m = !muted;
    setMuted(m);
    mutedRef.current = m;
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  };

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] space-y-2 pointer-events-none">
      {items.map((e) => (
        <div
          key={e.key}
          className={'pointer-events-auto rounded-xl border shadow-lg px-3 py-2 bg-white animate-in slide-in-from-right ' + toneClass[e.tone]}
        >
          <div className="flex items-start gap-2">
            <span className="text-base leading-none mt-0.5">{e.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold truncate">{e.title}</p>
              {e.detail && <p className="text-[11px] opacity-90 line-clamp-2">{e.detail}</p>}
              <Link href={e.href} className="text-[10px] font-semibold underline opacity-80">
                {e.linkLabel}
              </Link>
            </div>
            <button
              onClick={() => setItems((s) => s.filter((x) => x.key !== e.key))}
              className="opacity-60 hover:opacity-100"
              aria-label="Yopish"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      ))}
      <div className="flex justify-end">
        <button
          onClick={toggle}
          title={muted ? 'Buyurtma ovozlarini yoqish' : 'Buyurtma ovozlarini o‘chirish'}
          className="pointer-events-auto w-9 h-9 rounded-full bg-ink text-gold shadow-lg flex items-center justify-center"
        >
          {muted ? <BellOff size={15} /> : <Bell size={15} />}
        </button>
      </div>
    </div>
  );
}
