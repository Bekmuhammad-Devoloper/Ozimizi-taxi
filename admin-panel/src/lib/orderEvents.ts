/** One step of an order's life (backend `order_events`). */
export interface OrderEventRow {
  id: string;
  orderId: string;
  kind: string;
  driverId: string | null;
  data: Record<string, any>;
  createdAt: string;
}

export type EventTone = 'info' | 'good' | 'warn' | 'bad';

const sec = (v: unknown) => (typeof v === 'number' ? `${v} s` : '');

/** Human text (Uzbek) + icon + tone for an order event. */
export function describeEvent(e: OrderEventRow): { icon: string; title: string; detail: string; tone: EventTone } {
  const d = e.data ?? {};
  const who = d.driverName ? `${d.driverName}${d.carPlate ? ` (${d.carPlate})` : ''}` : '';
  switch (e.kind) {
    case 'created':
      return { icon: '🆕', title: 'Yangi buyurtma', detail: d.pickupAddress ? `Qayerdan: ${d.pickupAddress}` : 'Mijoz taksi chaqirdi', tone: 'info' };
    case 'street_start':
      return {
        icon: '🚖',
        title: `Ko‘chadan mijoz oldi (taksometr)${who ? `: ${who}` : ''}`,
        detail: 'Mijoz tizimda emas — safar darhol boshlandi',
        tone: 'info',
      };
    case 'offered':
      return {
        icon: '📨',
        title: `${d.attempt ?? ''}-taklif: ${who}`,
        detail: `${d.km ?? '?'} km uzoqlikda · ${d.seconds ?? 15} s signal${d.branded ? ' · VIP' : ''}`,
        tone: 'info',
      };
    case 'ringing':
      return {
        icon: '🔔',
        title: `Signal yetib bordi: ${who}`,
        detail: `${d.via === 'service' ? 'Telefon fonda (ilova yopiq)' : 'Ilova ochiq'} · ${sec(d.afterSec)} da`,
        tone: 'good',
      };
    case 'declined':
      return {
        icon: '🙅',
        title: `Rad etdi: ${who}`,
        detail: `${sec(d.afterSec)} dan keyin${d.rangSec ? ` · ${d.rangSec} s jiringladi` : ''}`,
        tone: 'warn',
      };
    case 'expired':
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
        title: `O‘rtaga tushdi — ${d.drivers} ta haydovchiga`,
        detail: `${d.triedBefore ?? 0} ta yaqin haydovchi olmadi · hammaga ${d.seconds ?? 15} s signal${
          Array.isArray(d.names) && d.names.length ? ` · ${d.names.slice(0, 6).join(', ')}${d.names.length > 6 ? '…' : ''}` : ''
        }`,
        tone: 'warn',
      };
    case 'no_drivers':
      return { icon: '🚫', title: 'Bo‘sh haydovchi topilmadi', detail: 'Liniyada bo‘sh haydovchi yo‘q — buyurtma kutmoqda', tone: 'bad' };
    case 'accepted':
      return {
        icon: '✅',
        title: `Qabul qildi: ${who}`,
        detail: `${d.stage === 'all' ? 'o‘rtadan' : d.stage === 'personal' ? 'shaxsiy taklifdan' : 'ro‘yxatdan'}${
          d.afterSec != null ? ` · ${d.afterSec} s da` : ''
        }`,
        tone: 'good',
      };
    case 'on_the_way':
      return { icon: '🚗', title: `Yo‘lga chiqdi: ${who}`, detail: d.etaMinutes ? `~${d.etaMinutes} daqiqada yetadi` : '', tone: 'info' };
    case 'arrived':
      return { icon: '📍', title: `Yetib keldi: ${who}`, detail: 'Mijozni kutmoqda', tone: 'info' };
    case 'in_progress':
      return { icon: '🛣', title: `Safar boshlandi: ${who}`, detail: '', tone: 'info' };
    case 'completed':
      return {
        icon: '🏁',
        title: `Yakunlandi: ${who}`,
        detail: `${Number(d.price ?? 0).toLocaleString('uz')} so‘m · ${Number(d.km ?? 0).toFixed(1)} km${d.byAdmin ? ' · admin yakunladi' : ''}`,
        tone: 'good',
      };
    case 'cancelled': {
      const by = d.by === 'client' ? 'mijoz' : d.by === 'driver' ? 'haydovchi' : 'admin';
      return {
        icon: '❌',
        title: `Bekor qilindi (${by})`,
        detail: `${who ? who + ' · ' : ''}${d.penalty ? `jarima ${Number(d.penalty).toLocaleString('uz')} so‘m` : ''}`,
        tone: 'bad',
      };
    }
    default:
      return { icon: '•', title: e.kind, detail: '', tone: 'info' };
  }
}

export const toneClass: Record<EventTone, string> = {
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  warn: 'bg-amber-50 text-amber-800 border-amber-200',
  bad: 'bg-red-50 text-red-700 border-red-200',
};
