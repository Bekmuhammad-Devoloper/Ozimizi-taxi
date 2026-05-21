'use client';
import { Menu } from 'lucide-react';
import Image from 'next/image';
import { Sidebar } from './Sidebar';
import { useUiStore } from '@/stores/ui';

export function Shell({
  children,
  title,
  subtitle,
  actions,
}: {
  children: React.ReactNode;
  title?: string;
  subtitle?: string;
  actions?: React.ReactNode;
}) {
  const openSidebar = useUiStore((s) => s.setSidebarOpen);

  return (
    <div className="flex">
      <Sidebar />
      <main className="flex-1 min-h-screen min-w-0">
        {/* Mobile top bar */}
        <div className="lg:hidden sticky top-0 z-30 bg-ink text-white px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => openSidebar(true)}
            className="w-10 h-10 -ml-2 rounded-lg flex items-center justify-center hover:bg-neutral-800"
            aria-label="menu"
          >
            <Menu size={22} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md overflow-hidden ring-1 ring-gold/50">
              <Image
                src="/logo.jpg"
                alt=""
                width={28}
                height={28}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="text-sm font-bold tracking-wide">
              OZIMIZNI <span className="text-gold">TAXI</span>
            </span>
          </div>
          <span className="w-10" />
        </div>

        {/* Desktop header */}
        {title && (
          <header className="hidden lg:block sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-line">
            <div className="px-8 py-5 flex items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl font-extrabold tracking-tight">
                  {title}
                </h1>
                {subtitle && (
                  <p className="text-sm text-neutral-500 mt-0.5">{subtitle}</p>
                )}
              </div>
              {actions}
            </div>
          </header>
        )}

        {/* Mobile page title */}
        {title && (
          <div className="lg:hidden px-5 pt-5 pb-2">
            <h1 className="text-xl font-extrabold tracking-tight">{title}</h1>
            {subtitle && (
              <p className="text-xs text-neutral-500 mt-0.5">{subtitle}</p>
            )}
            {actions && (
              <div className="mt-3 flex flex-wrap gap-2">{actions}</div>
            )}
          </div>
        )}

        <div className="p-4 lg:p-8">{children}</div>
      </main>
    </div>
  );
}
