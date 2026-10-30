// Bridge to the Android app (Capacitor wrapper in driver-android/). The
// same web app runs in a normal browser (PWA) and inside the APK; here we
// detect the native shell and reach its plugins through the injected
// `window.Capacitor` runtime. Everything is a no-op in the browser.

interface NativeLocation {
  latitude: number;
  longitude: number;
  accuracy: number;
  time?: number | null;
}

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
  Plugins?: Record<string, any>;
};

function cap(): CapacitorGlobal | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).Capacitor as CapacitorGlobal) ?? null;
}

export function isNativeApp(): boolean {
  const c = cap();
  return !!c && typeof c.isNativePlatform === 'function' && c.isNativePlatform();
}

// Android caches a channel's sound at creation time, so a new chime needs a
// new channel id (the old 'orders' channel is removed on setup).
const ORDER_CHANNEL = 'orders_v2';
const INFO_CHANNEL = 'messages';
const ORDER_SOUND = 'order_alert.wav';

/** Ask once for notification permission and set up the loud "new order" channel. */
export async function setupNativeNotifications(): Promise<void> {
  const ln = cap()?.Plugins?.LocalNotifications;
  if (!ln) return;
  try {
    const st = await ln.checkPermissions();
    if (st?.display !== 'granted') await ln.requestPermissions();
    try {
      await ln.deleteChannel({ id: 'orders' });
    } catch {
      /* never existed */
    }
    await ln.createChannel({
      id: ORDER_CHANNEL,
      name: 'Yangi buyurtmalar',
      description: 'Yangi buyurtma kelganda alohida ovoz bilan xabar beradi',
      importance: 5, // IMPORTANCE_HIGH → heads-up + sound
      visibility: 1,
      sound: ORDER_SOUND,
      vibration: true,
      lights: true,
      lightColor: '#3b9bff',
    });
    await ln.createChannel({
      id: INFO_CHANNEL,
      name: 'Xabarlar',
      description: 'Mijoz xabarlari, bonus so‘rovlari va e’lonlar',
      importance: 4, // IMPORTANCE_DEFAULT-ish: sound, no loud chime
      visibility: 1,
      vibration: true,
    });
  } catch {
    /* permission denied — the in-app modal/beep still works */
  }
}

/**
 * System notification (Android only). `kind: 'order'` uses the loud order
 * chime channel; `'info'` the softer default-sound channel. Resolves true when
 * the notification was scheduled, so callers can fall back to an in-app sound.
 */
export async function nativeNotify(
  title: string,
  body: string,
  id: number = Date.now() % 2147483647,
  kind: 'order' | 'info' = 'order',
): Promise<boolean> {
  const ln = cap()?.Plugins?.LocalNotifications;
  if (!ln) return false;
  try {
    await ln.schedule({
      notifications: [
        {
          id,
          title,
          body,
          channelId: kind === 'order' ? ORDER_CHANNEL : INFO_CHANNEL,
          ...(kind === 'order' ? { sound: ORDER_SOUND } : {}),
          smallIcon: 'ic_stat_notify',
          iconColor: '#3b9bff',
          ongoing: false,
          autoCancel: true,
        },
      ],
    });
    return true;
  } catch {
    return false;
  }
}

// ---- background "online" service (APK ≥ 1.0.5) ------------------------------
// Keeps receiving orders and rings the 15 s alarm while the driver is online,
// even when the app is closed. Absent in the browser and in older APKs.

function driverPlugin(): any {
  return cap()?.Plugins?.MoviyDriver ?? null;
}

export function hasDriverService(): boolean {
  return isNativeApp() && !!driverPlugin();
}

/** Driver went online: start (or refresh) the background service. */
export async function driverServiceStart(token: string, apiBase: string): Promise<boolean> {
  const p = driverPlugin();
  if (!p) return false;
  try {
    const r = await p.start({ token, apiBase });
    return !!r?.running;
  } catch {
    return false;
  }
}

/** Driver went offline / logged out: stop the background service. */
export async function driverServiceStop(): Promise<void> {
  try {
    await driverPlugin()?.stop();
  } catch {
    /* not running */
  }
}

export async function driverServiceRunning(): Promise<boolean> {
  try {
    const r = await driverPlugin()?.status();
    return !!r?.running;
  } catch {
    return false;
  }
}

/** Silence the service's alarm (accepted / declined in the app). */
export async function driverServiceStopAlarm(orderId?: string): Promise<void> {
  try {
    await driverPlugin()?.stopAlarm({ orderId });
  } catch {
    /* not running */
  }
}

/** Ids of the repeating order alarm (one notification per ring). */
const ORDER_ALARM_BASE = 777000;
const ORDER_ALARM_MAX = 30;

/**
 * Loud repeating order alarm for the APK: a heads-up notification on the
 * loud order channel every `everySec` seconds for `seconds` seconds, via
 * AlarmManager — so the phone keeps ringing with the screen off or the app in
 * the background. Each ring is its own notification (a pending notification
 * with a reused id would overwrite the earlier one); all are removed by
 * stopNativeOrderAlarm(). Resolves true if scheduled.
 */
export async function nativeOrderAlarm(
  title: string,
  body: string,
  seconds: number,
  everySec = 3,
): Promise<boolean> {
  const ln = cap()?.Plugins?.LocalNotifications;
  if (!ln) return false;
  try {
    const now = Date.now();
    const notifications = [];
    let i = 0;
    for (let t = 0; t < seconds && i < ORDER_ALARM_MAX; t += everySec, i++) {
      notifications.push({
        id: ORDER_ALARM_BASE + i,
        title,
        body,
        channelId: ORDER_CHANNEL,
        sound: ORDER_SOUND,
        smallIcon: 'ic_stat_notify',
        iconColor: '#3b9bff',
        autoCancel: true,
        group: 'order-alarm',
        ...(t > 0 ? { schedule: { at: new Date(now + t * 1000), allowWhileIdle: true } } : {}),
      });
    }
    await ln.schedule({ notifications });
    return true;
  } catch {
    return false;
  }
}

/** Stop the repeating order alarm (accepted, declined, taken or expired). */
export async function stopNativeOrderAlarm(): Promise<void> {
  const ln = cap()?.Plugins?.LocalNotifications;
  if (!ln) return;
  const ids = Array.from({ length: ORDER_ALARM_MAX }, (_, k) => ({ id: ORDER_ALARM_BASE + k }));
  try {
    await ln.cancel({ notifications: ids });
  } catch {
    /* nothing pending */
  }
  try {
    await ln.removeDeliveredNotifications?.({ notifications: ids });
  } catch {
    /* nothing shown */
  }
}

/**
 * Background-capable GPS watcher (foreground service with a persistent
 * notification), so the ride distance keeps accumulating when the driver
 * switches apps or locks the screen. Resolves to a stop function.
 */
export async function startNativeLocation(
  onFix: (loc: NativeLocation) => void,
  onError: (code: 'denied' | 'unavailable') => void,
): Promise<() => void> {
  const bg = cap()?.Plugins?.BackgroundGeolocation;
  if (!bg) return () => {};
  try {
    const id: string = await bg.addWatcher(
      {
        backgroundMessage: 'Safar masofasi GPS orqali hisoblanmoqda',
        backgroundTitle: 'Moviy Taxi — onlayn',
        requestPermissions: true,
        stale: false,
        distanceFilter: 5,
      },
      (location: NativeLocation | undefined, error: any) => {
        if (error) {
          onError(error.code === 'NOT_AUTHORIZED' ? 'denied' : 'unavailable');
          return;
        }
        if (location) onFix(location);
      },
    );
    return () => {
      bg.removeWatcher({ id }).catch(() => undefined);
    };
  } catch {
    onError('unavailable');
    return () => {};
  }
}

export function openNativeLocationSettings(): void {
  cap()?.Plugins?.BackgroundGeolocation?.openSettings?.();
}

// ---- app version (admin sees which phones run an outdated APK) --------------

export interface AppVersionInfo {
  /** '1.0.6' (APK ≥ 1.0.6 reports itself), '1.0.5', '≤1.0.4', 'web', 'unknown'. */
  version: string;
  platform: 'android' | 'web';
}

/** Does the installed APK's MoviyDriver plugin implement `info()` (APK ≥ 1.0.6)? */
function pluginHasInfo(): 'yes' | 'no' | 'maybe' {
  const p = driverPlugin();
  if (!p || typeof p.info !== 'function') return 'no';
  // Native plugin headers list the methods the installed APK really has
  // (a JS proxy would answer "function" for any name).
  const headers = (cap() as any)?.PluginHeaders;
  if (Array.isArray(headers)) {
    const h = headers.find((x: any) => x?.name === 'MoviyDriver');
    if (h && Array.isArray(h.methods)) {
      return h.methods.some((m: any) => m?.name === 'info') ? 'yes' : 'no';
    }
  }
  return 'maybe';
}

/**
 * The installed app version: APK ≥ 1.0.6 tells it (`MoviyDriver.info()`),
 * 1.0.5 is the first with the background service, older APKs have neither;
 * the browser PWA is 'web'.
 */
export async function detectAppVersion(): Promise<AppVersionInfo> {
  if (!isNativeApp()) return { version: 'web', platform: 'web' };
  const has = pluginHasInfo();
  if (has !== 'no') {
    try {
      const r: any = await Promise.race([
        driverPlugin().info(),
        new Promise((resolve) => setTimeout(() => resolve(null), 3000)),
      ]);
      if (r?.version) return { version: String(r.version), platform: 'android' };
    } catch {
      /* not implemented in this APK */
    }
    if (has === 'yes') return { version: 'unknown', platform: 'android' };
  }
  if (hasDriverService()) return { version: '1.0.5', platform: 'android' };
  return { version: '≤1.0.4', platform: 'android' };
}

/** -1 / 0 / 1 for dotted versions ('≤1.0.4' counts as 1.0.4); null if not comparable. */
export function compareVersions(a: string, b: string): number | null {
  const parse = (v: string) => {
    const m = String(v ?? '').match(/\d+(?:\.\d+)*/);
    return m ? m[0].split('.').map(Number) : null;
  };
  const x = parse(a);
  const y = parse(b);
  if (!x || !y) return null;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

// ---- first-start permissions (shown before the phone/password form) ---------

export type PermKind = 'location' | 'backgroundLocation' | 'notifications' | 'battery';
/** true granted · false missing · null this APK cannot tell (older build). */
export type PermState = Record<PermKind, boolean | null>;

const GEO_OK_KEY = 'moviy-geo-ok';

/** Does the installed APK's MoviyDriver plugin really have this method? */
function pluginHas(method: string): boolean {
  const p = driverPlugin();
  if (!p || typeof p[method] !== 'function') return false;
  const headers = (cap() as any)?.PluginHeaders;
  if (!Array.isArray(headers)) return false;
  const h = headers.find((x: any) => x?.name === 'MoviyDriver');
  return !!h && Array.isArray(h.methods) && h.methods.some((m: any) => m?.name === method);
}

export async function permissionState(): Promise<PermState> {
  if (!isNativeApp()) return { location: true, backgroundLocation: true, notifications: true, battery: true };
  if (pluginHas('permissionState')) {
    try {
      const r = await driverPlugin().permissionState();
      return {
        location: !!r?.location,
        backgroundLocation: !!r?.backgroundLocation,
        notifications: !!r?.notifications,
        battery: !!r?.battery,
      };
    } catch {
      /* fall through to the older-APK checks */
    }
  }
  // APK ≤ 1.0.6: location through the WebView, notifications through the plugin.
  let notifications: boolean | null = null;
  try {
    const st = await cap()?.Plugins?.LocalNotifications?.checkPermissions();
    if (st?.display) notifications = st.display === 'granted';
  } catch {
    /* unknown */
  }
  let geoOk = false;
  try {
    geoOk = localStorage.getItem(GEO_OK_KEY) === '1';
  } catch {
    /* storage blocked */
  }
  return { location: geoOk, backgroundLocation: null, notifications, battery: null };
}

export async function askPermission(kind: PermKind): Promise<PermState> {
  if (pluginHas('askPermission')) {
    try {
      await driverPlugin().askPermission({ kind });
    } catch {
      /* denied — the screen shows the settings button */
    }
    return permissionState();
  }
  if (kind === 'location' && typeof navigator !== 'undefined' && navigator.geolocation) {
    const ok = await new Promise<boolean>((resolve) =>
      navigator.geolocation.getCurrentPosition(
        () => resolve(true),
        (e) => resolve(e.code !== e.PERMISSION_DENIED),
        { timeout: 15000, maximumAge: 600000 },
      ),
    );
    try {
      localStorage.setItem(GEO_OK_KEY, ok ? '1' : '0');
    } catch {
      /* storage blocked */
    }
  }
  if (kind === 'notifications') {
    try {
      await cap()?.Plugins?.LocalNotifications?.requestPermissions();
    } catch {
      /* denied */
    }
  }
  return permissionState();
}

/** The app's page in Android settings (for a permission denied for good). */
export function openAppSettings(): void {
  if (pluginHas('openAppSettings')) {
    driverPlugin()
      .openAppSettings()
      .catch(() => undefined);
    return;
  }
  openNativeLocationSettings();
}
