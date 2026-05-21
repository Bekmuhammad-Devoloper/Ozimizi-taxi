'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Home, ClipboardList, Wallet, User } from 'lucide-react';
import { cn } from '@/lib/cn';

const items = [
  { href: '/dashboard', label: 'Asosiy', icon: Home },
  { href: '/orders', label: 'Buyurtma', icon: ClipboardList },
  { href: '/balance', label: 'Balans', icon: Wallet },
  { href: '/profile', label: 'Profil', icon: User },
];

export function BottomNav() {
  const pathname = usePathname();
  return (
    <div
      className="
        fixed bottom-0 inset-x-0 mx-auto max-w-md z-30
        pb-[env(safe-area-inset-bottom)]
      "
    >
      <nav className="mx-3 mb-3 bg-ink text-white rounded-3xl shadow-xl shadow-black/30 ring-1 ring-gold/20 relative overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 120%, rgba(250,204,21,0.35), transparent 60%)',
          }}
        />
        <div className="relative grid grid-cols-4">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                href={href}
                key={href}
                className={cn(
                  'relative flex flex-col items-center justify-center pt-3 pb-3 transition-colors',
                  active ? 'text-gold' : 'text-neutral-500 hover:text-neutral-300',
                )}
              >
                {/* Top gold indicator */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] rounded-b-full transition-all duration-200',
                    active ? 'bg-gold opacity-100' : 'opacity-0',
                  )}
                />
                <span
                  className={cn(
                    'flex items-center justify-center w-10 h-10 rounded-2xl transition-all duration-200',
                    active && 'bg-gold/15 ring-1 ring-gold/30',
                  )}
                >
                  <Icon
                    className={cn(
                      'transition-all duration-200',
                      active ? 'w-[22px] h-[22px]' : 'w-5 h-5',
                    )}
                    strokeWidth={active ? 2.4 : 1.75}
                  />
                </span>
                <span
                  className={cn(
                    'text-[10px] mt-1 transition-all duration-200 tracking-wide',
                    active ? 'font-bold' : 'font-medium',
                  )}
                >
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
