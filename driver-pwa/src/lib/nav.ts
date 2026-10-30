// "Yo‘l ko‘rsatish": route to a point in Yandex Navigator, or Yandex Maps in
// the browser when the Navigator app is not installed.
import { isNativeApp } from '@/lib/native';

/** Web fallback: Yandex Maps with a car route to the point. */
export function yandexMapsRouteUrl(lat: number, lng: number): string {
  return `https://yandex.uz/maps/?rtext=~${lat},${lng}&rtt=auto`;
}

/**
 * Open an outside link: a new tab in the browser; in the APK the WebView
 * hands other hosts to the system (browser / the matching app).
 */
export function openExternalUrl(url: string): void {
  if (typeof window === 'undefined') return;
  if (isNativeApp()) {
    window.location.href = url;
    return;
  }
  const w = window.open(url, '_blank');
  if (w) {
    try {
      w.opener = null;
    } catch {
      /* cross-origin */
    }
  } else {
    // Popup blocked — open in this tab instead.
    window.location.href = url;
  }
}

let pendingFallback: number | null = null;
let pendingCleanup: (() => void) | null = null;

/**
 * Build a route to (lat, lng) in Yandex Navigator. If the app does not take
 * over within ~1.2 s (page still visible), open Yandex Maps on the web.
 */
export function openYandexNavigator(lat: number, lng: number): void {
  if (typeof window === 'undefined') return;
  const la = Number(lat);
  const lo = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(lo)) return;

  const deep = `yandexnavi://build_route_on_map?lat_to=${la}&lon_to=${lo}`;
  const web = yandexMapsRouteUrl(la, lo);

  // A second tap replaces the first attempt.
  if (pendingFallback != null) window.clearTimeout(pendingFallback);
  pendingCleanup?.();
  let left = false;
  const onHide = () => {
    if (document.visibilityState === 'hidden') left = true;
  };
  const onLeave = () => {
    left = true;
  };
  document.addEventListener('visibilitychange', onHide);
  // Capacitor's own "app went to background" event.
  document.addEventListener('pause', onLeave);
  window.addEventListener('pagehide', onLeave);
  window.addEventListener('blur', onLeave);
  const cleanup = () => {
    document.removeEventListener('visibilitychange', onHide);
    document.removeEventListener('pause', onLeave);
    window.removeEventListener('pagehide', onLeave);
    window.removeEventListener('blur', onLeave);
    pendingCleanup = null;
  };
  pendingCleanup = cleanup;

  pendingFallback = window.setTimeout(() => {
    pendingFallback = null;
    cleanup();
    if (left || document.visibilityState !== 'visible') return;
    openExternalUrl(web);
  }, 1200);

  try {
    window.location.href = deep;
  } catch {
    /* scheme rejected — the fallback timer opens the web map */
  }
}

/**
 * APK download link. The app's WebView silently ignores downloads, but it hands
 * a link with another scheme to the system — so inside the app use plain http:
 * the browser follows nginx's redirect to https and saves the file.
 */
export function apkDownloadUrl(path: string): string {
  if (typeof window === 'undefined' || !isNativeApp() || !path.startsWith('/')) return path;
  return `http://${window.location.host}${path}`;
}
