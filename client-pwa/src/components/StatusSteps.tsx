'use client';
import { STEPS } from '@/lib/status';
import type { OrderStatus } from '@/stores/order';

/** Slim segmented progress: filled = done, pulsing = current. */
export function StatusSteps({ status }: { status: OrderStatus }) {
  if (status === 'CANCELLED') return null;
  const idx = status === 'COMPLETED' ? STEPS.length : STEPS.findIndex((s) => s.key === status);
  const visible = STEPS.slice(0, 5); // PENDING … IN_PROGRESS; COMPLETED fills everything
  return (
    <div>
      <div className="flex gap-1.5">
        {visible.map((s, i) => {
          const done = i < idx;
          const current = i === idx;
          return (
            <span
              key={s.key}
              className={
                'h-1.5 flex-1 rounded-full transition-colors ' +
                (done ? 'bg-gold' : current ? 'bg-gold animate-pulse' : 'bg-neutral-200')
              }
            />
          );
        })}
      </div>
      <div className="mt-1.5 flex">
        {visible.map((s, i) => (
          <span
            key={s.key}
            className={
              'flex-1 text-[9px] uppercase tracking-wider font-bold text-center ' +
              (i <= idx ? 'text-ink' : 'text-neutral-400')
            }
          >
            {s.short}
          </span>
        ))}
      </div>
    </div>
  );
}
