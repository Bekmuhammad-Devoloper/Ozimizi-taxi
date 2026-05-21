'use client';
import { useEffect, useRef } from 'react';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore, IncomingOrder, OrderStatus } from '@/stores/order';
import { disconnectSocket, getSocket } from '@/lib/socket';
import { haversineKm } from '@/lib/haversine';

/** Generate a 2-tone beep using Web Audio API — no asset required. */
function playOrderBeep() {
  try {
    const Ctx =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const tone = (freq: number, start: number, dur: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      osc.connect(gain);
      gain.connect(ctx.destination);
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + start);
      gain.gain.exponentialRampToValueAtTime(
        0.35,
        ctx.currentTime + start + 0.02,
      );
      gain.gain.exponentialRampToValueAtTime(
        0.0001,
        ctx.currentTime + start + dur,
      );
      osc.start(ctx.currentTime + start);
      osc.stop(ctx.currentTime + start + dur + 0.05);
    };
    tone(880, 0, 0.25);
    tone(1320, 0.3, 0.35);
  } catch {
    /* no-op */
  }
}

interface Options {
  enabled: boolean;
}

export function useDriverSocket({ enabled }: Options) {
  const token = useAuthStore((s) => s.token);
  const setIncoming = useOrderStore((s) => s.setIncoming);
  const setActive = useOrderStore((s) => s.setActive);
  const addToDistance = useOrderStore((s) => s.addToDistance);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const intervalRef = useRef<number | null>(null);
  const watchIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled || !token) {
      disconnectSocket();
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (watchIdRef.current != null && 'geolocation' in navigator) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
      return;
    }

    const socket = getSocket(token);

    socket.on('new_order', (payload: any) => {
      const inc: IncomingOrder = {
        orderId: payload.orderId,
        pickup: payload.pickup,
        distanceFromDriver: payload.distanceFromDriver,
        receivedAt: Date.now(),
      };
      setIncoming(inc);
      try {
        if (navigator.vibrate) navigator.vibrate([400, 200, 400]);
        playOrderBeep();
      } catch {
        /* no-op */
      }
    });

    socket.on('order_taken', ({ orderId }: { orderId: string }) => {
      const inc = useOrderStore.getState().incoming;
      if (inc?.orderId === orderId) setIncoming(null);
    });

    socket.on('order_cancelled', ({ orderId }: { orderId: string }) => {
      const active = useOrderStore.getState().active;
      if (active?.id === orderId) {
        setActive({ ...active, status: 'CANCELLED' as OrderStatus });
      }
    });

    // GPS tracking
    if ('geolocation' in navigator) {
      watchIdRef.current = navigator.geolocation.watchPosition(
        (pos) => {
          const { latitude, longitude } = pos.coords;
          if (lastPos.current) {
            const active = useOrderStore.getState().active;
            if (active?.status === 'IN_PROGRESS') {
              const delta = haversineKm(
                lastPos.current.lat,
                lastPos.current.lng,
                latitude,
                longitude,
              );
              if (delta > 0.01) addToDistance(delta);
            }
          }
          lastPos.current = { lat: latitude, lng: longitude };
        },
        () => {},
        { enableHighAccuracy: true, maximumAge: 5000, timeout: 15000 },
      );
    }

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
      socket.off('new_order');
      socket.off('order_taken');
      socket.off('order_cancelled');
    };
  }, [enabled, token, setIncoming, setActive, addToDistance]);
}
