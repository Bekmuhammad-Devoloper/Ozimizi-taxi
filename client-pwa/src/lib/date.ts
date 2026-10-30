// Uzbek date formatting in the device's local time zone. The browsers' "uz"
// locale data is incomplete (months render as "M10"), so names are spelled out
// here, and API timestamps (UTC ISO strings) are never sliced as text.

const MONTHS = [
  'yanvar',
  'fevral',
  'mart',
  'aprel',
  'may',
  'iyun',
  'iyul',
  'avgust',
  'sentabr',
  'oktabr',
  'noyabr',
  'dekabr',
];
const WEEKDAYS = [
  'Yakshanba',
  'Dushanba',
  'Seshanba',
  'Chorshanba',
  'Payshanba',
  'Juma',
  'Shanba',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** "23:15" */
export function fmtTime(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "1-oktabr · 23:15" */
export function fmtDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${d.getDate()}-${MONTHS[d.getMonth()]} · ${fmtTime(iso)}`;
}

/** Local calendar day key, "2026-10-01" — for grouping by day. */
export function localDayKey(iso?: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Heading for a day key: "Bugun", "Kecha" or "Payshanba, 1-oktabr". */
export function fmtDayLabel(dayKey: string): string {
  if (!dayKey) return '';
  const [y, m, d] = dayKey.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  const today = localDayKey(new Date().toISOString());
  const yest = new Date();
  yest.setDate(yest.getDate() - 1);
  if (dayKey === today) return 'Bugun';
  if (dayKey === localDayKey(yest.toISOString())) return 'Kecha';
  return `${WEEKDAYS[date.getDay()]}, ${d}-${MONTHS[m - 1]}`;
}
