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
 */
export function AuthGuard({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const token = useAuthStore((s) => s.token);
  const isApproved = useAuthStore((s) => s.driver?.isApproved);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token) {
      router.replace('/login');
      return;
    }
    // Self-registered drivers land here unapproved; admin-created ones are
    // pre-approved and skip the wait screen.
    if (isApproved === false && pathname !== '/pending') {
      router.replace('/pending');
      return;
    }
    if (isApproved && pathname === '/pending') {
      router.replace('/dashboard');
      return;
    }
    setReady(true);
  }, [token, isApproved, pathname, router]);

  if (!ready) return null;
  return <>{children}</>;
}
