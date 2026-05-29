'use client';
import { useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import Cookies from 'js-cookie';
import {
  LayoutDashboard,
  ListOrdered,
  Car,
  Users,
  Receipt,
  LogOut,
  Settings,
  Wallet,
  Inbox,
  ShieldCheck,
  X,
} from 'lucide-react';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui';

const adminItems = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Buyurtmalar', icon: ListOrdered },
  { href: '/drivers', label: 'Haydovchilar', icon: Car },
  { href: '/clients', label: 'Klientlar', icon: Users },
  { href: '/payment-requests', label: 'To‘lov so‘rovlari', icon: Inbox },
  { href: '/coordinators', label: 'Koordinatorlar', icon: ShieldCheck },
  { href: '/tariff', label: 'Tariflar', icon: Receipt },
  { href: '/settings', label: 'Sozlamalar', icon: Settings },
];

const coordinatorItems = [
  { href: '/coordinator', label: 'To‘lov yuborish', icon: Wallet },
];

function decodeRole(token: string | undefined): 'admin' | 'coordinator' | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json);
    return p?.role === 'coordinator' ? 'coordinator' : 'admin';
  } catch {
    return null;
  }
}

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const role = decodeRole(Cookies.get('admin_token'));
  const items = role === 'coordinator' ? coordinatorItems : adminItems;

  // Close drawer on route change (mobile)
  useEffect(() => {
    setOpen(false);
  }, [pathname, setOpen]);

  // Lock body scroll while drawer is open
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  const logout = () => {
    Cookies.remove('admin_token');
    router.replace('/login');
  };

  return (
    <>
      {/* Backdrop (mobile only) */}
      {open && (
        <button
          aria-label="close sidebar"
          onClick={() => setOpen(false)}
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
        />
      )}

      <aside
        className={cn(
          'fixed lg:sticky top-0 z-50 h-screen w-64 bg-ink text-neutral-200 flex flex-col transition-transform duration-300 ease-out',
          open ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        <div className="p-5 border-b border-neutral-800 flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg overflow-hidden ring-1 ring-gold/50 shrink-0">
            <Image
              src="/logo.jpg"
              alt="OZIMIZNI TAXI"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold tracking-wide leading-tight">
              OZIMIZNI
            </p>
            <p className="text-xs text-gold leading-tight">
              TAXI · {role === 'coordinator' ? 'Koordinator' : 'Admin'}
            </p>
          </div>
          <button
            onClick={() => setOpen(false)}
            className="lg:hidden text-neutral-400 hover:text-white p-1"
            aria-label="close"
          >
            <X size={20} />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {items.map(({ href, label, icon: Icon }) => {
            const active = pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-gold text-ink'
                    : 'text-neutral-300 hover:bg-neutral-800',
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                {label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={logout}
          className="m-3 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-neutral-300 hover:bg-neutral-800"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.75} /> Chiqish
        </button>
      </aside>
    </>
  );
}
