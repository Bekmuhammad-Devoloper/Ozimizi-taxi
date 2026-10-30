'use client';
import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Download, Share, X } from 'lucide-react';
import {
  getInstallPrompt,
  isIos,
  isStandalone,
  onInstallPromptChange,
  runInstallPrompt,
  wasInstalled,
} from '@/lib/installPrompt';

const DISMISS_KEY = 'moviy-admin-install-dismissed';
const DISMISS_MS = 7 * 24 * 60 * 60 * 1000;

function dismissedRecently(): boolean {
  try {
    const t = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return t > 0 && Date.now() - t < DISMISS_MS;
  } catch {
    return false;
  }
}

/**
 * "Add to home screen" banner (dashboard + kitchen board). Android / Chrome:
 * the native install dialog behind an "O‘rnatish" button. iPhone Safari
 * (no install API): short instructions. Hidden when already installed,
 * inside the Telegram Mini App, or for 7 days after "×".
 */
export function InstallPrompt({ className = '' }: { className?: string }) {
  const [mode, setMode] = useState<'android' | 'ios' | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const inTelegram = !!(window as any).Telegram?.WebApp?.initData;
    if (inTelegram || isStandalone() || dismissedRecently()) return;
    const sync = () => {
      if (wasInstalled() || isStandalone()) setMode(null);
      else if (getInstallPrompt()) setMode('android');
      else setMode(isIos() ? 'ios' : null);
    };
    sync();
    return onInstallPromptChange(sync);
  }, []);

  if (!mode) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* storage blocked */
    }
    setMode(null);
  };

  const install = async () => {
    setBusy(true);
    const ok = await runInstallPrompt();
    setBusy(false);
    if (ok) setMode(null);
  };

  return (
    <div
      className={
        'mb-4 rounded-2xl bg-ink text-white px-4 py-3 flex items-center gap-3 shadow-sm ' + className
      }
    >
      <span className="w-11 h-11 rounded-xl overflow-hidden ring-1 ring-gold/60 shrink-0">
        <Image
          src={`${process.env.NEXT_PUBLIC_BASE_PATH ?? ''}/logo.jpg`}
          alt=""
          width={44}
          height={44}
          className="w-full h-full object-cover"
        />
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-bold leading-tight">Panelni telefonga o‘rnating</p>
        {mode === 'android' ? (
          <p className="text-[11px] text-neutral-300 mt-0.5">
            Bosh ekrandan ilova kabi tez ochiladi — brauzer qatorisiz.
          </p>
        ) : (
          <p className="text-[11px] text-neutral-300 mt-0.5 flex items-center gap-1 flex-wrap">
            Safari’da: <b className="text-white inline-flex items-center gap-0.5">Ulashish ⬆️</b>
            <Share size={11} className="text-gold" /> → <b className="text-white">Bosh ekranga qo‘shish</b>
          </p>
        )}
      </div>
      {mode === 'android' && (
        <button
          type="button"
          onClick={() => void install()}
          disabled={busy}
          className="h-10 px-4 rounded-lg bg-gold text-ink text-sm font-extrabold inline-flex items-center gap-1.5 shrink-0 disabled:opacity-60"
        >
          <Download size={16} /> O‘rnatish
        </button>
      )}
      <button
        type="button"
        onClick={dismiss}
        aria-label="Yopish"
        title="7 kunga yashirish"
        className="w-8 h-8 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-neutral-800 shrink-0"
      >
        <X size={16} />
      </button>
    </div>
  );
}
