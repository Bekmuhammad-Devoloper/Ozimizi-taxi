'use client';
import { Shell } from '@/components/Shell';
import { KitchenCouriersCard } from '@/components/KitchenCouriers';

/** The kitchen's own couriers: new orders ring them first. */
export default function KitchenCouriersPage() {
  return (
    <Shell
      title="Kuryerlar"
      subtitle="O‘z kuryerlaringiz — buyurtma avval shularga boradi, olmasa hammaga tushadi"
    >
      <div className="max-w-2xl space-y-4">
        <KitchenCouriersCard base="/kitchen" />
        <div className="card p-4 text-xs text-neutral-600 leading-relaxed space-y-1.5">
          <p className="font-bold text-sm text-ink">Qanday ishlaydi</p>
          <p>
            1. “Qabul qilish”da <b>“Kuryer chaqirish”</b> tanlansa, buyurtma avval shu ro‘yxatdagi liniyadagi
            kuryerlarga birdaniga signal bilan boradi.
          </p>
          <p>2. Ular ma’lum vaqt ichida olmasa — buyurtma hamma bo‘sh kuryerlarga tushadi.</p>
          <p>
            3. <b>“O‘zimiz yetkazamiz”</b> tanlansa kuryer chaqirilmaydi — “Yo‘lga chiqdi” va “Yetkazildi”ni
            o‘zingiz bosasiz.
          </p>
          <p className="text-neutral-500 pt-1">
            Kuryer ro‘yxatga qo‘shilishi uchun avval Moviy Taxi’da kuryer yoki haydovchi sifatida ro‘yxatdan
            o‘tgan bo‘lishi kerak.
          </p>
        </div>
      </div>
    </Shell>
  );
}
