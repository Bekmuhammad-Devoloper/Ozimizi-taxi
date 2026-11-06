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
export function LangToggle({
  dark = false,
  size = 'md',
  className = '',
}: {
  dark?: boolean;
  size?: 'md' | 'sm';
  className?: string;
}) {
  const sm = size === 'sm';
  const [lang, setCur] = useState<Lang>('latn');
  useEffect(() => setCur(getLang()), []);
  const btn = (l: Lang, label: string) => (
    <button
      type="button"
      onClick={() => {
        if (l !== lang) setLang(l);
      }}
      aria-pressed={l === lang}
      className={
        (sm ? 'h-7 px-2.5 rounded-md text-[11px] ' : 'h-8 px-3 rounded-lg text-xs ') +
        'font-bold transition-colors ' +
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
      title="Yozuv: lotin yoki kirill"
      className={
        'inline-flex items-center border ' +
        (sm ? 'gap-0.5 rounded-lg p-0.5 ' : 'gap-1 rounded-xl p-1 ') +
        (dark ? 'border-neutral-700 bg-neutral-900' : 'border-line bg-white') +
        (className ? ' ' + className : '')
      }
    >
      {btn('latn', 'Lotin')}
      {btn('cyrl', 'Кирилл')}
    </div>
  );
}
