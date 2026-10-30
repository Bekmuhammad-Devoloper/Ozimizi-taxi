'use client';
import { Clock, Loader2, Pause, PlayCircle } from 'lucide-react';
import { commissionFor } from '@/lib/fare';
import { fmtClock, fmtSum, type DriverTariff } from '@/lib/meter';

/**
 * Waiting clock: time and its cost side by side, the free-minutes rule, and
 * (mid-ride) the "Kutish" / "Davom etish" toggle.
 */
export function WaitPanel({
  title,
  seconds,
  fee,
  tariff,
  counting,
  moving,
  toggle,
}: {
  title: string;
  seconds: number;
  fee: number;
  tariff: DriverTariff | null;
  /** The clock is running right now. */
  counting: boolean;
  /** Last server tick saw the car moving (time not counted). */
  moving?: boolean;
  toggle?: { running: boolean; pending: boolean; onToggle: () => void };
}) {
  const free = Number(tariff?.waitingFreeMinutes ?? 0);
  const ppm = Number(tariff?.waitingPricePerMinute ?? 0);
  return (
    <div
      className={
        'rounded-2xl border p-4 transition-colors ' +
        (counting ? 'bg-orange-50 border-orange-200' : 'bg-white border-line')
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold flex items-center gap-1.5">
          <Clock size={12} /> {title}
        </p>
        {counting ? (
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-orange-200/70 text-orange-900">
            Hisoblanmoqda
          </span>
        ) : (
          <span className="text-[10px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full bg-neutral-100 text-neutral-500">
            O‘chiq
          </span>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            Kutish vaqti
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums leading-none text-ink">
            {fmtClock(seconds)}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
            Kutish haqi
          </p>
          <p className="mt-0.5 text-3xl font-extrabold tabular-nums leading-none text-ink">
            {fmtSum(fee)}
            <span className="ml-1 text-xs font-semibold text-neutral-500">so‘m</span>
          </p>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-neutral-500">
        {ppm > 0
          ? `${free} daqiqa bepul, keyin ${fmtSum(ppm)} so‘m/daq`
          : 'Kutish pullik emas'}
      </p>
      {counting && (
        <p
          className={
            'mt-1 text-[11px] font-semibold ' + (moving ? 'text-neutral-500' : 'text-orange-700')
          }
        >
          {moving
            ? '🚗 Harakatda — vaqt hisoblanmayapti'
            : '⏸ Mashina turibdi — vaqt hisoblanmoqda'}
        </p>
      )}

      {toggle && (
        <button
          type="button"
          onClick={toggle.onToggle}
          disabled={toggle.pending}
          aria-busy={toggle.pending}
          className={
            'mt-3 w-full h-14 rounded-xl text-base font-bold flex items-center justify-center gap-2 active:scale-[0.98] disabled:opacity-80 select-none touch-manipulation ' +
            (toggle.running ? 'bg-ink text-gold' : 'bg-orange-100 text-orange-800 border border-orange-200')
          }
        >
          {toggle.pending ? (
            <Loader2 size={18} className="animate-spin" />
          ) : toggle.running ? (
            <PlayCircle size={20} />
          ) : (
            <Pause size={20} />
          )}
          {toggle.running ? 'Davom etish' : 'Kutish'}
        </button>
      )}
    </div>
  );
}

/** Running fare: total (distance + waiting) and the commission. */
export function FareCard({
  distanceFare,
  waitFee,
  tariff,
  distanceLabel = 'Yo‘l',
}: {
  distanceFare: number;
  waitFee: number;
  tariff: DriverTariff;
  distanceLabel?: string;
}) {
  const total = distanceFare + waitFee;
  const com = commissionFor(total, tariff);
  const pct =
    tariff.commissionPercent && tariff.commissionPercent > 0 ? `${tariff.commissionPercent}%` : null;
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="bg-white border border-line rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">Jami narx</p>
        <p className="mt-1.5 text-2xl font-extrabold tabular-nums leading-none text-ink">
          {fmtSum(total)}
        </p>
        <p className="mt-1.5 text-[11px] text-neutral-500 leading-snug">
          {distanceLabel} {fmtSum(distanceFare)} + kutish {fmtSum(waitFee)}
        </p>
      </div>
      <div className="bg-gold/10 border border-gold/40 rounded-2xl p-4">
        <p className="text-[10px] uppercase tracking-widest text-gold-deep font-bold">
          Komissiya{pct ? ` ${pct}` : ''}
        </p>
        <p className="mt-1.5 text-2xl font-extrabold tabular-nums leading-none text-ink">
          {fmtSum(com)}
        </p>
      </div>
    </div>
  );
}

/** One-line tariff summary. */
export function TariffLine({ tariff }: { tariff: DriverTariff }) {
  return (
    <p className="text-[11px] text-neutral-500 text-center">
      {tariff.tiers?.length
        ? `Pog‘onali tarif (${tariff.tiers.length} pog‘ona) · keyin ${fmtSum(tariff.pricePerKm)} so‘m/km`
        : `Tarif: ${fmtSum(tariff.pricePerKm)} so‘m/km · minimum ${fmtSum(tariff.minimumFare)} so‘m`}
      {' · komissiya '}
      {tariff.commissionPercent
        ? `${tariff.commissionPercent}%`
        : `${fmtSum(tariff.commissionPerOrder)} so‘m`}
    </p>
  );
}
