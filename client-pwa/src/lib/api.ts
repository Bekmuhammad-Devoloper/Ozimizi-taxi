import axios from 'axios';
import { useAuthStore } from '@/stores/auth';

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

export const api = axios.create({ baseURL: API_BASE });

api.interceptors.request.use((cfg) => {
  if (typeof window !== 'undefined') {
    const token = useAuthStore.getState().token;
    if (token) cfg.headers.Authorization = `Bearer ${token}`;
  }
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) useAuthStore.getState().logout();
    return Promise.reject(err);
  },
);

/** Error text from a NestJS response, falling back to a generic message. */
export function errMsg(e: any, fallback = 'Xato yuz berdi'): string {
  const m = e?.response?.data?.message;
  return Array.isArray(m) ? m.join(', ') : m ?? fallback;
}
