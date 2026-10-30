import type { EventTone } from '@/lib/orderEvents';
import { foodStatusLabel, som } from '@/lib/food';

/** One step of a food order's life (backend `food_order_events`). */
export interface FoodOrderEventRow {
  id: string;
  foodOrderId: string;
  kind: string;
  driverId: string | null;
  data: Record<string, any>;
  createdAt: string;
}

const sec = (v: unknown) => (typeof v === 'number' ? `${v} s` : '');

const courierKind = (k: unknown) =>
  k === 'courier' ? 'kuryer' : k === 'taxi' ? 'taksi haydovchi' : '';

/** Human text (Uzbek) + icon + tone for a food order event. */
export function describeFoodEvent(e: FoodOrderEventRow): {
  icon: string;
  title: string;
  detail: string;
  tone: EventTone;
} {
  const d = e.data ?? {};
  const who = d.driverName ? `${d.driverName}${d.carPlate ? ` (${d.carPlate})` : ''}` : '';
  switch (e.kind) {
    case 'created':
      return {
        icon: d.byKitchen ? '✍️' : '🆕',
        title: d.byKitchen
          ? `Oshxona qo‘lda kiritdi${d.kitchenName ? ` — ${d.kitchenName}` : ''}`
          : `Yangi ovqat buyurtmasi${d.kitchenName ? ` — ${d.kitchenName}` : ''}`,
        detail: [
          d.deliveryType === 'pickup'
            ? 'mijoz o‘zi olib ketadi'
            : d.needsCourier === false
              ? 'oshxona o‘zi yetkazadi'
              : '',
          d.courierMode === 'taxi' ? 'uzoq — taksi tarifida' : '',
          d.clientName ? `Mijoz: ${d.clientName}` : '',
          d.itemsCount != null ? `${d.itemsCount} ta taom` : '',
          d.total != null ? `${som(d.total)} so‘m` : '',
          d.address ? `Manzil: ${d.address}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'info',
      };
    case 'kitchen_accepted': {
      const how =
        d.deliveryType === 'pickup'
          ? 'mijoz o‘zi olib ketadi'
          : d.needsCourier === false
            ? 'oshxona o‘zi yetkazadi'
            : 'kuryer qidirilmoqda';
      return {
        icon: '👨‍🍳',
        title: `Oshxona qabul qildi${d.kitchenName ? `: ${d.kitchenName}` : ''}`,
        detail: d.prepMinutes ? `~${d.prepMinutes} daqiqada tayyor bo‘ladi · ${how}` : how.charAt(0).toUpperCase() + how.slice(1),
        tone: 'good',
      };
    }
    case 'courier_called':
      return {
        icon: '📣',
        title: 'Oshxona kuryer chaqirdi',
        detail: 'O‘zi yetkazmoqchi edi — endi kuryer qidirilmoqda',
        tone: 'info',
      };
    case 'offered_own':
      return {
        icon: '🏠',
        title: `Oshxona kuryerlariga yuborildi — ${d.drivers ?? 0} ta`,
        detail: [
          d.kitchenName ? `${d.kitchenName}ning o‘z kuryerlari` : '',
          `${d.seconds ?? 15} s signal`,
          Array.isArray(d.names) && d.names.length
            ? `${d.names.slice(0, 6).join(', ')}${d.names.length > 6 ? '…' : ''}`
            : '',
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'info',
      };
    case 'kitchen_rejected':
      return {
        icon: '⛔',
        title: 'Oshxona rad etdi',
        detail: d.reason ? `Sabab: ${d.reason}` : '',
        tone: 'bad',
      };
    case 'ready':
      return { icon: '🍱', title: 'Ovqat tayyor', detail: 'Oshxona “Tayyor”ni bosdi — kuryer olib ketishi kerak', tone: 'good' };
    case 'offered':
      return {
        icon: '📨',
        title: `${d.attempt ?? ''}-taklif: ${who}`,
        detail: [
          courierKind(d.courierKind),
          d.km != null ? `oshxonadan ${d.km} km` : '',
          `${d.seconds ?? 15} s signal`,
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'info',
      };
    case 'ringing':
      return {
        icon: '🔔',
        title: `Signal yetib bordi: ${who}`,
        detail: `${d.via === 'service' ? 'Telefon fonda (ilova yopiq)' : 'Ilova ochiq'} · ${sec(d.afterSec)} da${
          d.stage === 'all' ? ' · o‘rtadan' : ''
        }`,
        tone: 'good',
      };
    case 'declined':
      return {
        icon: '🙅',
        title: `Rad etdi: ${who}`,
        detail: `${d.afterSec != null ? `${sec(d.afterSec)} dan keyin` : ''}${d.rangSec ? ` · ${d.rangSec} s jiringladi` : ''}${
          d.stage === 'all' ? ' · o‘rtadagi buyurtma' : ''
        }`,
        tone: 'warn',
      };
    case 'expired':
      if (d.own)
        return {
          icon: '⏱',
          title: 'Oshxona kuryerlari olmadi',
          detail: `${d.drivers ?? 0} ta o‘z kuryeri javob bermadi — buyurtma hamma kuryerlarga tushdi`,
          tone: 'warn',
        };
      return {
        icon: '⏱',
        title: `Javob bermadi: ${who}`,
        detail: d.delivered
          ? `${d.rangSec ?? '?'} s jiringladi, olmadi — keyingisiga o‘tdi`
          : `Signal telefonga yetmadi (internet yo‘q yoki ilova uxlagan) · ${sec(d.waitedSec)} kutildi`,
        tone: 'warn',
      };
    case 'broadcast':
      return {
        icon: '📢',
        title: `O‘rtaga tushdi — ${d.drivers ?? 0} ta ${d.mode === 'taxi' ? 'taksiga' : 'kuryerga'}${
          Number(d.round) > 1 ? ` (${d.round}-marta)` : ''
        }`,
        detail: `${d.kitchenName ? `${d.kitchenName} · ` : ''}hammaga ${d.seconds ?? 15} s signal${
          Array.isArray(d.names) && d.names.length
            ? ` · ${d.names.slice(0, 6).join(', ')}${d.names.length > 6 ? '…' : ''}`
            : ''
        }`,
        tone: 'warn',
      };
    case 'no_drivers':
      return {
        icon: '🚫',
        title: 'Bo‘sh kuryer topilmadi',
        detail: `Liniyada bo‘sh kuryer yo‘q — har daqiqada qayta qidiriladi${d.round ? ` · ${d.round}-urinish` : ''}`,
        tone: 'bad',
      };
    case 'accepted':
      return {
        icon: '✅',
        title: `Kuryer oldi: ${who}`,
        detail: `${d.stage === 'all' ? 'o‘rtadan' : d.stage === 'personal' ? 'shaxsiy taklifdan' : 'ro‘yxatdan'}${
          d.afterSec != null ? ` · ${d.afterSec} s da` : ''
        }`,
        tone: 'good',
      };
    case 'released':
      return {
        icon: '↩️',
        title: `Kuryer qaytardi: ${who}`,
        detail: 'Buyurtma qaytadan kuryerlarga tarqatilmoqda',
        tone: 'warn',
      };
    case 'picked_up':
      if (d.by === 'kitchen')
        return { icon: '🚚', title: 'Oshxona yo‘lga chiqardi', detail: 'Oshxona o‘zi yetkazmoqda', tone: 'info' };
      return { icon: '🛵', title: `Kuryer olib ketdi: ${who}`, detail: 'Ovqat mijozga yo‘lda', tone: 'info' };
    case 'delivered':
      return {
        icon: '🏁',
        title:
          d.by === 'pickup'
            ? 'Mijoz o‘zi olib ketdi'
            : d.by === 'kitchen'
              ? 'Oshxona o‘zi yetkazdi'
              : `Yetkazildi: ${who}`,
        detail: [
          d.total != null ? `${som(d.total)} so‘m` : '',
          d.deliveryFee != null ? `yetkazish ${som(d.deliveryFee)}` : '',
          d.courierCommission != null ? `kuryer komissiyasi ${som(d.courierCommission)}` : '',
          d.kitchenCommission != null ? `oshxona komissiyasi ${som(d.kitchenCommission)}` : '',
          Number(d.bonusUsed) > 0 ? `bonus ${som(d.bonusUsed)}` : '',
        ]
          .filter(Boolean)
          .join(' · '),
        tone: 'good',
      };
    case 'cancelled': {
      const by = d.by === 'client' ? 'mijoz' : d.by === 'kitchen' ? 'oshxona' : 'admin';
      return {
        icon: '❌',
        title: `Bekor qilindi (${by})`,
        detail: d.atStatus ? `Holati: ${foodStatusLabel(String(d.atStatus))}` : '',
        tone: 'bad',
      };
    }
    default:
      return { icon: '•', title: e.kind, detail: '', tone: 'info' };
  }
}
