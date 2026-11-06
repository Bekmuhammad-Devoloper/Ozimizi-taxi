'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getLastKnownPosition } from '@/hooks/useDriverSocket';
import { Maneuver, NavRoute, NavTracker, Pt, parseRoute, routeUrl } from '@/lib/voice-nav';

const MUTE_KEY = 'moviy-nav-muted';

/** Says clips one after another; a new phrase replaces what is still waiting. */
class ClipPlayer {
  private el: HTMLAudioElement | null = null;
  private queue: string[] = [];
  private busy = false;

  say(clips: string[]) {
    this.queue = clips.slice();
    if (!this.busy) this.playNext();
  }

  stop() {
    this.queue = [];
    this.busy = false;
    this.el?.pause();
  }

  private playNext() {
    const key = this.queue.shift();
    if (!key) {
      this.busy = false;
      return;
    }
    if (!this.el) {
      this.el = new Audio();
      this.el.onended = () => this.playNext();
      this.el.onerror = () => this.playNext();
    }
    this.busy = true;
    this.el.src = `/sounds/nav/${key}.mp3`;
    // A blocked clip must not stop the ones after it.
    void this.el.play().catch(() => this.playNext());
  }
}

export interface VoiceNavView {
  state: 'off' | 'waiting-gps' | 'routing' | 'failed' | 'ok';
  next: Maneuver | null;
  distM: number;
  remainM: number;
  remainSec: number;
  route: Pt[] | null;
  me: Pt | null;
  muted: boolean;
  toggleMute: () => void;
}

const EMPTY = { next: null, distM: 0, remainM: 0, remainSec: 0, route: null, me: null };

/**
 * Follows the driver to `target` and says the turns in Uzbek. Pass null when
 * there is nowhere to drive to. Silent while the app is in the background (the
 * driver may be listening to Yandex Navigator then).
 */
export function useVoiceNav(target: Pt | null, kind: 'pickup' | 'dest'): VoiceNavView {
  const [view, setView] = useState<Omit<VoiceNavView, 'muted' | 'toggleMute'>>({ state: 'off', ...EMPTY });
  const [muted, setMuted] = useState(false);
  const mutedRef = useRef(false);

  useEffect(() => {
    let m = false;
    try {
      m = localStorage.getItem(MUTE_KEY) === '1';
    } catch {
      /* private window */
    }
    mutedRef.current = m;
    setMuted(m);
  }, []);

  const playerRef = useRef<ClipPlayer | null>(null);
  const toggleMute = useCallback(() => {
    const m = !mutedRef.current;
    mutedRef.current = m;
    setMuted(m);
    if (m) playerRef.current?.stop();
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* private window */
    }
  }, []);

  const lat = target?.lat;
  const lng = target?.lng;
  useEffect(() => {
    if (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      setView({ state: 'off', ...EMPTY });
      return;
    }
    const to: Pt = { lat, lng };
    const player = new ClipPlayer();
    playerRef.current = player;
    let tracker: NavTracker | null = null;
    let route: NavRoute | null = null;
    let fetching = false;
    let stopped = false;
    let lastFetchAt = 0;
    let onLine = false;
    let builtOnce = false;

    const say = (clips: string[] | null) => {
      if (!clips?.length || mutedRef.current || document.visibilityState !== 'visible') return;
      player.say(clips);
    };

    const build = async (from: Pt) => {
      if (fetching) return;
      fetching = true;
      lastFetchAt = Date.now();
      const ctl = new AbortController();
      const timer = window.setTimeout(() => ctl.abort(), 12_000);
      try {
        const res = await fetch(routeUrl(from, to), { signal: ctl.signal });
        const parsed = res.ok ? parseRoute(await res.json()) : null;
        if (stopped) return;
        if (!parsed) throw new Error('no route');
        route = parsed;
        tracker = new NavTracker(parsed, kind, !builtOnce);
        if (builtOnce) say(['reroute']);
        builtOnce = true;
        onLine = false;
      } catch {
        if (!stopped && !route) setView((v) => ({ ...v, state: 'failed' }));
      } finally {
        window.clearTimeout(timer);
        fetching = false;
      }
    };

    const tick = () => {
      const me = getLastKnownPosition(20_000);
      if (!me) {
        if (!route) setView((v) => ({ ...v, state: v.state === 'failed' ? 'failed' : 'waiting-gps' }));
        return;
      }
      if (!tracker) {
        // First route, or a retry after the routing server failed.
        if (Date.now() - lastFetchAt > 30_000) {
          setView((v) => ({ ...v, state: v.state === 'failed' ? 'failed' : 'routing', me }));
          void build(me);
        }
        return;
      }
      const u = tracker.update(me);
      if (u.offRouteM < 40) onLine = true;
      // Parked in a yard the phone is off the line from the start: don't keep rebuilding.
      const wait = onLine ? 20_000 : 60_000;
      if (u.lost && Date.now() - lastFetchAt > wait) void build(me);
      say(u.say);
      setView({
        state: 'ok',
        next: u.next,
        distM: u.distM,
        remainM: u.remainM,
        remainSec: u.remainSec,
        route: route?.line ?? null,
        me,
      });
    };

    tick();
    const id = window.setInterval(tick, 1000);
    return () => {
      stopped = true;
      window.clearInterval(id);
      player.stop();
      if (playerRef.current === player) playerRef.current = null;
    };
  }, [lat, lng, kind]);

  return { ...view, muted, toggleMute };
}
