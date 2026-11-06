'use client';
// App language. Texts are written in Latin; in Cyrillic mode they are converted
// on the page (text, placeholders, titles, confirm / alert dialogs).
import { toCyrillic } from './cyrillic';

export type Lang = 'latn' | 'cyrl';
const KEY = 'moviy-lang';

export function getLang(): Lang {
  try {
    return localStorage.getItem(KEY) === 'cyrl' ? 'cyrl' : 'latn';
  } catch {
    return 'latn';
  }
}

/** Switching reloads the page: going back to Latin needs the original texts. */
export function setLang(lang: Lang): void {
  try {
    localStorage.setItem(KEY, lang);
  } catch {
    /* storage blocked — stays as it is */
  }
  window.location.reload();
}

/** For texts that never reach the page (phone notifications). */
export function localize(text: string): string {
  return typeof window !== 'undefined' && getLang() === 'cyrl' ? toCyrillic(text) : text;
}

const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'CODE', 'PRE']);
const ATTRS = ['placeholder', 'title', 'aria-label', 'alt'];

function skipped(el: Element | null): boolean {
  if (!el) return true;
  if (SKIP_TAGS.has(el.tagName)) return true;
  return !!el.closest('[data-no-translit],[translate="no"],[contenteditable="true"]');
}

function convertText(node: Text) {
  if (!/[A-Za-z]/.test(node.nodeValue ?? '') || skipped(node.parentElement)) return;
  const next = toCyrillic(node.nodeValue!);
  if (next !== node.nodeValue) node.nodeValue = next;
}

function convertAttrs(el: Element) {
  if (skipped(el)) return;
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v && /[A-Za-z]/.test(v)) {
      const next = toCyrillic(v);
      if (next !== v) el.setAttribute(a, next);
    }
  }
}

function convertTree(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    convertText(root as Text);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  convertAttrs(root as Element);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) convertText(n as Text);
    else convertAttrs(n as Element);
  }
}

let started = false;

/** Called once after hydration; React then simply keeps updating the same nodes. */
export function startCyrillicPage(): void {
  if (started || typeof window === 'undefined' || getLang() !== 'cyrl') return;
  started = true;
  convertTree(document.documentElement);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') convertText(r.target as Text);
      else if (r.type === 'attributes') convertAttrs(r.target as Element);
      else r.addedNodes.forEach(convertTree);
    }
  }).observe(document.documentElement, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ATTRS,
  });
  const { alert, confirm, prompt } = window;
  window.alert = (m?: any) => alert.call(window, toCyrillic(String(m ?? '')));
  window.confirm = (m?: string) => confirm.call(window, toCyrillic(String(m ?? '')));
  window.prompt = (m?: string, d?: string) => prompt.call(window, toCyrillic(String(m ?? '')), d);
}
