import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface DriverInfo {
  id: string;
  fullName: string;
  phone: string;
  email?: string | null;
  balance: string;
  isOnline: boolean;
  avatarUrl?: string | null;
  carModel?: string | null;
  carColor?: string | null;
  carPlate?: string | null;
  carPhotoUrl?: string | null;
  profileComplete?: boolean;
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
      logout: () => set({ token: null, driver: null }),
    }),
    { name: 'taxi-driver-auth' },
  ),
);
