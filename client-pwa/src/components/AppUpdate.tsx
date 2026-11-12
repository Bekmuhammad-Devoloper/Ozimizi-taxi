'use client';
import { useEffect, useState } from 'react';
import { Download, X } from 'lucide-react';
import { isNativeApp } from '@/lib/native';
import { api } from '@/lib/api';

const DISMISS_KEY = 'moviy-client-update-dismissed';
const DISMISS_MS = 24 * 3600_000;
const CLIENT_APK = '/downloads/moviytaxi-client.apk';

// Read the latest version once per app start (Shell remounts on every page).
let latestCache: string | null = null;
let versionReported = false;

/** Installed APK version: 1.0.2+ append "MoviyClient/x.y.z" to the user agent. */
function installedVersion(): string {
  const m = navigator.userAgent.match(/MoviyClient\/([\d.]+)/);
  return m ? m[1] : '1.0.1';
}

function older(a: string, b: string): boolean {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const d = (x[i] ?? 0) - (y[i] ?? 0);
    if (d !== 0) return d < 0;
  }
  return false;
}

/**
 * In the Android app: a banner offering the newer APK (dismissible for 24 h).
 * The browser / Telegram versions are always current, so nothing shows there.
 */
export function AppUpdate() {
  const [offer, setOffer] = useState<{ installed: string; latest: string } | null>(null);

  // Tell the server which version this phone has: the bot sends new versions to app users.
  useEffect(() => {
    if (!isNativeApp() || versionReported) return;
    versionReported = true;
    void api.post('/client/app-version', { version: installedVersion() }).catch(() => {
      versionReported = false;
    });
  }, []);

  useEffect(() => {
    if (!isNativeApp()) return;
    let alive = true;
    void (async () => {
      let latest = latestCache;
      if (!latest) {
        try {
          const r = await fetch('/downloads/version-client.json', { cache: 'no-store' });
          const j = r.ok ? await r.json() : null;
          latest = j?.version ? String(j.version) : null;
        } catch {
          latest = null;
        }
        latestCache = latest;
      }
      if (!alive || !latest) return;
      const installed = installedVersion();
      if (!older(installed, latest)) return;
      try {
        const d = JSON.parse(localStorage.getItem(DISMISS_KEY) || 'null');
        if (d && d.version === latest && d.until > Date.now()) return;
      } catch {
        /* storage blocked — show it */
      }
      setOffer({ installed, latest });
    })();
    return () => {
      alive = false;
    };
  }, []);

  if (!offer) return null;

  const close = () => {
    try {
      localStorage.setItem(DISMISS_KEY, JSON.stringify({ version: offer.latest, until: Date.now() + DISMISS_MS }));
    } catch {
      /* hidden until restart */
    }
    setOffer(null);
  };

  // The WebView ignores downloads but hands another scheme to the system:
  // plain http opens the browser, which follows the redirect to https.
  const download = () => {
    window.location.href = `http://${window.location.host}${CLIENT_APK}`;
  };

  return (
    <div className="fixed top-0 inset-x-0 z-50 max-w-md mx-auto" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
      <div className="m-2 rounded-2xl bg-gold-dark text-white shadow-lg flex items-center gap-2 px-4 py-2.5">
        <Download size={16} className="shrink-0" strokeWidth={2.4} />
        <button type="button" onClick={download} className="flex-1 min-w-0 text-left text-sm font-bold leading-tight">
          Ilovaning yangi versiyasi {offer.latest} — yangilash
          <span className="block text-[11px] font-medium text-white/80">
            Sizda: {offer.installed} · bosing, yuklab olinadi
          </span>
        </button>
        <button
          type="button"
          onClick={close}
          aria-label="Yopish"
          className="w-8 h-8 rounded-full bg-white/15 flex items-center justify-center shrink-0 active:scale-95"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
}
