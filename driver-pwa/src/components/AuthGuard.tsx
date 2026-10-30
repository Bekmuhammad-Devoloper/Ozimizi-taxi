'use client';
import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';

/**
 * Gates the driver-only routes.
 *   - No token         → /login
 *   - Token, not approved → /pending
 *   - Token, approved  → render children
 *
 * Reactive: subscribes to token + isApproved so logout/approval flips
 * cause an immediate redirect without a manual refresh.
 *
 * The decision reads `useAuthStore.getState()` rather than the hook values:
 * during the hydration render zustand's hook returns the *server* snapshot
 * (token = null), which used to bounce logged-in drivers to /login on every
 * full page load.
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const isApproved = useAuthStore((s) => s.driver?.isApproved);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const state = useAuthStore.getState();
    if (!state.token) {
      router.replace('/login');
      return;
    }
    const approved = state.driver?.isApproved;
    // Self-registered drivers land here unapproved; admin-created ones are
    // pre-approved and skip the wait screen.
    if (approved === false && pathname !== '/pending') {
      router.replace('/pending');
      return;
    }
    if (approved && pathname === '/pending') {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [token, isApproved, pathname, router]);

  if (!ready) return null;
  return <>{children}</>;
}
