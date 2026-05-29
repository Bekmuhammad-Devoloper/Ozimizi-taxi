'use client';
import { User } from 'lucide-react';
import { useState } from 'react';

interface Props {
  firstName: string;
  avatarUrl?: string | null;
  size?: number;
  className?: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function resolveUrl(raw: string): string {
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://')) return raw;
  return API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);
}

/**
 * Client avatar — cached Telegram profile photo when available,
 * otherwise a User icon. Falls back to the icon on image load error.
 */
export function ClientAvatar({
  firstName,
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
        alt={firstName}
        title={firstName}
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
      title={firstName}
      className={
        'rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0 ' +
        className
      }
    >
      <User size={Math.round(size * 0.5)} strokeWidth={2.2} />
    </span>
  );
}
