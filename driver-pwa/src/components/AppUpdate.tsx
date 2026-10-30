'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { api } from '@/lib/api';
import { compareVersions, detectAppVersion, isNativeApp } from '@/lib/native';
import { apkDownloadUrl, openExternalUrl } from '@/lib/nav';
import { useAuthStore } from '@/stores/auth';
import { useAppUpdateStore } from '@/stores/appUpdate';

const DISMISS_KEY = 'moviy-update-dismissed';
const DISMISS_MS = 24 * 3600_000;
const DRIVER_APK = '/downloads/moviytaxi-driver.apk';

// Once per app start (and account): report the version, read the latest one.
let reportedFor: string | null = null;
let latestChecked = false;

function readDismiss(): { version: string; until: number } | null {
  try {
    const raw = localStorage.getItem(DISMISS_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * App version: reported to the server on start; in the APK a banner offers
 * the newer build (dismissible for 24 h); an admin "update" broadcast shows
 * as a dialog.
 */
export function AppUpdate() {
  const token = useAuthStore((s) => s.token);
  const installed = useAppUpdateStore((s) => s.installed);
  const platform = useAppUpdateStore((s) => s.platform);
  const latest = useAppUpdateStore((s) => s.latest);
  const announcement = useAppUpdateStore((s) => s.announcement);
  const showAnnouncement = useAppUpdateStore((s) => s.showAnnouncement);
  const [dismiss, setDismiss] = useState<{ version: string; until: number } | null>(null);

  useEffect(() => {
    setDismiss(readDismiss());
  }, []);

  useEffect(() => {
    if (!token || reportedFor === token) return;
    reportedFor = token;
    let alive = true;
    void (async () => {
      const v = await detectAppVersion();
      useAppUpdateStore.getState().set({ installed: v.version, platform: v.platform });
      try {
        await api.post('/driver/app-version', { version: v.version, platform: v.platform });
      } catch {
        // Offline at start — try again on the next screen.
        if (reportedFor === token) reportedFor = null;
      }
      if (!latestChecked && alive) {
        latestChecked = true;
        try {
          const r = await fetch('/downloads/version.json', { cache: 'no-store' });
          const j = r.ok ? await r.json() : null;
          if (j?.version) useAppUpdateStore.getState().set({ latest: String(j.version) });
          else latestChecked = false;
        } catch {
          latestChecked = false;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [token]);

  const outdated =
    platform === 'android' &&
    !!installed &&
    !!latest &&
    compareVersions(installed, latest) === -1;
  const dismissed = !!dismiss && dismiss.version === latest && dismiss.until > Date.now();

  const closeBanner = () => {
    if (!latest) return;
    const d = { version: latest, until: Date.now() + DISMISS_MS };
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify(d));
    } catch {
      /* storage blocked — hidden until restart */
    }
    setDismiss(d);
  };

  // An "update" broadcast is pointless for a phone already on that version.
  const cmp =
    announcement?.version && installed
      ? compareVersions(installed, announcement.version)
      : null;
  const showModal = !!announcement && !(cmp !== null && cmp >= 0);

  // Straight to the APK in the browser (the WebView cannot save files).
  const downloadLatest = () => openExternalUrl(apkDownloadUrl(DRIVER_APK));

  const openUpdate = () => {
    const url = announcement?.url || '/app';
    showAnnouncement(null);
    if (isNativeApp()) return downloadLatest();
    if (url.startsWith('/')) window.location.href = url;
    else openExternalUrl(url);
  };

  return (
    <>
      {outdated && !dismissed && (
        <div
          className="sticky top-0 z-20 bg-gold-dark text-white shadow-md"
          style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
          <div className="flex items-center gap-2 px-4 py-2.5">
            <Download size={16} className="shrink-0" strokeWidth={2.4} />
            <button
              type="button"
              onClick={downloadLatest}
              className="flex-1 min-w-0 text-left text-sm font-bold leading-tight"
            >
              Yangi versiya {latest} — yangilash
              <span className="block text-[11px] font-medium text-white/80">
                Sizda: {installed} · bosing, yuklab olinadi
              </span>
            </button>
            <button
              type="button"
              onClick={closeBanner}
              aria-label="Yopish"
              className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0 active:scale-95"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm flex items-end sm:items-center justify-center">
          <div className="bg-white w-full max-w-md rounded-t-2xl sm:rounded-2xl p-6">
            <div className="w-12 h-12 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center mb-3">
              <Download size={22} strokeWidth={2.4} />
            </div>
            <h2 className="text-lg font-bold">
              {announcement?.title || 'Ilovaning yangi versiyasi'}
            </h2>
            <p className="mt-1.5 text-sm text-neutral-600 whitespace-pre-wrap">
              {announcement?.text ||
                'Ilovani yangilang — yangi imkoniyatlar va tuzatishlar qo‘shildi.'}
            </p>
            <button
              type="button"
              onClick={openUpdate}
              className="mt-5 w-full h-14 bg-gold text-ink text-base font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-gold/40 active:scale-[0.98]"
            >
              <Download size={18} strokeWidth={2.4} /> Yangilash
            </button>
            <button
              type="button"
              onClick={() => showAnnouncement(null)}
              className="mt-2 w-full h-11 rounded-xl border border-line text-sm font-semibold text-neutral-700"
            >
              Keyinroq
            </button>
          </div>
        </div>
      )}
    </>
  );
}
