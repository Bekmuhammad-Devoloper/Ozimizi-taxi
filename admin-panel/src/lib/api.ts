import axios from 'axios';
import Cookies from 'js-cookie';

export const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001',
});

api.interceptors.request.use((cfg) => {
  const token = Cookies.get('admin_token');
  if (token) cfg.headers.Authorization = `Bearer ${token}`;
  return cfg;
});

api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 401) {
      Cookies.remove('admin_token');
      if (typeof window !== 'undefined') {
        // Inside the Telegram Mini App go back to the Telegram login page
        // (it can re-authenticate from initData), not the web login.
        const inTg = !!(window as any).Telegram?.WebApp?.initData;
        const base = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
        const target = `${base}${inTg ? '/tg' : '/login'}`;
        if (!window.location.pathname.endsWith(inTg ? '/tg' : '/login')) {
          window.location.href = target;
        }
      }
    }
    return Promise.reject(err);
  },
);
