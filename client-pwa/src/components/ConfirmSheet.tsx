'use client';
import { Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  title: string;
  text?: React.ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/** Bottom-sheet confirmation (window.confirm is unreliable inside Telegram's WebView). */
export function ConfirmSheet({ open, title, text, confirmLabel, cancelLabel = 'Yo‘q', danger, busy, onConfirm, onClose }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center">
      <button aria-label="Yopish" onClick={onClose} className="absolute inset-0 bg-black/40 animate-in fade-in duration-200" />
      <div
        className="relative w-full max-w-md rounded-t-[2rem] bg-white px-5 pt-3 shadow-2xl animate-in slide-in-from-bottom-6 duration-300"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1.25rem)' }}
      >
        <div className="mx-auto w-10 h-1 rounded-full bg-neutral-200 mb-4" />
        <h3 className="text-lg font-extrabold leading-snug">{title}</h3>
        {text && <div className="mt-1.5 text-sm text-neutral-600 leading-relaxed">{text}</div>}
        <div className="mt-5 flex gap-2">
          <button onClick={onClose} className="h-12 px-5 rounded-2xl border border-line font-bold active:scale-[0.98] transition">
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={
              'flex-1 h-12 rounded-2xl font-extrabold flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98] transition ' +
              (danger ? 'bg-red-600 text-white' : 'bg-ink text-gold')
            }
          >
            {busy && <Loader2 size={16} className="animate-spin" />}
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
