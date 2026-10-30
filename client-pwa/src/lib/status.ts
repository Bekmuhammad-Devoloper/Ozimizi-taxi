import type { OrderStatus } from '@/stores/order';

export const STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: 'Haydovchi qidirilmoqda',
  ACCEPTED: 'Haydovchi topildi',
  ON_THE_WAY: 'Haydovchi yo‘lda',
  ARRIVED: 'Haydovchi yetib keldi',
  IN_PROGRESS: 'Safardasiz',
  COMPLETED: 'Safar yakunlandi',
  CANCELLED: 'Bekor qilindi',
};

export const STATUS_HINT: Record<OrderStatus, string> = {
  PENDING: 'Yaqin atrofdagi haydovchilarga yuborildi. Odatda 1 daqiqa ichida topiladi.',
  ACCEPTED: 'Haydovchi buyurtmangizni qabul qildi va yo‘lga chiqmoqda.',
  ON_THE_WAY: 'Mashina siz tomon kelmoqda — xaritada kuzating.',
  ARRIVED: 'Mashina kutmoqda. Bepul kutish vaqtidan keyin kutish haqi hisoblanadi.',
  IN_PROGRESS: 'Yaxshi yo‘l! Narx masofa bo‘yicha hisoblanadi.',
  COMPLETED: 'Rahmat! Chek va narx quyida.',
  CANCELLED: 'Buyurtma bekor qilindi.',
};

export const STEPS: { key: OrderStatus; short: string }[] = [
  { key: 'PENDING', short: 'Qidiruv' },
  { key: 'ACCEPTED', short: 'Topildi' },
  { key: 'ON_THE_WAY', short: 'Yo‘lda' },
  { key: 'ARRIVED', short: 'Keldi' },
  { key: 'IN_PROGRESS', short: 'Safar' },
  { key: 'COMPLETED', short: 'Tugadi' },
];

export const money = (v: string | number | null | undefined) =>
  Math.round(Number(v ?? 0)).toLocaleString('ru-RU').replace(/ /g, ' ');
