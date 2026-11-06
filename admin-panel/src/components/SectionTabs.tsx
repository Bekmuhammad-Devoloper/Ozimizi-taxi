'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import Cookies from 'js-cookie';
import { cn } from '@/lib/cn';
import { decodeRole } from './Sidebar';

type Badge = 'applications' | 'feedback' | 'food';

// One sidebar item per section; the pages of a section are tabs here.
const SECTIONS: { href: string; label: string; badge?: Badge }[][] = [
  [
    { href: '/orders', label: 'Taksi' },
    { href: '/food-orders', label: 'Ovqat', badge: 'food' },
  ],
  [
    { href: '/drivers', label: 'Haydovchilar' },
    { href: '/driver-applications', label: 'Haydovchi bo‘lmoqchilar', badge: 'applications' },
    { href: '/driver-versions', label: 'Ilova versiyalari' },
  ],
  [
    { href: '/feedback', label: 'Murojaatlar', badge: 'feedback' },
    { href: '/announcements', label: 'Xabarnoma' },
  ],
  [
    { href: '/payment-requests', label: 'To‘lov so‘rovlari' },
    { href: '/coordinators', label: 'Koordinatorlar' },
  ],
  [
    { href: '/promo-codes', label: 'Promo kodlar' },
    { href: '/referrals', label: 'Referral linklar' },
  ],
  [
    { href: '/settings', label: 'Sozlamalar' },
    { href: '/tariff', label: 'Tarif va hudud' },
    { href: '/password', label: 'Parol' },
  ],
];

export function SectionTabs() {
  const pathname = usePathname();
  // The cookie is only readable in the browser: decide after hydration.
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => setIsAdmin(decodeRole(Cookies.get('admin_token')) === 'admin'), []);
  const section = isAdmin
    ? SECTIONS.find((s) => s.some((t) => pathname === t.href || pathname.startsWith(t.href + '/')))
    : undefined;
  // The sidebar keeps these counters fresh; here they are only read.
  const { data: applications } = useQuery<number>({ queryKey: ['driver-applications-unread'], enabled: false });
  const { data: feedback } = useQuery<number>({ queryKey: ['feedback-unread'], enabled: false });
  const { data: food } = useQuery<{ active: number }>({ queryKey: ['food-summary'], enabled: false });
  if (!section) return null;
  const counts: Record<Badge, number> = {
    applications: applications ?? 0,
    feedback: feedback ?? 0,
    food: food?.active ?? 0,
  };
  return (
    <nav className="px-4 lg:px-8 pt-4 -mb-2 flex gap-1.5 overflow-x-auto">
      {section.map((t) => {
        const active = pathname === t.href || pathname.startsWith(t.href + '/');
        const n = t.badge ? counts[t.badge] : 0;
        return (
          <Link
            key={t.href}
            href={t.href}
            className={cn(
              'h-9 px-3.5 rounded-lg text-sm font-semibold flex items-center gap-1.5 whitespace-nowrap border transition-colors',
              active ? 'bg-ink text-white border-ink' : 'bg-white text-neutral-600 border-line hover:bg-neutral-50',
            )}
          >
            {t.label}
            {n > 0 && (
              <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                {n}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
