'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Loader2, Trash2, Upload } from 'lucide-react';
import { apiError, resolveMediaUrl, uploadFoodPhoto } from '@/lib/food';

/**
 * Photo picker for kitchen logos / menu items: uploads right away to
 * `uploadPath` (multipart field "file") and reports the relative URL.
 */
export function PhotoUpload({
  value,
  onChange,
  uploadPath,
  size = 88,
  round = false,
  hint,
}: {
  value: string | null;
  onChange: (url: string | null) => void;
  uploadPath: string;
  size?: number;
  round?: boolean;
  hint?: string;
}) {
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [broken, setBroken] = useState(false);

  const pick = async (file: File) => {
    setErr(null);
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setErr('Faqat JPG, PNG yoki WEBP rasm');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      setErr('Rasm 8 MB dan kichik bo‘lsin');
      return;
    }
    setBusy(true);
    try {
      const url = await uploadFoodPhoto(uploadPath, file);
      setBroken(false);
      onChange(url);
    } catch (e) {
      setErr(apiError(e, 'Yuklab bo‘lmadi'));
    } finally {
      setBusy(false);
    }
  };

  const shape = round ? 'rounded-full' : 'rounded-xl';
  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        style={{ width: size, height: size }}
        className={
          'relative shrink-0 overflow-hidden border border-dashed border-line bg-neutral-50 flex items-center justify-center text-neutral-400 hover:border-ink transition-colors ' +
          shape
        }
        title="Rasm tanlash"
      >
        {value && !broken ? (
          <img
            src={resolveMediaUrl(value)}
            alt=""
            onError={() => setBroken(true)}
            className="w-full h-full object-cover"
          />
        ) : (
          <ImagePlus size={Math.round(size * 0.3)} />
        )}
        {busy && (
          <span className="absolute inset-0 bg-white/70 flex items-center justify-center">
            <Loader2 size={18} className="animate-spin text-ink" />
          </span>
        )}
      </button>
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busy}
            onClick={() => input.current?.click()}
            className="h-8 px-3 rounded-lg border border-line text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-neutral-50 disabled:opacity-50"
          >
            <Upload size={13} /> {value ? 'Almashtirish' : 'Rasm yuklash'}
          </button>
          {value && (
            <button
              type="button"
              disabled={busy}
              onClick={() => onChange(null)}
              className="h-8 px-3 rounded-lg bg-red-50 text-red-600 text-xs font-semibold inline-flex items-center gap-1.5 hover:bg-red-100 disabled:opacity-50"
            >
              <Trash2 size={13} /> Olib tashlash
            </button>
          )}
        </div>
        <p className="text-[11px] text-neutral-500">{hint ?? 'JPG, PNG yoki WEBP · 8 MB gacha'}</p>
        {err && <p className="text-[11px] text-red-600">{err}</p>}
      </div>
      <input
        ref={input}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void pick(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
