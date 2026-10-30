/**
 * Telegram Mini App helpers (no 'use client': the root layout imports
 * TG_CAPTURE_SCRIPT on the server; everything else is window-guarded).
 *
 * The bot opens the app (…/client/food) as a Mini App; Telegram passes the signed `initData` in the URL hash
 * (#tgWebAppData=…), and telegram-web-app.js exposes it as
 * window.Telegram.WebApp.initData. The script is loaded async from the root
 * layout, so the hash is also captured by an inline <head> script into
 * sessionStorage (TG_INIT_KEY) before the router can drop it — login never has
 * to wait for telegram.org.
 */

export const TG_INIT_KEY = 'moviy-tg-init';
export const BOT_URL = 'https://t.me/Moviytaxibot';

/** Inline <head> script: copy tgWebAppData from the hash into sessionStorage. */
export const TG_CAPTURE_SCRIPT = `(function(){try{var h=location.hash.replace(/^#/,'');var i=h.indexOf('tgWebAppData=');if(i<0)return;var p=h.slice(i).split('&');for(var j=0;j<p.length;j++){var kv=p[j].split('=');if(kv[0]==='tgWebAppData'){var v=decodeURIComponent(kv.slice(1).join('=').replace(/\\+/g,'%20'));if(v)sessionStorage.setItem('${TG_INIT_KEY}',v);}}}catch(e){}})();`;

interface TgWebApp {
  initData?: string;
  platform?: string;
  ready?: () => void;
  expand?: () => void;
  close?: () => void;
  isVersionAtLeast?: (v: string) => boolean;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  disableVerticalSwipes?: () => void;
  openTelegramLink?: (url: string) => void;
}

export function tgWebApp(): TgWebApp | null {
  if (typeof window === 'undefined') return null;
  return ((window as any).Telegram?.WebApp as TgWebApp | undefined) ?? null;
}

function fromHash(): string {
  try {
    const h = window.location.hash.replace(/^#/, '');
    const i = h.indexOf('tgWebAppData=');
    if (i < 0) return '';
    for (const part of h.slice(i).split('&')) {
      const [k, ...rest] = part.split('=');
      if (k === 'tgWebAppData') return decodeURIComponent(rest.join('=').replace(/\+/g, '%20'));
    }
  } catch {
    /* malformed hash */
  }
  return '';
}

/** Signed Telegram initData when running as a Mini App, else ''. */
export function telegramInitData(): string {
  if (typeof window === 'undefined') return '';
  const live = tgWebApp()?.initData;
  if (live) return live;
  const h = fromHash();
  try {
    if (h) sessionStorage.setItem(TG_INIT_KEY, h);
    return h || sessionStorage.getItem(TG_INIT_KEY) || '';
  } catch {
    return h;
  }
}

export function isTelegram(): boolean {
  return !!telegramInitData();
}

let uiDone = false;

/**
 * Inside Telegram: tell the client we're ready, take the full height, match
 * the dark header and stop swipe-to-close from fighting map drags. Polls a few
 * seconds because telegram-web-app.js loads async.
 */
export function initTelegramUi() {
  if (uiDone || typeof window === 'undefined' || !isTelegram()) return;
  uiDone = true;
  let n = 0;
  const tick = () => {
    const w = tgWebApp();
    if (!w) {
      if (++n < 80) window.setTimeout(tick, 100);
      return;
    }
    try {
      w.ready?.();
      w.expand?.();
      if (w.isVersionAtLeast?.('6.1')) {
        w.setHeaderColor?.('#0a0a0a');
        w.setBackgroundColor?.('#fafaf9');
      }
      if (w.isVersionAtLeast?.('7.7')) w.disableVerticalSwipes?.();
    } catch {
      /* old Telegram client */
    }
  };
  tick();
}

/** Open the bot chat (inside Telegram without leaving the app shell). */
export function openBot() {
  const w = tgWebApp();
  try {
    if (w?.openTelegramLink && isTelegram()) {
      w.openTelegramLink(BOT_URL);
      return;
    }
  } catch {
    /* fall through */
  }
  window.open(BOT_URL, '_blank', 'noopener');
}
