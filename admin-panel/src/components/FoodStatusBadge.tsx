import { FOOD_STATUS_TONE, foodStatusLabel, type FoodStatus } from '@/lib/food';

export function FoodStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={
        'inline-block text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full font-bold border whitespace-nowrap ' +
        (FOOD_STATUS_TONE[status as FoodStatus] ?? 'bg-neutral-100 text-neutral-600 border-neutral-200')
      }
    >
      {foodStatusLabel(status)}
    </span>
  );
}
