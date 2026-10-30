'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, MessageCircle, Gift, UtensilsCrossed } from 'lucide-react';
import { STATUS_LABEL } from '@/lib/status';
import { foodNoticeText, FoodOrder } from '@/lib/food';

interface ToastItem {
  id: number;
  icon: 'bell' | 'chat' | 'gift' | 'food';
  title: string;
  body?: string;
  /** Tap opens this page. */
  href?: string;
}

const TITLES: Record<string, string> = {
  'order.accepted': 'Haydovchi topildi',
  'order.on_the_way': 'Haydovchi yo‘lda',
  'order.arrived': 'Haydovchi yetib keldi',
  'order.in_progress': 'Safar boshlandi',
  'order.completed': 'Safar yakunlandi',
  'order.cancelled': 'Buyurtma bekor qilindi',
};

/** In-app notifications for live events (top, auto-dismiss). */
export function Toast() {
  const router = useRouter();
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    let n = 0;
    const push = (t: Omit<ToastItem, 'id'>) => {
      const id = ++n;
      setItems((s) => [...s.slice(-2), { ...t, id }]);
      setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4000);
    };
    const onOrder = (e: Event) => {
      const { event, order } = (e as CustomEvent).detail ?? {};
      if (!event) return;
      const d = order?.driver;
      push({
        icon: 'bell',
        title: TITLES[event] ?? STATUS_LABEL[order?.status as keyof typeof STATUS_LABEL] ?? 'Yangilandi',
        body: event === 'order.accepted' && d ? `${d.fullName} · ${[d.carModel, d.carPlate].filter(Boolean).join(' · ')}` : undefined,
      });
    };
    const onMsg = (e: Event) => {
      const m = (e as CustomEvent).detail;
      push({ icon: 'chat', title: m?.driverName ?? 'Haydovchi', body: String(m?.text ?? '').slice(0, 90) });
    };
    const onBonus = (e: Event) => {
      const p = (e as CustomEvent).detail;
      push({ icon: 'gift', title: p?.approved ? 'Bonus tasdiqlandi' : 'Bonus rad etildi' });
    };
    const onFood = (e: Event) => {
      const { order, kind } = ((e as CustomEvent).detail ?? {}) as { order?: FoodOrder; kind?: 'status' | 'courier' };
      if (!order) return;
      const t = foodNoticeText(order, kind ?? 'status');
      push({ icon: 'food', title: t.title, body: t.body, href: `/food/orders/${order.id}` });
    };
    window.addEventListener('order-update', onOrder);
    window.addEventListener('order-message', onMsg);
    window.addEventListener('bonus-decided', onBonus);
    window.addEventListener('food-order-update', onFood);
    return () => {
      window.removeEventListener('order-update', onOrder);
      window.removeEventListener('order-message', onMsg);
      window.removeEventListener('bonus-decided', onBonus);
      window.removeEventListener('food-order-update', onFood);
    };
  }, []);

  if (!items.length) return null;
  return (
    <div className="fixed top-0 inset-x-0 z-[80] flex flex-col items-center gap-2 px-4 safe-top pt-3 pointer-events-none">
      {items.map((t) => (
        <div
          key={t.id}
          role={t.href ? 'button' : undefined}
          onClick={t.href ? () => router.push(t.href!) : undefined}
          className="pointer-events-auto w-full max-w-md rounded-2xl bg-ink/95 text-white shadow-2xl backdrop-blur px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-top-3 duration-300"
        >
          <span className="w-9 h-9 rounded-xl bg-gold text-ink flex items-center justify-center shrink-0">
            {t.icon === 'chat' ? (
              <MessageCircle size={18} />
            ) : t.icon === 'gift' ? (
              <Gift size={18} />
            ) : t.icon === 'food' ? (
              <UtensilsCrossed size={18} />
            ) : (
              <Bell size={18} />
            )}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-bold leading-tight truncate">{t.title}</p>
            {t.body && <p className="text-xs text-neutral-300 truncate">{t.body}</p>}
          </div>
        </div>
      ))}
    </div>
  );
}
