'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, Gift, User, UtensilsCrossed } from 'lucide-react';
import { cn } from '@/lib/cn';
import { useOrderStore, isActiveStatus } from '@/stores/order';
import { useFoodStore } from '@/stores/food';
import { isFoodActive } from '@/lib/food';

const items = [
  { href: '/home', label: 'Asosiy', icon: Home },
  { href: '/food', label: 'Ovqat', icon: UtensilsCrossed },
  { href: '/orders', label: 'Safarlar', icon: ClipboardList },
  { href: '/bonus', label: 'Bonus', icon: Gift },
  { href: '/profile', label: 'Profil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  const active = useOrderStore((s) => s.active);
  const live = isActiveStatus(active?.status);
  const foodLive = useFoodStore((s) => Object.values(s.orders).some((o) => isFoodActive(o.status)));
  return (
    <div className="fixed bottom-0 inset-x-0 mx-auto max-w-md z-30 pb-[env(safe-area-inset-bottom)]">
      <nav className="mx-3 mb-3 bg-ink text-white rounded-3xl shadow-xl shadow-black/30 ring-1 ring-gold/20 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{ background: 'radial-gradient(circle at 50% 120%, rgba(59,155,255,0.35), transparent 60%)' }}
        />
        <div className="relative grid grid-cols-5">
          {items.map(({ href, label, icon: Icon }) => {
            const isActive = pathname.startsWith(href) || (href === '/home' && pathname.startsWith('/order/'));
            return (
              <Link
                href={href}
                key={href}
                className={cn(
                  'relative flex flex-col items-center justify-center pt-3 pb-3 transition-colors',
                  isActive ? 'text-gold' : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full transition-all duration-200',
                    isActive ? 'bg-gold opacity-100' : 'opacity-0',
                  )}
                />
                <span className={cn('flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-200', isActive && 'bg-gold/15 ring-1 ring-gold/30')}>
                  <Icon className={cn('transition-all duration-200', isActive ? 'w-[22px] h-[22px]' : 'w-5 h-5')} strokeWidth={isActive ? 2.4 : 1.75} />
                  {((href === '/home' && live) || (href === '/food' && foodLive)) && (
                    <span className="absolute top-2 right-[calc(50%-1.25rem)] w-2 h-2 rounded-full bg-gold animate-pulse" aria-hidden />
                  )}
                </span>
                <span className={cn('text-[10px] mt-1 transition-all duration-200 tracking-wide', isActive ? 'font-bold' : 'font-medium')}>
                  {label}
                </span>
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
