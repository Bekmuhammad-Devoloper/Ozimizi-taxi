import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface ClientInfo {
  id: string;
  firstName: string;
  phonePrimary: string;
  phoneSecondary?: string | null;
  balance: string;
  refCode?: string | null;
  inviteUrl?: string | null;
  botUrl?: string;
}

interface AuthState {
  token: string | null;
  client: ClientInfo | null;
  setAuth: (token: string, client: ClientInfo) => void;
  setClient: (patch: Partial<ClientInfo>) => void;
  logout: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      client: null,
      setAuth: (token, client) => set({ token, client }),
      setClient: (patch) =>
        set((s) => ({ client: s.client ? { ...s.client, ...patch } : (patch as ClientInfo) })),
      logout: () => set({ token: null, client: null }),
    }),
    { name: 'moviy-client-auth' },
  ),
);
