'use client';
import { AuthGuard } from './AuthGuard';
import { BottomNav } from './BottomNav';
import { IncomingOrderModal } from './IncomingOrderModal';
import { useDriverSocket } from '@/hooks/useDriverSocket';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore } from '@/stores/order';

export function Shell({ children }: { children: React.ReactNode }) {
  const driver = useAuthStore((s) => s.driver);
  const active = useOrderStore((s) => s.active);
  // Keep socket + GPS alive whenever the driver is online OR has an active order
  // (so per-km distance tracking continues on /order/active even if the driver
  // happens to be toggled offline mid-trip).
  useDriverSocket({
    enabled:
      !!driver?.isOnline ||
      (!!active &&
        active.status !== 'COMPLETED' &&
        active.status !== 'CANCELLED'),
  });

  return (
    <AuthGuard>
      <div className="min-h-[100dvh] pb-24 max-w-md mx-auto sm:border-x sm:border-line sm:min-h-screen">
        {children}
      </div>
      <BottomNav />
      <IncomingOrderModal />
    </AuthGuard>
  );
}
