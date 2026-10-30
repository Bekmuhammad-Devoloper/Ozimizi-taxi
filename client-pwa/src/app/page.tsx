'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth';
import { isTelegram } from '@/lib/telegram';

export default function Index() {
  const router = useRouter();
  useEffect(() => {
    // Inside the Telegram Mini App the guard on /home logs in with initData.
    router.replace(useAuthStore.getState().token || isTelegram() ? '/home' : '/login');
  }, [router]);
  return null;
}
