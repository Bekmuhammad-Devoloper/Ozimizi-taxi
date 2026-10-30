'use client';
import { useCallback, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useOrderStore, type OrderModel } from '@/stores/order';
import { liveWaitSec, noteServerTime, serverNow, type DriverTariff } from '@/lib/meter';

const TARIFF_KEY = 'moviy-driver-tariff';

function readCachedTariff(): DriverTariff | null {
  try {
    const raw = localStorage.getItem(TARIFF_KEY);
    return raw ? (JSON.parse(raw) as DriverTariff) : null;
  } catch {
    return null;
  }
}

/**
 * Current tariff (GET /driver/tariff). The last one is kept in localStorage
 * so a running meter still shows the fare after a restart without network.
 */
export function useTariff(): DriverTariff | null {
  const [tariff, setTariff] = useState<DriverTariff | null>(null);
  useEffect(() => {
    const cached = readCachedTariff();
    if (cached) setTariff(cached);
    api
      .get<DriverTariff>('/driver/tariff')
      .then((r) => {
        if (!r.data) return;
        setTariff(r.data);
        try {
          localStorage.setItem(TARIFF_KEY, JSON.stringify(r.data));
        } catch {
          /* storage full / blocked */
        }
      })
      .catch(() => {});
  }, []);
  return tariff;
}

/** Re-render every `ms` (live timers). */
export function useTicker(ms = 1000): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setN((x) => x + 1), ms);
    return () => clearInterval(t);
  }, [ms]);
  return n;
}

/** Fields of a server order the app keeps in the store. */
export function orderFields(d: any): Partial<OrderModel> {
  if (!d || typeof d !== 'object') return {};
  const out: Partial<OrderModel> = {};
  const keys: (keyof OrderModel)[] = [
    'status',
    'pickupLat',
    'pickupLng',
    'pickupAddress',
    'destinationAddress',
    'destinationLat',
    'destinationLng',
    'distanceKm',
    'price',
    'commission',
    'discount',
    'bonusUsed',
    'arrivedAt',
    'startedAt',
    'waitingMinutes',
    'waitingFee',
    'waitingSeconds',
    'waitStartedAt',
    'waitTickAt',
    'cancelPenalty',
    'source',
    'createdAt',
  ];
  for (const k of keys) {
    if (k in d) (out as any)[k] = d[k];
  }
  return out;
}

function pick(f: Partial<OrderModel>, keys: (keyof OrderModel)[]): Partial<OrderModel> {
  const out: Partial<OrderModel> = {};
  for (const k of keys) if (k in f) (out as any)[k] = f[k];
  return out;
}

// Accidental double taps closer than this are ignored even after the first
// request already finished.
const WAIT_TAP_GUARD_MS = 700;
let lastWaitTap = 0;
// Bumped on every accepted tap, so a slower server read started before the
// tap never overwrites it (see syncActiveOrder).
let waitToggleSeq = 0;

/**
 * Re-read the active order from the server (screen opened, app restarted)
 * and merge it into the latest store state. Status and waiting fields are
 * taken only if nothing changed here while the request was in flight; an
 * order that ended on the server (admin cancel) is always taken. Resolves to
 * the server order (with `client`), or null.
 */
export async function syncActiveOrder(id: string): Promise<any | null> {
  const seq = waitToggleSeq;
  const before = useOrderStore.getState().active;
  const statusBefore = before?.id === id ? before.status : null;
  try {
    const { data } = await api.get(`/driver/orders/${id}`);
    if (!data || data.id !== id) return null;
    const st = useOrderStore.getState();
    st.patchActive(id, (cur) => {
      const f = orderFields(data);
      if ((data.status === 'COMPLETED' || data.status === 'CANCELLED') && cur.status !== data.status) {
        return { ...f, waitStartedAt: null };
      }
      const out = pick(f, [
        'pickupAddress',
        'destinationAddress',
        'destinationLat',
        'destinationLng',
        'source',
      ]);
      const quiet = seq === waitToggleSeq && !st.waitPending && cur.status === statusBefore;
      if (quiet && cur.status !== 'COMPLETED' && cur.status !== 'CANCELLED') {
        Object.assign(
          out,
          pick(f, ['status', 'arrivedAt', 'startedAt', 'waitingSeconds', 'waitStartedAt', 'waitTickAt']),
        );
      }
      return out;
    });
    return data;
  } catch {
    return null;
  }
}

/**
 * "Kutish" / "Davom etish" (mid-ride pause) that always does what the driver
 * sees: the wanted state is read from the store at tap time, the screen
 * switches immediately (optimistic), taps are ignored while the request is in
 * flight, and the server answer is merged into the latest store state. On an
 * error the waiting fields are restored and the server state re-read.
 */
export function useWaitToggle(onError: (msg: string | null) => void) {
  return useCallback(async () => {
    const st = useOrderStore.getState();
    const cur = st.active;
    if (!cur || cur.status !== 'IN_PROGRESS' || st.waitPending) return;
    const tapAt = Date.now();
    if (tapAt - lastWaitTap < WAIT_TAP_GUARD_MS) return;
    lastWaitTap = tapAt;
    waitToggleSeq++;

    const id = cur.id;
    const on = !cur.waitStartedAt;
    const before: Partial<OrderModel> = {
      waitStartedAt: cur.waitStartedAt ?? null,
      waitTickAt: cur.waitTickAt ?? null,
      waitingSeconds: cur.waitingSeconds ?? 0,
      waitMoving: cur.waitMoving ?? false,
    };
    const nowMs = serverNow();
    const nowIso = new Date(nowMs).toISOString();

    st.setWaitPending(true);
    onError(null);
    // Optimistic: the timer starts / freezes on the tap itself.
    st.patchActive(id, (o) =>
      on
        ? { waitStartedAt: nowIso, waitTickAt: nowIso, waitMoving: false }
        : {
            waitingSeconds: Math.round(liveWaitSec(o, nowMs)),
            waitStartedAt: null,
            waitTickAt: null,
            waitMoving: false,
          },
    );
    try {
      const { data } = await api.post(`/driver/orders/${id}/wait/${on ? 'start' : 'stop'}`);
      if (on) noteServerTime(data?.waitStartedAt);
      // Only onto a ride that is still running here ("Safarni tugatish" may
      // have finished it while this request was in flight).
      useOrderStore
        .getState()
        .patchActive(id, (o) =>
          o.status === 'IN_PROGRESS' ? { ...orderFields(data), waitMoving: false } : {},
        );
    } catch (e: any) {
      useOrderStore.getState().patchActive(id, (o) => (o.status === 'IN_PROGRESS' ? before : {}));
      const msg = e?.response?.data?.message;
      onError(
        Array.isArray(msg)
          ? msg.join(', ')
          : msg ?? (on ? 'Kutishni yoqib bo‘lmadi' : 'Kutishni to‘xtatib bo‘lmadi'),
      );
      // The request may still have reached the server — take its state.
      try {
        const { data: fresh } = await api.get(`/driver/orders/${id}`);
        if (fresh?.id === id) {
          useOrderStore
            .getState()
            .patchActive(id, (o) => (o.status === 'IN_PROGRESS' ? orderFields(fresh) : {}));
          if (fresh.status === 'IN_PROGRESS' && !!fresh.waitStartedAt === on) onError(null);
        }
      } catch {
        /* offline: keep the restored state */
      }
    } finally {
      useOrderStore.getState().setWaitPending(false);
    }
  }, [onError]);
}

/**
 * The taximeter screen was shown in this app session. The dashboard sends a
 * driver with a running street ride to /taximeter once after the app starts
 * (e.g. Android killed it mid-ride), never again after that.
 */
export const meterSession = { shown: false };
