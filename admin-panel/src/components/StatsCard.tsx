import { LucideIcon } from 'lucide-react';

interface Props {
  title: string;
  value: string | number;
  icon: LucideIcon;
  accent?: string;
  hint?: string;
}

export function StatsCard({
  title,
  value,
  icon: Icon,
  accent = 'bg-gold/15 text-gold-deep',
  hint,
}: Props) {
  return (
    <div className="card p-5 relative overflow-hidden">
      <div
        aria-hidden
        className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gold/10 blur-2xl pointer-events-none"
      />
      <div className="relative flex items-start justify-between gap-3">
        <div>
          <p className="label">{title}</p>
          <p className="mt-2 text-2xl font-extrabold tabular-nums">{value}</p>
          {hint && (
            <p className="mt-1 text-xs text-neutral-500">{hint}</p>
          )}
        </div>
        <span
          className={
            'w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ' +
            accent
          }
        >
          <Icon size={20} strokeWidth={2} />
        </span>
      </div>
    </div>
  );
}
