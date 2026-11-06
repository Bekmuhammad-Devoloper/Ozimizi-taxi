'use client';
import { localize } from '@/lib/lang';

/** Capacitor bridge (present only inside the Android app). */
function cap(): any {
  if (typeof window === 'undefined') return null;
  return (window as any).Capacitor ?? null;
}

export function isNativeApp(): boolean {
  const c = cap();
  return !!c && typeof c.isNativePlatform === 'function' && c.isNativePlatform();
}

const CHANNEL = 'rides';

export async function setupNativeNotifications(): Promise<void> {
  const ln = cap()?.Plugins?.LocalNotifications;
  if (!ln) return;
  try {
    const st = await ln.checkPermissions();
    if (st?.display !== 'granted') await ln.requestPermissions();
    await ln.createChannel({
      id: CHANNEL,
      name: 'Safar holati',
      description: 'Haydovchi topildi, yetib keldi, safar yakunlandi',
      importance: 4,
      visibility: 1,
      vibration: true,
    });
  } catch {
    /* ignore */
  }
}

export async function nativeNotify(title: string, body: string, id: number = Date.now() % 2147483647): Promise<boolean> {
  const ln = cap()?.Plugins?.LocalNotifications;
  if (!ln) return false;
  title = localize(title);
  body = localize(body);
  try {
    await ln.schedule({
      notifications: [{ id, title, body, channelId: CHANNEL, smallIcon: 'ic_stat_notify', iconColor: '#3b9bff', autoCancel: true }],
    });
    return true;
  } catch {
    return false;
  }
}

export interface Fix {
  lat: number;
  lng: number;
  accuracy?: number | null;
}

/** One position fix: Capacitor Geolocation in the APK, browser API otherwise. */
export async function getPosition(): Promise<Fix> {
  const geo = cap()?.Plugins?.Geolocation;
  if (geo) {
    try {
      const st = await geo.checkPermissions();
      if (st?.location !== 'granted') await geo.requestPermissions();
      const pos = await geo.getCurrentPosition({ enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy };
    } catch (e) {
      /* fall through to the browser API */
    }
  }
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      reject(new Error('Geolokatsiya mavjud emas'));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, accuracy: p.coords.accuracy }),
      (err) => reject(new Error(err.code === err.PERMISSION_DENIED ? 'Joylashuvga ruxsat berilmadi' : 'Joylashuv aniqlanmadi')),
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  });
}
