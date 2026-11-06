'use client';
import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
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
  MessageSquare,
  UserPlus,
  Ticket,
  Link2,
  KeyRound,
  Megaphone,
  ChefHat,
  UtensilsCrossed,
  ClipboardList,
  BookOpen,
  Bike,
  PlusCircle,
  Smartphone,
  X,
} from 'lucide-react';
import { api } from '@/lib/api';
import { som, type KitchenWallet } from '@/lib/food';
import { getAdminSocket } from '@/lib/socket';
import { cn } from '@/lib/cn';
import { useUiStore } from '@/stores/ui';
import { LangToggle } from './Lang';

// Compact menu: the other pages of a section are tabs (see SectionTabs).
const adminItems: { href: string; label: string; icon: any; also?: string[] }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/orders', label: 'Buyurtmalar', icon: ListOrdered, also: ['/food-orders'] },
  { href: '/kitchens', label: 'Oshxonalar', icon: ChefHat },
  { href: '/drivers', label: 'Haydovchilar', icon: Car, also: ['/driver-applications', '/driver-versions'] },
  { href: '/clients', label: 'Klientlar', icon: Users },
  { href: '/feedback', label: 'Xabarlar', icon: MessageSquare, also: ['/announcements'] },
  { href: '/payment-requests', label: 'Moliya', icon: Inbox, also: ['/coordinators'] },
  { href: '/promo-codes', label: 'Marketing', icon: Ticket, also: ['/referrals'] },
  { href: '/settings', label: 'Sozlamalar', icon: Settings, also: ['/tariff', '/password'] },
];

const coordinatorItems = [
  { href: '/coordinator', label: 'To‘lov yuborish', icon: Wallet },
  { href: '/password', label: 'Parolni o‘zgartirish', icon: KeyRound },
];

// Kitchen (oshxona) panel — role 'kitchen' only sees these.
const kitchenItems = [
  { href: '/kitchen', label: 'Buyurtmalar', icon: ClipboardList },
  { href: '/kitchen/new-order', label: 'Yangi buyurtma', icon: PlusCircle },
  { href: '/kitchen/menu', label: 'Menyu', icon: BookOpen },
  { href: '/kitchen/couriers', label: 'Kuryerlar', icon: Bike },
  { href: '/kitchen/wallet', label: 'Hamyon', icon: Wallet },
  { href: '/kitchen/settings', label: 'Sozlamalar', icon: Settings },
];

type Role = 'admin' | 'coordinator' | 'kitchen';

export function decodeRole(token: string | undefined): Role | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    const json = atob(parts[1].replace(/-/g, '+').replace(/_/g, '/'));
    const p = JSON.parse(json);
    if (p?.role === 'coordinator') return 'coordinator';
    if (p?.role === 'kitchen') return 'kitchen';
    return 'admin';
  } catch {
    return null;
  }
}

const ROLE_LABEL: Record<Role, string> = {
  admin: 'Admin',
  coordinator: 'Koordinator',
  kitchen: 'Oshxona',
};

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();
  const open = useUiStore((s) => s.sidebarOpen);
  const setOpen = useUiStore((s) => s.setSidebarOpen);
  const role = decodeRole(Cookies.get('admin_token'));
  const items: { href: string; label: string; icon: any; also?: string[] }[] =
    role === 'coordinator' ? coordinatorItems : role === 'kitchen' ? kitchenItems : adminItems;

  const { data: applicationsUnread } = useQuery({
    queryKey: ['driver-applications-unread'],
    queryFn: async () =>
      (
        await api.get<{ count: number }>(
          '/admin/driver-applications/unread-count',
        )
      ).data.count,
    enabled: role === 'admin',
    refetchInterval: 15_000,
  });

  const { data: feedbackUnread } = useQuery({
    queryKey: ['feedback-unread'],
    queryFn: async () =>
      (await api.get<{ count: number }>('/admin/feedback/unread-count')).data.count,
    enabled: role === 'admin',
    refetchInterval: 15_000,
  });

  // Active food deliveries (badge on "Ovqat buyurtmalari").
  const { data: foodSummary } = useQuery({
    queryKey: ['food-summary'],
    queryFn: async () =>
      (await api.get<{ active: number }>('/admin/food/summary')).data,
    enabled: role === 'admin',
    refetchInterval: 15_000,
  });
  const foodActive = foodSummary?.active ?? 0;

  // Kitchen panel: own name + "new orders" badge.
  const { data: kitchenMe } = useQuery({
    queryKey: ['kitchen-me'],
    queryFn: async () =>
      (await api.get<{ name: string; isOpen: boolean }>('/kitchen/me')).data,
    enabled: role === 'kitchen',
  });
  const { data: kitchenActive } = useQuery({
    queryKey: ['kitchen-orders', 'active'],
    queryFn: async () =>
      (
        await api.get<{ status: string }[]>('/kitchen/orders', {
          params: { scope: 'active' },
        })
      ).data,
    enabled: role === 'kitchen',
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });
  const kitchenNew = (kitchenActive ?? []).filter((o) => o.status === 'NEW').length;
  // Kitchen wallet balance (same cache key as the wallet page / board).
  const { data: kitchenWallet } = useQuery({
    queryKey: ['kitchen-wallet', '/kitchen'],
    queryFn: async () => (await api.get<KitchenWallet>('/kitchen/wallet')).data,
    enabled: role === 'kitchen',
    refetchInterval: 60_000,
  });
  const kitchenBalance = kitchenWallet?.balance;

  // A bot user wrote to the admin — refresh the inbox badge right away.
  const qc = useQueryClient();
  useEffect(() => {
    if (role !== 'admin') return;
    const socket = getAdminSocket();
    if (!socket) return;
    const onNew = () => {
      qc.invalidateQueries({ queryKey: ['feedback-unread'] });
      qc.invalidateQueries({ queryKey: ['feedback'] });
    };
    const onFood = () => qc.invalidateQueries({ queryKey: ['food-summary'] });
    socket.on('feedback_new', onNew);
    socket.on('food_order_update', onFood);
    return () => {
      socket.off('feedback_new', onNew);
      socket.off('food_order_update', onFood);
    };
  }, [qc, role]);

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
    // Inside the Telegram Mini App there is no login form to go back to —
    // just close the panel.
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initData) {
      tg.close?.();
      return;
    }
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
          <div className="w-12 h-12 rounded-xl overflow-hidden ring-2 ring-gold/60 shadow-[0_10px_30px_-10px_rgba(59,155,255,0.8)] shrink-0">
            <Image
              src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.jpg`}
              alt="MOVIY TAXI"
              width={48}
              height={48}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold tracking-wide leading-tight">
              MOVIY
            </p>
            <p className="text-xs text-gold leading-tight">
              TAXI · {ROLE_LABEL[role ?? 'admin']}
            </p>
            {role === 'kitchen' && kitchenMe?.name && (
              <p
                className="mt-0.5 text-[11px] text-neutral-300 leading-tight flex items-center gap-1 min-w-0"
                title={kitchenMe.name}
              >
                <span
                  className={
                    'w-1.5 h-1.5 rounded-full shrink-0 ' +
                    (kitchenMe.isOpen ? 'bg-emerald-400' : 'bg-red-500')
                  }
                />
                <span className="truncate">{kitchenMe.name}</span>
              </p>
            )}
            {role === 'kitchen' && kitchenBalance != null && (
              <Link
                href="/kitchen/wallet"
                title="Hamyon balansi"
                className={
                  'mt-0.5 text-[11px] leading-tight flex items-center gap-1 tabular-nums font-semibold ' +
                  (kitchenBalance < 0 ? 'text-red-400' : 'text-neutral-300 hover:text-white')
                }
              >
                <Wallet size={11} className="shrink-0" /> {som(kitchenBalance)} so‘m
              </Link>
            )}
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
          {items.map(({ href, label, icon: Icon, also }) => {
            // '/kitchen' must not light up on '/kitchen/menu', nor
            // '/coordinator' on '/coordinators'.
            const active =
              href === '/kitchen'
                ? pathname === href
                : [href, ...(also ?? [])].some((h) => pathname === h || pathname.startsWith(h + '/'));
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  active
                    ? 'bg-gold text-ink'
                    : 'text-neutral-300 hover:bg-neutral-800',
                )}
              >
                <Icon className="w-5 h-5" strokeWidth={1.75} />
                <span className="flex-1">{label}</span>
                {href === '/drivers' && !!applicationsUnread && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {applicationsUnread}
                  </span>
                )}
                {href === '/feedback' && !!feedbackUnread && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {feedbackUnread}
                  </span>
                )}
                {href === '/orders' && foodActive > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                    {foodActive}
                  </span>
                )}
                {href === '/kitchen/wallet' && kitchenBalance != null && kitchenBalance < 0 && (
                  <span className="h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
                    {som(kitchenBalance)}
                  </span>
                )}
                {href === '/kitchen' && kitchenNew > 0 && (
                  <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-pulse">
                    {kitchenNew}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        <div className="px-3 pt-2 flex justify-center">
          <LangToggle dark />
        </div>
        <button
          onClick={logout}
          className="m-3 mt-2 flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium text-neutral-300 hover:bg-neutral-800"
        >
          <LogOut className="w-5 h-5" strokeWidth={1.75} /> Chiqish
        </button>
      </aside>
    </>
  );
}
