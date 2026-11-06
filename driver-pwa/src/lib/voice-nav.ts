// Voice navigation: a driving route with its turns, and a tracker that follows
// the driver along it and decides what to say. No browser APIs here: the player
// and the GPS live in hooks/useVoiceNav.ts. driver-flutter/lib/core/voice_nav.dart
// is the same logic; keep the two in step.

export interface Pt {
  lat: number;
  lng: number;
}

export type NavIcon =
  | 'left'
  | 'right'
  | 'slight_left'
  | 'slight_right'
  | 'sharp_left'
  | 'sharp_right'
  | 'uturn'
  | 'straight'
  | 'keep_left'
  | 'keep_right'
  | 'roundabout'
  | 'arrive';

export interface Maneuver {
  /** Metres from the start of the route. */
  at: number;
  /** Clip names to say after the distance ("left" → "chapga buriling"). */
  clips: string[];
  text: string;
  icon: NavIcon;
  street: string;
  arrive?: boolean;
}

export interface NavRoute {
  line: Pt[];
  /** Metres from the start up to each point of `line`. */
  cum: number[];
  total: number;
  durationSec: number;
  maneuvers: Maneuver[];
}

export interface NavUpdate {
  next: Maneuver;
  distM: number;
  remainM: number;
  remainSec: number;
  offRouteM: number;
  /** Off the line for a while: the route should be built again. */
  lost: boolean;
  /** Clips to say now, or null. */
  say: string[] | null;
}

const R = 6371000;
const rad = (d: number) => (d * Math.PI) / 180;

export function distM(a: Pt, b: Pt): number {
  const x = rad(b.lng - a.lng) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.hypot(x, y) * R;
}

const TEXT: Record<string, string> = {
  left: 'Chapga buriling',
  right: 'O‘ngga buriling',
  slight_left: 'Biroz chapga buriling',
  slight_right: 'Biroz o‘ngga buriling',
  sharp_left: 'Keskin chapga buriling',
  sharp_right: 'Keskin o‘ngga buriling',
  uturn: 'Orqaga qayriling',
  straight: 'To‘g‘riga yuring',
  keep_left: 'Chap tomondan yuring',
  keep_right: 'O‘ng tomondan yuring',
};

const turn = (key: string) => ({ clips: [key], text: TEXT[key], icon: key as NavIcon });

function turnKey(modifier?: string): string | null {
  switch (modifier) {
    case 'left':
      return 'left';
    case 'right':
      return 'right';
    case 'slight left':
      return 'slight_left';
    case 'slight right':
      return 'slight_right';
    case 'sharp left':
      return 'sharp_left';
    case 'sharp right':
      return 'sharp_right';
    case 'uturn':
      return 'uturn';
    default:
      return null;
  }
}

/** What a route step asks of the driver; null when there is nothing to say. */
function describe(type: string, modifier?: string, exit?: number) {
  switch (type) {
    case 'arrive':
      return { clips: [], text: 'Yetib keldingiz', icon: 'arrive' as NavIcon, arrive: true };
    case 'roundabout':
    case 'rotary':
    case 'roundabout turn': {
      const n = Number(exit);
      const clips = n >= 1 && n <= 4 ? ['roundabout', `exit${n}`] : ['roundabout'];
      const text = n >= 1 ? `Aylanma yo‘l: ${n}-chiqish` : 'Aylanma yo‘lga kiring';
      return { clips, text, icon: 'roundabout' as NavIcon };
    }
    case 'exit roundabout':
    case 'exit rotary':
    case 'new name':
    case 'notification':
    case 'use lane':
    case 'depart':
      return null;
    case 'fork':
    case 'merge':
    case 'on ramp':
    case 'off ramp':
      if (modifier?.includes('left')) return turn('keep_left');
      if (modifier?.includes('right')) return turn('keep_right');
      return null;
    case 'continue': {
      const k = turnKey(modifier);
      return k ? turn(k) : null;
    }
    default:
      // "turn", "end of road".
      return turn(turnKey(modifier) ?? 'straight');
  }
}

/** Reads an OSRM answer (`steps=true&geometries=geojson&overview=full`). */
export function parseRoute(json: any): NavRoute | null {
  const r = json?.routes?.[0];
  const coords = r?.geometry?.coordinates;
  const steps = r?.legs?.[0]?.steps;
  if (!Array.isArray(coords) || coords.length < 2 || !Array.isArray(steps) || !steps.length) return null;
  const line: Pt[] = coords.map((c: number[]) => ({ lat: c[1], lng: c[0] }));
  const cum: number[] = [0];
  for (let i = 1; i < line.length; i++) cum.push(cum[i - 1] + distM(line[i - 1], line[i]));
  const total = cum[cum.length - 1];
  const stepsTotal = steps.reduce((s: number, x: any) => s + (Number(x?.distance) || 0), 0);
  const scale = stepsTotal > 0 ? total / stepsTotal : 1;
  const maneuvers: Maneuver[] = [];
  let at = 0;
  for (const s of steps) {
    const m = s?.maneuver ?? {};
    const info = describe(String(m.type ?? ''), m.modifier, m.exit);
    if (info) maneuvers.push({ at: at * scale, street: String(s?.name ?? ''), ...info });
    at += Number(s?.distance) || 0;
  }
  const last = maneuvers[maneuvers.length - 1];
  if (!last?.arrive) maneuvers.push({ at: total, street: '', clips: [], text: 'Yetib keldingiz', icon: 'arrive', arrive: true });
  else last.at = total;
  return { line, cum, total, durationSec: Number(r?.duration) || 0, maneuvers };
}

/** Off the line by more than this many metres, twice in a row: lost. */
const OFF_ROUTE_M = 60;
/** A turn this close counts as done. */
const PASSED_M = 5;
const NOTHING_SAID = 9;

export class NavTracker {
  private seg = 0;
  private along = 0;
  private idx = 0;
  private first = true;
  private offCount = 0;
  private spoken: number[];

  constructor(
    readonly route: NavRoute,
    private readonly kind: 'pickup' | 'dest',
    private readonly sayStart = true,
  ) {
    this.spoken = route.maneuvers.map(() => NOTHING_SAID);
  }

  /** Nearest place on the line, looking just ahead of the last one (roads can double back). */
  private locate(p: Pt): number {
    const { line, cum } = this.route;
    const scan = (from: number, to: number) => {
      let best = { seg: from, along: 0, off: Infinity };
      const k = Math.cos(rad(p.lat));
      for (let i = from; i <= to; i++) {
        const ax = rad(line[i].lng - p.lng) * k * R;
        const ay = rad(line[i].lat - p.lat) * R;
        const bx = rad(line[i + 1].lng - p.lng) * k * R;
        const by = rad(line[i + 1].lat - p.lat) * R;
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 > 0 ? Math.min(1, Math.max(0, -(ax * dx + ay * dy) / len2)) : 0;
        const off = Math.hypot(ax + t * dx, ay + t * dy);
        if (off < best.off) best = { seg: i, along: cum[i] + t * (cum[i + 1] - cum[i]), off };
      }
      return best;
    };
    const lastSeg = line.length - 2;
    let best = scan(Math.max(0, this.seg - 5), Math.min(lastSeg, this.seg + 60));
    if (best.off > OFF_ROUTE_M) {
      // Back on the line somewhere else (a shortcut)?
      const all = scan(0, lastSeg);
      if (all.off <= OFF_ROUTE_M) best = all;
    }
    // Off the line we stay at the last place on it: a turn further along must
    // not count as passed just because that part of the line is the nearest.
    if (best.off <= OFF_ROUTE_M) {
      this.seg = best.seg;
      this.along = best.along;
    }
    return best.off;
  }

  private phrase(i: number, d: number): string[] | null {
    const m = this.route.maneuvers[i];
    if (m.arrive) {
      if (d > 40 || this.spoken[i] === 0) return null;
      this.spoken[i] = 0;
      return [this.kind === 'pickup' ? 'arrive_pickup' : 'arrive_dest'];
    }
    const fresh = this.spoken[i] === NOTHING_SAID;
    let rank: number;
    let clip: string;
    if (d <= 40) {
      rank = 0;
      clip = 'now';
    } else if (d <= 130) {
      rank = 1;
      clip = 'd100';
    } else if (d <= 330) {
      rank = 2;
      clip = fresh && d <= 230 ? 'd200' : 'd300';
    } else if (d <= 1050) {
      rank = 3;
      clip = fresh && d <= 650 ? 'd500' : 'd1000';
    } else if (d <= 2100 && fresh) {
      rank = 4;
      clip = 'd2000';
    } else {
      return null;
    }
    if (rank >= this.spoken[i]) return null;
    this.spoken[i] = rank;
    return [clip, ...m.clips];
  }

  update(p: Pt): NavUpdate {
    const { maneuvers, total, durationSec } = this.route;
    const off = this.locate(p);
    const along = this.along;
    this.offCount = off > OFF_ROUTE_M ? this.offCount + 1 : 0;

    const before = this.idx;
    while (this.idx < maneuvers.length - 1 && maneuvers[this.idx].at - along <= PASSED_M) this.idx++;
    const next = maneuvers[this.idx];
    const d = Math.max(0, next.at - along);

    let say = this.offCount > 0 ? null : this.phrase(this.idx, d);
    if (!say && this.idx > before && !next.arrive && d > 1050) say = ['continue'];
    if (this.first) {
      this.first = false;
      if (this.sayStart) say = ['start', ...(say ?? [])];
    }

    const remainM = Math.max(0, total - along);
    return {
      next,
      distM: d,
      remainM,
      remainSec: total > 0 ? (durationSec * remainM) / total : 0,
      offRouteM: off,
      lost: this.offCount >= 2,
      say,
    };
  }
}

export function routeUrl(from: Pt, to: Pt): string {
  return `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson&steps=true`;
}

export function fmtDist(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} km`;
  return `${Math.max(0, Math.round(m / 10) * 10)} m`;
}
