import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DriverInfo {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  balance: string;
  isOnline: boolean;
  isApproved?: boolean;
  avatarUrl?: string | null;
  carModel?: string | null;
  carColor?: string | null;
  carPlate?: string | null;
  carPhotoUrl?: string | null;
  profileComplete?: boolean;
  contractAcceptedAt?: string | null;
  approvedAt?: string | null;
  /** 'courier' = foot/bike/moto courier (deliveries only, no car fields). */
  kind?: 'taxi' | 'courier';
  /** Taxi drivers: also receive food deliveries. */
  acceptDelivery?: boolean;
}

interface AuthState {
  token: string | null;
  driver: DriverInfo | null;
  setAuth: (token: string, driver: DriverInfo) => void;
  setDriver: (patch: Partial<DriverInfo>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      driver: null,
      setAuth: (token, driver) => set({ token, driver }),
      setDriver: (patch) =>
        set((s) => ({
          driver: s.driver ? { ...s.driver, ...patch } : (patch as DriverInfo),
        })),
      logout: () => {
        // Stop the APK's background service (no-op in the browser).
        void import('@/lib/native').then((m) => m.driverServiceStop()).catch(() => undefined);
        set({ token: null, driver: null });
      },
    }),
    { name: 'taxi-driver-auth' },
  ),
);
