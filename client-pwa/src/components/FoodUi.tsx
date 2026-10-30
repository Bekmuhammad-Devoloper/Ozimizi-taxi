'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Minus, Plus, ShoppingBag, UtensilsCrossed, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/cn';
import { foodImg } from '@/lib/food';
import { money } from '@/lib/status';
import { cartCount, cartSum, useCartStore } from '@/stores/cart';

/** Uploaded photo with a soft placeholder when missing or broken. */
export function FoodImage({ src, alt = '', className, iconSize = 28 }: { src?: string | null; alt?: string; className?: string; iconSize?: number }) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const url = foodImg(src);
  if (!url || broken) {
    return (
      <span className={cn('flex items-center justify-center bg-gradient-to-br from-gold/25 via-amber-100 to-orange-100 text-gold-deep/70', className)}>
        <UtensilsCrossed size={iconSize} strokeWidth={1.6} />
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt={alt} loading="lazy" decoding="async" onError={() => setBroken(true)} className={cn('object-cover', className)} />;
}

export function KitchenLogo({ url, size = 56, className, dim }: { url?: string | null; size?: number; className?: string; dim?: boolean }) {
  return (
    <span
      className={cn('block shrink-0 overflow-hidden rounded-2xl bg-white ring-1 ring-black/5 shadow-sm', dim && 'grayscale', className)}
      style={{ width: size, height: size }}
    >
      <FoodImage src={url} className="w-full h-full" iconSize={Math.round(size * 0.42)} />
    </span>
  );
}

export function OpenBadge({ open }: { open: boolean }) {
  return (
    <span
      className={cn(
        'shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full',
        open ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200' : 'bg-neutral-100 text-neutral-500 ring-1 ring-neutral-200',
      )}
    >
      <span className={cn('w-1.5 h-1.5 rounded-full', open ? 'bg-emerald-500' : 'bg-neutral-400')} />
      {open ? 'Ochiq' : 'Yopiq'}
    </span>
  );
}

/** − qty + pill. */
export function QtyControl({
  qty,
  onInc,
  onDec,
  disabled,
  size = 'md',
  className,
}: {
  qty: number;
  onInc: () => void;
  onDec: () => void;
  disabled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const h = size === 'sm' ? 'h-8' : size === 'lg' ? 'h-12' : 'h-10';
  const w = size === 'sm' ? 'w-8' : size === 'lg' ? 'w-12' : 'w-10';
  return (
    <div className={cn('flex items-center justify-between rounded-2xl bg-ink text-white select-none', h, className)}>
      <button type="button" aria-label="Kamaytirish" onClick={onDec} className={cn('flex items-center justify-center rounded-2xl active:bg-white/10', h, w)}>
        <Minus size={size === 'sm' ? 14 : 16} />
      </button>
      <span className={cn('font-extrabold tabular-nums text-gold', size === 'sm' ? 'text-sm' : 'text-base')}>{qty}</span>
      <button
        type="button"
        aria-label="Ko‘paytirish"
        onClick={onInc}
        disabled={disabled}
        className={cn('flex items-center justify-center rounded-2xl active:bg-white/10 disabled:opacity-40', h, w)}
      >
        <Plus size={size === 'sm' ? 14 : 16} />
      </button>
    </div>
  );
}

/** Floating cart summary → checkout. `aboveNav` lifts it over the bottom navigation. */
export function CartBar({ aboveNav, label }: { aboveNav?: boolean; label?: string }) {
  const lines = useCartStore((s) => s.lines);
  const kitchens = useCartStore((s) => s.kitchens);
  if (!lines.length) return null;
  const count = cartCount(lines);
  const ids = Array.from(new Set(lines.map((l) => l.kitchenId)));
  const title = label ?? (ids.length > 1 ? `${ids.length} ta oshxonadan` : kitchens[ids[0]]?.name ?? 'Savat');
  return (
    <div
      className="fixed inset-x-0 z-30 mx-auto max-w-md px-3 pointer-events-none"
      style={{ bottom: aboveNav ? 'calc(env(safe-area-inset-bottom) + 5.9rem)' : 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}
    >
      <Link
        href="/food/checkout"
        className="pointer-events-auto h-16 rounded-2xl bg-ink text-white pl-2 pr-4 flex items-center gap-3 shadow-[0_14px_40px_-12px_rgba(0,0,0,.65)] ring-1 ring-gold/25 animate-in fade-in slide-in-from-bottom-3 duration-300 active:scale-[0.98] transition"
      >
        <span className="relative w-12 h-12 rounded-xl bg-gold text-ink flex items-center justify-center shrink-0">
          <ShoppingBag size={20} />
          <span className="absolute -top-1.5 -right-1.5 min-w-[22px] h-[22px] px-1 rounded-full bg-white text-ink text-[11px] font-extrabold flex items-center justify-center ring-2 ring-ink tabular-nums">
            {count}
          </span>
        </span>
        <span className="flex-1 min-w-0 leading-tight">
          <span className="block text-[10px] uppercase tracking-widest text-neutral-400 font-bold truncate">{title}</span>
          <span className="block font-extrabold">Savatni ko‘rish</span>
        </span>
        <span className="text-right shrink-0">
          <span className="block font-extrabold tabular-nums text-gold">{money(cartSum(lines))}</span>
          <span className="block text-[10px] text-neutral-400">so‘m</span>
        </span>
        <ChevronRight size={18} className="text-neutral-500 -mr-1" />
      </Link>
    </div>
  );
}
