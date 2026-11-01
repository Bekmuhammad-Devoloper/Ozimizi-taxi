'use client';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore, IncomingOrder, OrderStatus } from '@/stores/order';
import {
  DeliveryStatus,
  isDeliveryLive,
  syncActiveDelivery,
  useDeliveryStore,
} from '@/stores/delivery';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { api } from '@/lib/api';
import { haversineKm } from '@/lib/haversine';
import { isWaitCounting, noteServerTime } from '@/lib/meter';
import { useAppUpdateStore } from '@/stores/appUpdate';
import {
  driverServiceRunning,
  driverServiceStopAlarm,
  hasDriverService,
  isNativeApp,
  nativeNotify,
  nativeOrderAlarm,
  startNativeLocation,
  stopNativeOrderAlarm,
} from '@/lib/native';

// ---- "new order" chime -----------------------------------------------------
// The same bell arpeggio the APK plays for its notification
// (public/sounds/order-alert.wav); decoded once through Web Audio so it plays
// even when the tab is in the background. If the asset can't be loaded the
// melody is synthesized with oscillators instead.
const ORDER_SOUND_URL = '/sounds/order-alert.wav';
let audioCtx: AudioContext | null = null;
let orderBuffer: AudioBuffer | null = null;
let orderBufferPromise: Promise<AudioBuffer | null> | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return null;
    if (!audioCtx) audioCtx = new Ctx();
    if (audioCtx && audioCtx.state === 'suspended') void audioCtx.resume();
    return audioCtx;
  } catch {
    return null;
  }
}

/** Fetch + decode the chime once (call early so the first order is instant). */
export function preloadOrderSound(): Promise<AudioBuffer | null> {
  const ctx = getAudioCtx();
  if (!ctx) return Promise.resolve(null);
  if (orderBuffer) return Promise.resolve(orderBuffer);
  if (!orderBufferPromise) {
    orderBufferPromise = fetch(ORDER_SOUND_URL, { cache: 'force-cache' })
      .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
      .then((ab) => ctx.decodeAudioData(ab))
      .then((buf) => {
        orderBuffer = buf;
        return buf;
      })
      .catch(() => {
        orderBufferPromise = null;
        return null;
      });
  }
  return orderBufferPromise;
}

/** Oscillator version of the same E-major bell arpeggio (fallback). */
function synthOrderChime(ctx: AudioContext) {
  const bell = (freq: number, start: number, decay: number, amp: number) => {
    const t0 = ctx.currentTime + start;
    const partials: [number, number][] = [[1, 1], [2, 0.4], [3, 0.18], [4, 0.08]];
    for (const [mul, a] of partials) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq * mul;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, t0);
      gain.gain.linearRampToValueAtTime(amp * a * 0.4, t0 + 0.005);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + decay * 3);
      osc.start(t0);
      osc.stop(t0 + decay * 3 + 0.05);
    }
  };
  const phrase = (t: number) => {
    bell(659.26, t, 0.5, 0.55);
    bell(830.61, t + 0.13, 0.5, 0.55);
    bell(987.77, t + 0.26, 0.55, 0.55);
    bell(1318.51, t + 0.39, 0.7, 0.6);
  };
  phrase(0);
  phrase(0.95);
  bell(987.77, 1.9, 0.9, 0.45);
  bell(1318.51, 1.9, 1.0, 0.5);
}

/** Play the "new order" chime (in-app; the APK's notification has its own). */
export function playOrderSound() {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const play = (buf: AudioBuffer) => {
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.connect(ctx.destination);
    src.start();
  };
  try {
    if (orderBuffer) {
      play(orderBuffer);
      return;
    }
    void preloadOrderSound().then((buf) => (buf ? play(buf) : synthOrderChime(ctx)));
  } catch {
    try {
      synthOrderChime(ctx);
    } catch {
      /* no-op */
    }
  }
}

// ---- 15-second order alarm ---------------------------------------------------
// APK: a heads-up notification on the loud channel every 3 s (rings with the
// screen off). Browser: the chime replayed every ~2.6 s. Both vibrate.
let alarmTimer: number | null = null;
let alarmStop: number | null = null;
let alarmOrderId: string | null = null;

export function startOrderAlarm(orderId: string, seconds: number, title: string, body: string) {
  stopOrderAlarm();
  alarmOrderId = orderId;
  // Admin timeline: this phone is ringing (deduplicated on the server).
  void api.post(`/driver/orders/${orderId}/ring`, { via: 'app' }).catch(() => undefined);
  // APK ≥ 1.0.5: the background service is the one that rings (loud alarm
  // stream + vibration), in the foreground too — don't ring twice.
  if (hasDriverService()) {
    alarmStop = window.setTimeout(() => stopOrderAlarm(orderId), seconds * 1000);
    return;
  }
  const vibrate = () => {
    try {
      navigator.vibrate?.([700, 300, 700, 300, 700]);
    } catch {
      /* no-op */
    }
  };
  vibrate();
  void nativeOrderAlarm(title, body, seconds).then((native) => {
    if (alarmOrderId !== orderId) return;
    if (!native) playOrderSound();
    alarmTimer = window.setInterval(() => {
      vibrate();
      if (!native) playOrderSound();
    }, native ? 3000 : 2600);
  });
  alarmStop = window.setTimeout(() => stopOrderAlarm(orderId), seconds * 1000);
}

/** Stop the alarm (optionally only if it belongs to this order). */
export function stopOrderAlarm(orderId?: string) {
  if (orderId && alarmOrderId && orderId !== alarmOrderId) return;
  if (alarmTimer) window.clearInterval(alarmTimer);
  if (alarmStop) window.clearTimeout(alarmStop);
  alarmTimer = null;
  alarmStop = null;
  alarmOrderId = null;
  try {
    navigator.vibrate?.(0);
  } catch {
    /* no-op */
  }
  void stopNativeOrderAlarm();
  void driverServiceStopAlarm(orderId);
}

/** Extra fields of a food-delivery offer (empty for taxi offers). */
function deliveryOfferFields(p: any): Partial<IncomingOrder> {
  if (p?.kind !== 'delivery') return {};
  const num = (v: unknown) => (v == null || v === '' ? null : Number(v));
  return {
    kind: 'delivery',
    number: num(p.number),
    kitchenName: p.kitchenName ?? null,
    itemsCount: num(p.itemsCount),
    total: num(p.total),
    prepMinutes: num(p.prepMinutes),
    readyAt: p.readyAt ?? null,
  };
}

// Latest GPS fix from the watcher below (any source), for screens that need
// "where am I now" without starting their own watcher (taximeter start).
let lastKnownFix: { lat: number; lng: number; at: number } | null = null;

/** Last GPS fix seen by the app, if it is not older than `maxAgeMs`. */
export function getLastKnownPosition(maxAgeMs = 120_000): { lat: number; lng: number } | null {
  if (!lastKnownFix || Date.now() - lastKnownFix.at > maxAgeMs) return null;
  return { lat: lastKnownFix.lat, lng: lastKnownFix.lng };
}

/** Busy with a taxi ride or a food delivery — offers must not ring over it. */
function hasActiveJob(): boolean {
  const active = useOrderStore.getState().active;
  if (active && !['COMPLETED', 'CANCELLED'].includes(active.status)) return true;
  return isDeliveryLive(useDeliveryStore.getState().active);
}

/**
 * The offer that is ringing for me right now (e.g. the app was opened from
 * the alarm notification after being closed) → show the accept dialog with
 * the time that is left.
 */
export async function loadCurrentOffer(): Promise<void> {
  try {
    const { data } = await api.get('/driver/offers/current');
    if (!data?.orderId) return;
    const st = useOrderStore.getState();
    if (st.incoming?.orderId === data.orderId) return;
    if (hasActiveJob()) return;
    const total = Number(data.offerSeconds) > 0 ? Number(data.offerSeconds) : 15;
    const left = Math.max(1, Number(data.remainingSeconds) || total);
    st.setIncoming({
      orderId: data.orderId,
      pickup: data.pickup,
      destination: data.destination ?? null,
      estimatedKm: data.estimatedKm ?? null,
      estimatedPrice: data.estimatedPrice ?? null,
      distanceFromDriver: data.distanceFromDriver,
      receivedAt: Date.now() - (total - left) * 1000,
      mode: data.mode === 'all' ? 'all' : 'personal',
      offerSeconds: total,
      ...deliveryOfferFields(data),
    });
  } catch {
    /* offline — the socket will deliver it */
  }
}

interface Options {
  enabled: boolean;
}

export function useDriverSocket({ enabled }: Options) {
  const token = useAuthStore((s) => s.token);
  const setIncoming = useOrderStore((s) => s.setIncoming);
  const setActive = useOrderStore((s) => s.setActive);
  const setBonusRequest = useOrderStore((s) => s.setBonusRequest);
  const setGpsStatus = useOrderStore((s) => s.setGpsStatus);
  const addToDistance = useOrderStore((s) => s.addToDistance);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  // Last point that was added to the ride distance (see watchPosition).
  const lastCounted = useRef<{ lat: number; lng: number } | null>(null);
  // Ride the lastCounted point belongs to (a new ride starts from scratch).
  const countedFor = useRef<string | null>(null);
  const intervalRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);
  // Stop function of the native (background) GPS watcher, in the APK.
  const nativeStopRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      disconnectSocket();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchIdRef.current != null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      nativeStopRef.current?.();
      nativeStopRef.current = null;
      return;
    }

    void preloadOrderSound();
    const socket = getSocket(token);

    socket.on('new_order', (payload: any) => {
      const inc: IncomingOrder = {
        orderId: payload.orderId,
        pickup: payload.pickup,
        destination: payload.destination ?? null,
        estimatedKm: payload.estimatedKm ?? null,
        estimatedPrice: payload.estimatedPrice ?? null,
        distanceFromDriver: payload.distanceFromDriver,
        receivedAt: Date.now(),
        mode: payload.mode === 'all' ? 'all' : 'personal',
        offerSeconds: Number(payload.offerSeconds) > 0 ? Number(payload.offerSeconds) : 15,
        ...deliveryOfferFields(payload),
      };
      // Busy with a ride or a delivery — don't ring over it (it stays in "Mavjud").
      if (hasActiveJob()) return;
      setIncoming(inc);
      if (inc.kind === 'delivery') {
        startOrderAlarm(
          inc.orderId,
          inc.offerSeconds ?? 15,
          '🍽 Yetkazish buyurtmasi!',
          `${inc.kitchenName ?? 'Oshxona'} — ${Number(inc.distanceFromDriver).toFixed(1)} km uzoqlikda — ${inc.offerSeconds} soniya ichida qabul qiling`,
        );
        return;
      }
      startOrderAlarm(
        inc.orderId,
        inc.offerSeconds ?? 15,
        inc.mode === 'all' ? '🚕 Buyurtma hammaga — tez oling!' : '🚕 Yangi buyurtma sizga!',
        `${Number(inc.distanceFromDriver).toFixed(1)} km uzoqlikda — ${inc.offerSeconds} soniya ichida qabul qiling`,
      );
    });

    // Food delivery changed on the server: kitchen marked it ready, or it
    // was cancelled. The /delivery/active page re-reads it on this event.
    socket.on('delivery_update', (u: any) => {
      const st = useDeliveryStore.getState();
      const cur = st.active;
      const status = u?.status as DeliveryStatus | undefined;
      const vibrate = () => {
        try {
          navigator.vibrate?.([200, 100, 200]);
        } catch {
          /* no-op */
        }
      };
      if (cur && status && cur.id === u?.orderId) {
        if (status === 'READY' && cur.status === 'COOKING') {
          vibrate();
          st.setActive({ ...cur, status, readyAt: cur.readyAt ?? new Date().toISOString() });
          void nativeNotify(
            '🍽 Buyurtma tayyor',
            `#${cur.number} — ${cur.kitchen?.name ?? 'Oshxona'}: buyurtmani olib keting`,
            undefined,
            'info',
          );
        } else if (status === 'CANCELLED' && cur.status !== 'CANCELLED') {
          vibrate();
          st.setActive({ ...cur, status, cancelledAt: new Date().toISOString() });
          void nativeNotify(
            '❌ Yetkazish bekor qilindi',
            `#${cur.number} buyurtma bekor qilindi`,
            undefined,
            'info',
          );
        }
      }
      window.dispatchEvent(new CustomEvent('delivery-update', { detail: u }));
    });

    // Personal offer ran out without an answer — it went to the next driver.
    socket.on('order_offer_expired', ({ orderId }: { orderId: string }) => {
      stopOrderAlarm(orderId);
      const inc = useOrderStore.getState().incoming;
      if (inc?.orderId === orderId) setIncoming(null);
    });

    // Passenger asks to pay from bonus — show the confirm dialog.
    socket.on('bonus_request', (payload: any) => {
      setBonusRequest(payload);
      void nativeNotify(
        '💰 Bonusdan to‘lov so‘rovi',
        `${payload?.clientName ?? 'Mijoz'}: ${Number(payload?.amount ?? 0).toLocaleString('uz')} so‘m — tasdiqlang`,
        undefined,
        'info',
      );
      try {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
      } catch {
        /* no-op */
      }
    });
    // Requests that arrived while the app was closed.
    api
      .get('/driver/bonus/pending')
      .then((r) => {
        if (Array.isArray(r.data) && r.data.length) setBonusRequest(r.data[0]);
      })
      .catch(() => {});

    // Passenger wrote from the bot.
    socket.on('order_message', (m: any) => {
      window.dispatchEvent(new CustomEvent('order-message', { detail: m }));
      void nativeNotify('💬 Mijozdan xabar', String(m?.text ?? '').slice(0, 120), undefined, 'info');
    });
    // Admin broadcast. `kind: 'update'` = a new app version — shown as a
    // dialog with an "Yangilash" button (components/AppUpdate).
    // Taken off the line by the server (the phone kept missing offers).
    socket.on('driver_offline', () => {
      const st = useAuthStore.getState();
      if (st.driver) st.setDriver({ ...st.driver, isOnline: false });
    });

    socket.on('announcement', (a: any) => {
      if (a?.kind === 'update') {
        useAppUpdateStore.getState().showAnnouncement({
          title: a.title ?? null,
          text: a.text ?? null,
          url: a.url ?? null,
          version: a.version ?? null,
        });
      }
      window.dispatchEvent(new CustomEvent('announcement', { detail: a }));
      void nativeNotify(`📢 ${a?.title ?? 'Xabar'}`, String(a?.text ?? '').slice(0, 160), undefined, 'info');
    });

    socket.on('order_taken', ({ orderId }: { orderId: string }) => {
      stopOrderAlarm(orderId);
      const inc = useOrderStore.getState().incoming;
      if (inc?.orderId === orderId) setIncoming(null);
    });

    // Waiting meter tick from the server (counts only while standing still).
    // Merged into the store state as it is *now*. Skipped while a
    // "Kutish"/"Davom etish" request is in flight (its answer is newer) and
    // when the wait is not running here (a tick that crossed a stop).
    socket.on('wait_tick', (t: any) => {
      noteServerTime(t?.waitTickAt);
      const st = useOrderStore.getState();
      if (st.waitPending || !t?.orderId) return;
      st.patchActive(t.orderId, (cur) =>
        isWaitCounting(cur)
          ? {
              waitingSeconds: Number(t.waitingSeconds ?? cur.waitingSeconds ?? 0),
              waitTickAt: t.waitTickAt ?? cur.waitTickAt ?? null,
              waitMoving: !!t.moving,
            }
          : {},
      );
    });

    socket.on('order_cancelled', ({ orderId }: { orderId: string }) => {
      useOrderStore
        .getState()
        .patchActive(orderId, { status: 'CANCELLED' as OrderStatus, waitStartedAt: null });
    });

    // GPS tracking — one handler for both sources.
    const onFix = (latitude: number, longitude: number, accuracy?: number | null) => {
          // A fix worse than 60 m would add phantom distance.
          if (accuracy != null && accuracy > 60) return;
          lastKnownFix = { lat: latitude, lng: longitude, at: Date.now() };
          const active = useOrderStore.getState().active;
          if (active?.status === 'IN_PROGRESS') {
            // Measure from the last *counted* point, not the previous fix:
            // at city speed fixes arrive every ~1 s a few metres apart, and
            // dropping each one as jitter used to under-count the ride.
            if (countedFor.current !== active.id) {
              countedFor.current = active.id;
              lastCounted.current = null;
            }
            if (!lastCounted.current) {
              lastCounted.current = { lat: latitude, lng: longitude };
            }
            const delta = haversineKm(
              lastCounted.current.lat,
              lastCounted.current.lng,
              latitude,
              longitude,
            );
            if (delta >= 0.01 && delta <= 1.5) {
              addToDistance(delta);
              lastCounted.current = { lat: latitude, lng: longitude };
            }
          } else {
            lastCounted.current = null;
          }
          const first = !lastPos.current;
          lastPos.current = { lat: latitude, lng: longitude };
          setGpsStatus('ok');
          // Don't wait for the 10s timer on the first fix — until the
          // server knows where we are, no orders are broadcast to us.
          if (first) socket.emit('location_update', lastPos.current);
    };

    const startBrowserGps = () => {
      if (!('geolocation' in navigator)) {
        setGpsStatus('unavailable');
        return;
      }
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        (err) => {
          setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    };
    if (isNativeApp()) {
      // APK ≥ 1.0.5 with the online service running: the service already
      // sends GPS in the background (one persistent notification only), so
      // the app just watches GPS while it is open. Otherwise (older APK, or
      // the service could not start) use the plugin's own foreground service.
      void (async () => {
        if (hasDriverService()) {
          for (let i = 0; i < 6 && !(await driverServiceRunning()); i++) {
            await new Promise((r) => setTimeout(r, 500));
          }
          if (await driverServiceRunning()) {
            startBrowserGps();
            return;
          }
        }
        nativeStopRef.current = await startNativeLocation(
          (loc) => onFix(loc.latitude, loc.longitude, loc.accuracy),
          (code) => setGpsStatus(code),
        );
      })();
    } else if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => onFix(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy),
        (err) => {
          setGpsStatus(err.code === err.PERMISSION_DENIED ? 'denied' : 'unavailable');
        },
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    } else {
      setGpsStatus('unavailable');
    }

    // After a reconnect, re-send the last known position right away, and
    // pick up an offer that started ringing while we were away.
    socket.on('connect', () => {
      if (lastPos.current) socket.emit('location_update', lastPos.current);
      void loadCurrentOffer();
      // A delivery_update may have been missed while disconnected.
      if (useDeliveryStore.getState().active) void syncActiveDelivery();
    });
    const onVisible = () => {
      if (document.visibilityState === 'visible') void loadCurrentOffer();
    };
    document.addEventListener('visibilitychange', onVisible);
    void loadCurrentOffer();

    intervalRef.current = window.setInterval(() => {
      if (lastPos.current) {
        socket.emit('location_update', lastPos.current);
      }
    }, 10000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchIdRef.current != null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      nativeStopRef.current?.();
      nativeStopRef.current = null;
      socket.off('new_order');
      socket.off('order_offer_expired');
      stopOrderAlarm();
      socket.off('order_taken');
      socket.off('bonus_request');
      socket.off('order_message');
      socket.off('announcement');
      socket.off('driver_offline');
      socket.off('connect');
      socket.off('order_cancelled');
      socket.off('wait_tick');
      socket.off('delivery_update');
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, token, setIncoming, setActive, addToDistance, setBonusRequest, setGpsStatus]);
}
