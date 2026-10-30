import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  /** Small suffix after the number, e.g. "so‘m". */
  unit?: string;
  icon: LucideIcon;
  accent?: string;
  hint?: string;
  className?: string;
}

export function StatsCard({
  title,
  value,
  unit,
  icon: Icon,
  accent = 'bg-gold/15 text-gold-deep',
  hint,
  className = '',
}: Props) {
  return (
    <div className={'card p-4 sm:p-5 relative overflow-hidden min-w-0 ' + className}>
      <div
        aria-hidden
        className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gold/10 blur-2xl pointer-events-none"
      />
      <div className="relative flex items-center gap-2.5 sm:gap-3">
        <span
          className={
            'w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center shrink-0 ' +
            accent
          }
        >
          <Icon size={18} strokeWidth={2} />
        </span>
        <p className="label min-w-0 leading-tight line-clamp-2">{title}</p>
      </div>
      <p className="relative mt-3 sm:mt-4 font-extrabold tabular-nums leading-tight break-words">
        <span className="text-xl sm:text-2xl">{value}</span>
        {unit && (
          <span className="ml-1 text-sm font-semibold text-neutral-500">
            {unit}
          </span>
        )}
      </p>
      {hint && (
        <p className="relative mt-1 text-xs text-neutral-500">{hint}</p>
      )}
    </div>
  );
}
