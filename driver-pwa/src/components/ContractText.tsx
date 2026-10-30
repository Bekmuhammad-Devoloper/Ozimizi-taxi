'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';

/** The driver agreement text, fetched from the public endpoint (admin-editable). */
export function useContractText() {
  const [text, setText] = useState<string | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let alive = true;
    api
      .get<{ text: string }>('/public/driver-contract')
      .then((r) => alive && setText(r.data.text))
      .catch(() => alive && setError(true));
    return () => {
      alive = false;
    };
  }, []);
  return { text, error };
}

export function ContractText({ className }: { className?: string }) {
  const { text, error } = useContractText();
  if (error) return <p className="text-sm text-red-600">Shartnoma matnini yuklab bo‘lmadi. Internetni tekshiring.</p>;
  if (text == null) return <p className="text-sm text-neutral-500">Yuklanmoqda…</p>;
  return (
    <div className={'text-[13px] leading-relaxed text-neutral-800 whitespace-pre-wrap ' + (className ?? '')}>
      {text}
    </div>
  );
}

/** Full-screen sheet with the contract text. */
export function ContractSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
      <div
        className="bg-white w-full max-w-md max-h-[90dvh] rounded-t-3xl sm:rounded-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 pt-4 pb-3 border-b border-line flex items-center justify-between">
          <h2 className="font-extrabold text-base">📄 Haydovchi shartnomasi</h2>
          <button type="button" onClick={onClose} className="text-sm font-semibold text-neutral-500 px-2 py-1">
            Yopish
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">
          <ContractText />
        </div>
      </div>
    </div>
  );
}
