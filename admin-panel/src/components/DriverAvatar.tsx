'use client';
import { Car } from 'lucide-react';
import { useState } from 'react';

interface Props {
  fullName: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function resolveUrl(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Backend stores `/uploads/<file>` — prepend the API origin.
  return API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
}

/**
 * Driver avatar — uploaded photo when available, otherwise a Car icon.
 * Falls back to the icon on image load error too.
 */
export function DriverAvatar({
  fullName,
  avatarUrl,
  size = 36,
  className = '',
}: Props) {
  const [broken, setBroken] = useState(false);
  const showImg = !!avatarUrl && !broken;
  const dim = { width: size, height: size };

  if (showImg) {
    return (
      <img
        src={resolveUrl(avatarUrl!)}
        alt={fullName}
        title={fullName}
        onError={() => setBroken(true)}
        style={dim}
        className={
          'rounded-full object-cover ring-1 ring-line shrink-0 ' + className
        }
      />
    );
  }
  return (
    <span
      style={dim}
      title={fullName}
      className={
        'rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0 ' +
        className
      }
    >
      <Car size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  );
}
