'use client';
import { useEffect } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore, ClientOrder, OrderMessage } from '@/stores/order';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { nativeNotify } from '@/lib/native';
import { STATUS_LABEL } from '@/lib/status';
import { useFoodStore } from '@/stores/food';
import type { FoodOrder } from '@/lib/food';

/** Keeps the active order, driver position and chat in sync with the server. */
export function useClientSocket() {
  const token = useAuthStore((s) => s.token);
  const setActive = useOrderStore((s) => s.setActive);
  const setDriverPos = useOrderStore((s) => s.setDriverPos);
  const addMessage = useOrderStore((s) => s.addMessage);

  useEffect(() => {
    if (!token) {
      disconnectSocket();
      return;
    }
    const socket = getSocket(token);

    socket.on('order_update', ({ event, order }: { event: string; order: ClientOrder }) => {
      const current = useOrderStore.getState().active;
      // Ignore updates for an older order when a newer one is already shown.
      if (current && current.id !== order.id && new Date(current.createdAt) > new Date(order.createdAt)) return;
      setActive(order);
      window.dispatchEvent(new CustomEvent('order-update', { detail: { event, order } }));
      const titles: Record<string, string> = {
        'order.accepted': '✅ Haydovchi topildi',
        'order.on_the_way': '🚖 Haydovchi yo‘lda',
        'order.arrived': '📍 Haydovchi yetib keldi',
        'order.in_progress': '🛣 Safar boshlandi',
        'order.completed': '🏁 Safar yakunlandi',
        'order.cancelled': '❌ Buyurtma bekor qilindi',
        'order.requeued': '🔄 Haydovchi qaytardi — yangi haydovchi qidirilmoqda',
      };
      const title = titles[event] ?? STATUS_LABEL[order.status];
      const body =
        event === 'order.accepted' && order.driver
          ? `${order.driver.fullName} · ${[order.driver.carModel, order.driver.carPlate].filter(Boolean).join(' · ')}`
          : event === 'order.completed'
            ? `Narx: ${Math.round(Number(order.price ?? 0)).toLocaleString('ru-RU')} so‘m`
            : STATUS_LABEL[order.status];
      void nativeNotify(title, body);
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch {
        /* ignore */
      }
    });

    socket.on('driver_location', (p: { orderId: string; lat: number; lng: number; at: string }) => {
      const current = useOrderStore.getState().active;
      if (current && current.id === p.orderId) setDriverPos({ lat: p.lat, lng: p.lng, at: p.at });
    });

    socket.on('order_message', (m: OrderMessage & { driverName?: string }) => {
      addMessage(m);
      window.dispatchEvent(new CustomEvent('order-message', { detail: m }));
      void nativeNotify(`💬 ${m.driverName ?? 'Haydovchi'}`, m.text.slice(0, 120));
    });

    socket.on('bonus_decided', (p: any) => {
      window.dispatchEvent(new CustomEvent('bonus-decided', { detail: p }));
      void nativeNotify(
        p.approved ? '✅ Bonus tasdiqlandi' : '❌ Bonus rad etildi',
        p.approved ? `${Math.round(p.amount).toLocaleString('ru-RU')} so‘m bonusdan to‘landi` : 'Safar uchun naqd to‘laysiz',
      );
    });

    // Food delivery: the store dedupes and raises the toast / native notice.
    socket.on('food_order_update', (o: FoodOrder) => {
      if (o?.id) useFoodStore.getState().upsert(o, 'socket');
    });

    return () => {
      socket.off('order_update');
      socket.off('food_order_update');
      socket.off('driver_location');
      socket.off('order_message');
      socket.off('bonus_decided');
    };
  }, [token, setActive, setDriverPos, addMessage]);
}
