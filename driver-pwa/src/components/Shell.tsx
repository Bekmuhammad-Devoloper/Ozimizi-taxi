'use client';
import { AuthGuard } from './AuthGuard';
import { BottomNav } from './BottomNav';
import { IncomingOrderModal } from './IncomingOrderModal';
import { BonusRequestModal } from './BonusRequestModal';
import { ContractGate } from './ContractGate';
import { AppUpdate } from './AppUpdate';
import { useDriverSocket } from '@/hooks/useDriverSocket';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore } from '@/stores/order';
import { isDeliveryLive, syncActiveDelivery, useDeliveryStore } from '@/stores/delivery';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { needsPermissionScreen } from './PermissionGate';
import {
  driverServiceStart,
  driverServiceStop,
  hasDriverService,
  isNativeApp,
  setupNativeNotifications,
} from '@/lib/native';

// The active food delivery is re-read from the server once per app load
// (per account), so it is restored after a reinstall / on another phone.
let deliveryRestoredFor: string | null = null;
// Missing permissions are checked once per app start for a logged-in driver.
let permissionsChecked = false;

export function Shell({ children }: { children: React.ReactNode }) {
  const driver = useAuthStore((s) => s.driver);
  const active = useOrderStore((s) => s.active);
  const delivery = useDeliveryStore((s) => s.active);
  // Keep socket + GPS alive whenever the driver is online OR has an active order
  // (so per-km distance tracking continues on /order/active even if the driver
  // happens to be toggled offline mid-trip).
  // In the Android app: ask for notification permission and create the
  // loud "new order" channel as soon as the driver is in.
  const router = useRouter();
  useEffect(() => {
    if (!isNativeApp()) return;
    void setupNativeNotifications();
    if (permissionsChecked) return;
    permissionsChecked = true;
    needsPermissionScreen()
      .then((need) => {
        if (need) router.push('/permissions');
      })
      .catch(() => undefined);
  }, [router]);

  // APK: the background service follows the online switch — it keeps
  // receiving orders (and rings) when the app is closed, and stops as soon
  // as the driver goes offline or logs out.
  const token = useAuthStore((s) => s.token);
  const isOnline = !!driver?.isOnline;
  useEffect(() => {
    if (!hasDriverService()) return;
    if (isOnline && token) {
      void driverServiceStart(token, process.env.NEXT_PUBLIC_API_URL || 'https://moviytaxi.uz/api');
    } else {
      void driverServiceStop();
    }
  }, [isOnline, token]);

  useEffect(() => {
    if (!token || deliveryRestoredFor === token) return;
    deliveryRestoredFor = token;
    void syncActiveDelivery();
  }, [token]);

  // The screen must never time out while the app is open — drivers leave it
  // on the dashboard waiting for orders. Re-acquired whenever the app
  // returns to the foreground (the OS releases the lock in the background).
  // The APK additionally sets FLAG_KEEP_SCREEN_ON natively.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: any = null;
    const acquire = async () => {
      try {
        lock = await (navigator as any).wakeLock.request('screen');
      } catch {
        /* not allowed (e.g. low battery) */
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'visible') void acquire();
    };
    void acquire();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      lock?.release?.().catch?.(() => undefined);
    };
  }, []);

  // A food delivery in progress keeps them alive too (READY / CANCELLED
  // updates arrive over the socket; the client follows the courier's GPS).
  useDriverSocket({
    enabled:
      !!driver?.isOnline ||
      (!!active &&
        active.status !== 'COMPLETED' &&
        active.status !== 'CANCELLED') ||
      isDeliveryLive(delivery),
  });

  return (
    <AuthGuard>
      <div className="min-h-[100dvh] pb-24 max-w-md mx-auto sm:border-x sm:border-line sm:min-h-screen">
        {/* Version report + "new version" banner / update dialog. */}
        <AppUpdate />
        {children}
      </div>
      <BottomNav />
      <IncomingOrderModal />
      <BonusRequestModal />
      <ContractGate />
    </AuthGuard>
  );
}
