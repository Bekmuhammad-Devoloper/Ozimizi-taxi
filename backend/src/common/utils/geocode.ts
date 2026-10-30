/**
 * Reverse geocoding through OpenStreetMap Nominatim (free; usage policy:
 * identify the app, ≤1 request/s). Only used in the background to label
 * pickup/drop-off points for the admin panel — failures just leave the
 * address empty.
 */
const UA = 'MoviyTaxi/1.0 (https://moviytaxi.uz)';
let last = Promise.resolve();

export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<string | null> {
  // Serialise calls with a 1.1 s gap to respect the rate limit.
  const run = last.then(async () => {
    const url =
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
      `&zoom=17&accept-language=uz,ru,en`;
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      if (!res.ok) return null;
      const j = (await res.json()) as {
        address?: Record<string, string>;
        display_name?: string;
      };
      const a = j.address ?? {};
      const parts = [
        [a.road, a.house_number].filter(Boolean).join(' '),
        a.neighbourhood || a.suburb || a.quarter || a.residential,
        a.city || a.town || a.village || a.county,
      ].filter(Boolean);
      const text = parts.length ? parts.join(', ') : (j.display_name ?? null);
      return text ? text.slice(0, 200) : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
      await new Promise((r) => setTimeout(r, 1100));
    }
  });
  last = run.then(() => undefined, () => undefined);
  return run;
}
