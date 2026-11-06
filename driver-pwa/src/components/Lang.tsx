'use client';
import { useEffect, useState } from 'react';
import { Lang, getLang, setLang, startCyrillicPage } from '@/lib/lang';

/** Mounted once in the root layout. */
export function LangBridge() {
  useEffect(() => {
    startCyrillicPage();
  }, []);
  return null;
}

/** Lotin | Кирилл switch; its own labels are never converted. */
export function LangToggle({ dark = false, className = '' }: { dark?: boolean; className?: string }) {
  const [lang, setCur] = useState<Lang>('latn');
  useEffect(() => setCur(getLang()), []);
  const btn = (l: Lang, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (l !== lang) setLang(l);
      }}
      className={
        'h-8 px-3 rounded-lg text-xs font-bold transition-colors ' +
        (l === lang
          ? 'bg-gold text-ink'
          : dark
            ? 'text-neutral-300 hover:bg-neutral-800'
            : 'text-neutral-600 hover:bg-neutral-100')
      }
    >
      {label}
    </button>
  );
  return (
    <div
      data-no-translit
      className={
        'inline-flex items-center gap-1 rounded-xl border p-1 ' +
        (dark ? 'border-neutral-700' : 'border-line bg-white') +
        (className ? ' ' + className : '')
      }
    >
      {btn('latn', 'Lotin')}
      {btn('cyrl', 'Кирилл')}
    </div>
  );
}
