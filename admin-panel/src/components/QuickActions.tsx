'use client';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Inbox, ListOrdered, Map, Megaphone, MessageSquare, Smartphone, Ticket, UserPlus } from 'lucide-react';

/** A row of shortcuts on the dashboard. */
export function QuickActions() {
  const { data: applications } = useQuery<number>({ queryKey: ['driver-applications-unread'], enabled: false });
  const { data: feedback } = useQuery<number>({ queryKey: ['feedback-unread'], enabled: false });
  const items = [
    { href: '/orders', label: 'Buyurtmalar', icon: ListOrdered, n: 0 },
    { href: '/driver-applications', label: 'Yangi arizalar', icon: UserPlus, n: applications ?? 0 },
    { href: '/payment-requests', label: 'To‘lov so‘rovlari', icon: Inbox, n: 0 },
    { href: '/feedback', label: 'Murojaatlar', icon: MessageSquare, n: feedback ?? 0 },
    { href: '/announcements', label: 'Xabar yuborish', icon: Megaphone, n: 0 },
    { href: '/driver-versions', label: 'Yangilash so‘rovi', icon: Smartphone, n: 0 },
    { href: '/tariff', label: 'Tarif va hudud', icon: Map, n: 0 },
    { href: '/promo-codes', label: 'Promo kod', icon: Ticket, n: 0 },
  ];
  return (
    <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
      {items.map(({ href, label, icon: Icon, n }) => (
        <Link
          key={href}
          href={href}
          className="h-10 px-3.5 rounded-xl border border-line bg-white text-sm font-semibold whitespace-nowrap flex items-center gap-2 hover:bg-neutral-50"
        >
          <Icon size={16} className="text-gold-dark" />
          {label}
          {n > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {n}
            </span>
          )}
        </Link>
      ))}
    </div>
  );
}
