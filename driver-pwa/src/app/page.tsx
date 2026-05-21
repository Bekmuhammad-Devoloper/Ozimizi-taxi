'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';

export default function HomePage() {
  const router = useRouter();
  useEffect(() => {
    const token = useAuthStore.getState().token;
    router.replace(token ? '/dashboard' : '/login');
  }, [router]);
  return null;
}
