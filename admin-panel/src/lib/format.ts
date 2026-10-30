// Uzbek date formatting. Browsers' "uz" locale data is incomplete (months
// render as "M10"), so month names are spelled out here.

const MONTHS = [
  'yan',
  'fev',
  'mar',
  'apr',
  'may',
  'iyun',
  'iyul',
  'avg',
  'sen',
  'okt',
  'noy',
  'dek',
];

const pad = (n: number) => String(n).padStart(2, '0');

/** "1-okt" — the year is added only when it isn't the current one. */
function dayMonth(d: Date): string {
  const base = `${d.getDate()}-${MONTHS[d.getMonth()]}`;
  return d.getFullYear() === new Date().getFullYear()
    ? base
    : `${base} ${d.getFullYear()}`;
}

/** "1-okt, 23:15" */
export function fmtDateTime(s?: string | Date | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${dayMonth(d)}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** "1-okt 2026" */
export function fmtDate(s?: string | Date | null): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.getDate()}-${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** Compact date-time used in lists. */
export const fmtShort = fmtDateTime;
