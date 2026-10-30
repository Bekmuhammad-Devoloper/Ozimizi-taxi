/**
 * Resolve a server-relative asset URL (like /uploads/abc.jpg)
 * to a fully qualified URL using NEXT_PUBLIC_API_URL.
 */
export function assetUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
  return base.replace(/\/$/, '') + (path.startsWith('/') ? path : '/' + path);
}
