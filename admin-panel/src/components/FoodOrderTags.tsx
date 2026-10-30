'use client';
import { Banknote, CarFront, Gift, PenLine, Store, Truck } from 'lucide-react';
import { som, type FoodOrder } from '@/lib/food';

/** The kitchen delivers this one itself (no platform courier). */
export const isOwnDelivery = (o: FoodOrder) => o.deliveryType !== 'pickup' && o.needsCourier === false;
export const isPickup = (o: FoodOrder) => o.deliveryType === 'pickup';
/** Cash to collect from the client (total − bonus). */
export const cashDueOf = (o: FoodOrder) =>
  o.cashDue != null ? Number(o.cashDue) : Math.max(0, Number(o.total) - Number(o.bonusUsed ?? 0));

/**
 * Small tags on a food order: pickup / own delivery / far → taxi / bonus /
 * cash / typed in by the kitchen. `view="kitchen"` words it for the kitchen
 * ("O‘zimiz yetkazamiz"), `view="admin"` for the admin.
 */
export function FoodOrderTags({
  o,
  view = 'admin',
  showCash = false,
  className = '',
}: {
  o: FoodOrder;
  view?: 'admin' | 'kitchen';
  showCash?: boolean;
  className?: string;
}) {
  const tags: { key: string; text: string; cls: string; icon: React.ReactNode; title?: string }[] = [];
  if (isPickup(o))
    tags.push({
      key: 'pickup',
      text: 'O‘zi olib ketadi',
      cls: 'bg-sky-50 text-sky-700 border-sky-200',
      icon: <Store size={10} />,
      title: 'Mijoz oshxonadan o‘zi olib ketadi — kuryer yo‘q',
    });
  else if (o.needsCourier === false)
    tags.push({
      key: 'own',
      text: view === 'kitchen' ? 'O‘zimiz yetkazamiz' : 'Oshxona o‘zi yetkazadi',
      cls: 'bg-violet-50 text-violet-700 border-violet-200',
      icon: <Truck size={10} />,
    });
  if (!isPickup(o) && o.courierMode === 'taxi')
    tags.push({
      key: 'taxi',
      text: 'Taksi (uzoq)',
      cls: 'bg-gold/15 text-gold-deep border-gold/40',
      icon: <CarFront size={10} />,
      title: 'Manzil kuryer chegarasidan uzoq — taksi tarifida taksi haydovchi yetkazadi',
    });
  if (Number(o.bonusUsed ?? 0) > 0)
    tags.push({
      key: 'bonus',
      text: `Bonus: ${som(o.bonusUsed)} so‘m`,
      cls: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <Gift size={10} />,
      title: o.courier
        ? 'Mijoz bonusdan to‘lagan qism — kuryerga qaytariladi'
        : 'Mijoz bonusdan to‘lagan qism — yetkazilgach oshxona hamyoniga qaytariladi',
    });
  if (showCash)
    tags.push({
      key: 'cash',
      text: `Naqd: ${som(cashDueOf(o))} so‘m`,
      cls: 'bg-white text-ink border-line',
      icon: <Banknote size={10} />,
      title: 'Mijozdan olinadigan naqd pul (jami − bonus)',
    });
  if (o.createdBy === 'kitchen')
    tags.push({
      key: 'manual',
      text: 'Qo‘lda kiritilgan',
      cls: 'bg-neutral-100 text-neutral-600 border-neutral-200',
      icon: <PenLine size={10} />,
      title: 'Oshxona o‘zi kiritgan buyurtma (telefon / joyida kelgan mijoz)',
    });
  if (!tags.length) return null;
  return (
    <div className={'flex flex-wrap gap-1 ' + className}>
      {tags.map((t) => (
        <span
          key={t.key}
          title={t.title}
          className={
            'inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] font-bold whitespace-nowrap ' + t.cls
          }
        >
          {t.icon} {t.text}
        </span>
      ))}
    </div>
  );
}
