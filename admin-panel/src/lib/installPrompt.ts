/**
 * Captures Chrome's `beforeinstallprompt` as early as possible (this module
 * is imported by the root Providers, so it runs on every page — the event
 * fires once per page load, often before the dashboard mounts) and lets the
 * InstallPrompt banner use it later.
 */

export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform?: string }>;
}

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    // Keep Chrome's own mini-infobar away; our banner shows the button.
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });
  window.addEventListener('appinstalled', () => {
    installed = true;
    deferred = null;
    emit();
  });
}

export const getInstallPrompt = () => deferred;
export const wasInstalled = () => installed;

/** Subscribe to prompt availability changes; returns the unsubscribe fn. */
export function onInstallPromptChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/** Shows the native install dialog; resolves true when the user accepted. */
export async function runInstallPrompt(): Promise<boolean> {
  const e = deferred;
  if (!e) return false;
  deferred = null; // a prompt can be used only once
  emit();
  try {
    await e.prompt();
    const choice = await e.userChoice;
    return choice?.outcome === 'accepted';
  } catch {
    return false;
  }
}

/** Already running as an installed app (home-screen icon). */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.matchMedia?.('(display-mode: fullscreen)').matches ||
    (window.navigator as any).standalone === true
  );
}

/** iPhone / iPad (iPadOS reports itself as a Mac with touch). */
export function isIos(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}
