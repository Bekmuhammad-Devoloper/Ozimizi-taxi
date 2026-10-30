'use client';
import { useRouter } from 'next/navigation';
import { PermissionGate } from '@/components/PermissionGate';

/** Permissions screen for a driver who is already logged in (see Shell). */
export default function PermissionsPage() {
  const router = useRouter();
  return <PermissionGate onDone={() => router.replace('/dashboard')} />;
}
