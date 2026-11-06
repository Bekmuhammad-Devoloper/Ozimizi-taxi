'use client';
import { useState } from 'react';

interface Props {
  fullName: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
/** Shown for drivers who have not uploaded a photo. */
const DEFAULT_AVATAR = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/img/default-avatar.jpg`;

function resolveUrl(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  // Backend stores `/uploads/<file>` — prepend the API origin.
  return API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
}

/**
 * Driver avatar — uploaded photo when available, otherwise the default
 * picture. Falls back to the default on an image load error too.
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
    <img
      src={DEFAULT_AVATAR}
      alt={fullName}
      title={fullName}
      style={dim}
      className={'rounded-full object-cover ring-1 ring-line shrink-0 ' + className}
    />
  );
}
