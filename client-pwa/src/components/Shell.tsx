'use client';
import { useEffect } from 'react';
import { AppUpdate } from './AppUpdate';
import { AuthGuard } from './AuthGuard';
import { BottomNav } from './BottomNav';
import { Toast } from './Toast';
import { useClientSocket } from '@/hooks/useClientSocket';
import { isNativeApp, setupNativeNotifications } from '@/lib/native';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore, isActiveStatus } from '@/stores/order';
import { useFoodStore } from '@/stores/food';
import { FoodOrder, isFoodActive } from '@/lib/food';

// Shell remounts on every page; don't refetch food orders more than every 10 s.
let lastFoodSync = 0;

function Live() {
  useClientSocket();
  const token = useAuthStore((s) => s.token);
  const setClient = useAuthStore((s) => s.setClient);
  const setActive = useOrderStore((s) => s.setActive);
  useEffect(() => {
    if (isNativeApp()) void setupNativeNotifications();
  }, []);
  // Resync on open, when the app returns to the foreground, and every 20 s
  // while a ride is live (the socket can drop inside a mobile WebView).
  useEffect(() => {
    if (!token) return;
    const sync = () => {
      api.get('/client/me').then((r) => setClient(r.data)).catch(() => {});
      api
        .get('/client/orders/active')
        .then((r) => {
          const current = useOrderStore.getState().active;
          const fresh = r.data ?? null;
          if (fresh) setActive(fresh);
          else if (current && isActiveStatus(current.status)) setActive(null);
        })
        .catch(() => {});
    };
    sync();
    const onVis = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVis);
    const t = window.setInterval(() => {
      const a = useOrderStore.getState().active;
      if (a && isActiveStatus(a.status)) sync();
    }, 20_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(t);
    };
  }, [token, setClient, setActive]);

  // Food orders: seed on open, refresh when back in the foreground and every
  // 30 s while one is live (status toasts even if the socket dropped).
  useEffect(() => {
    if (!token) return;
    const syncFood = (force = false) => {
      if (!force && Date.now() - lastFoodSync < 10_000) return;
      lastFoodSync = Date.now();
      api
        .get<FoodOrder[]>('/client/food/orders')
        .then((r) => useFoodStore.getState().upsertMany(Array.isArray(r.data) ? r.data : [], 'fetch'))
        .catch(() => {});
    };
    syncFood();
    const onVis = () => {
      if (document.visibilityState === 'visible') syncFood(true);
    };
    document.addEventListener('visibilitychange', onVis);
    const t = window.setInterval(() => {
      if (Object.values(useFoodStore.getState().orders).some((o) => isFoodActive(o.status))) syncFood(true);
    }, 30_000);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.clearInterval(t);
    };
  }, [token]);
  return null;
}

/**
 * Authenticated frame. `full` pages (map screens) manage their own height and
 * bottom spacing; others get the standard padding above the nav.
 */
export function Shell({ children, nav = true, full = false }: { children: React.ReactNode; nav?: boolean; full?: boolean }) {
  return (
    <AuthGuard>
      <Live />
      <Toast />
      <AppUpdate />
      <div className={'max-w-md mx-auto sm:border-x sm:border-line ' + (full ? 'h-[100dvh] overflow-hidden' : 'min-h-[100dvh] ' + (nav ? 'pb-28' : ''))}>
        {children}
      </div>
      {nav && <BottomNav />}
    </AuthGuard>
  );
}
