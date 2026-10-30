'use client';
import { useState } from 'react';
import { Check, Coins, X } from 'lucide-react';
import { useOrderStore } from '@/stores/order';
import { api } from '@/lib/api';

/**
 * A passenger asked to pay part of a finished ride from their bonus
 * balance. On approval the amount lands on the driver's balance and the
 * passenger pays that much less in cash.
 */
export function BonusRequestModal() {
  const req = useOrderStore((s) => s.bonusRequest);
  const setReq = useOrderStore((s) => s.setBonusRequest);
  const active = useOrderStore((s) => s.active);
  const setActive = useOrderStore((s) => s.setActive);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!req) return null;

  const decide = async (approve: boolean) => {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      await api.post(`/driver/bonus/${req.id}/${approve ? 'approve' : 'reject'}`);
      if (approve && active?.id === req.orderId) {
        setActive({
          ...active,
          bonusUsed: String(Number(active.bonusUsed ?? 0) + req.amount),
        });
      }
      setReq(null);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Xato, qayta urinib ko‘ring');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-end sm:items-center justify-center p-4">
      <div className="w-full max-w-sm bg-white rounded-3xl p-6 shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <span className="w-11 h-11 rounded-2xl bg-gold/15 text-gold-deep flex items-center justify-center">
            <Coins size={22} />
          </span>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
              Bonusdan to‘lov
            </p>
            <p className="font-bold">{req.clientName}</p>
          </div>
        </div>

        <p className="text-sm text-neutral-700">
          Mijoz safar uchun{' '}
          <b className="text-ink">{fmt(req.amount)} so‘m</b>ni bonus
          balansidan to‘lamoqchi. Tasdiqlasangiz, bu summa{' '}
          <b>sizning balansingizga</b> tushadi.
        </p>

        <div className="mt-4 rounded-2xl bg-neutral-50 border border-line p-4 space-y-1.5 text-sm">
          <Row label="Safar narxi" value={`${fmt(req.price)} so‘m`} />
          <Row label="Bonusdan (balansga)" value={`+${fmt(req.amount)} so‘m`} accent />
          <Row label="Naqd olasiz" value={`${fmt(req.cashAfter)} so‘m`} bold />
        </div>

        {err && <p className="mt-3 text-sm text-red-600">{err}</p>}

        <div className="mt-5 grid grid-cols-2 gap-2">
          <button
            onClick={() => decide(false)}
            disabled={busy}
            className="h-12 rounded-xl bg-red-50 text-red-600 border border-red-200 font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <X size={18} /> Yo‘q
          </button>
          <button
            onClick={() => decide(true)}
            disabled={busy}
            className="h-12 rounded-xl bg-green-600 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Check size={18} /> Ha, tasdiqlayman
          </button>
        </div>
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  bold,
  accent,
}: {
  label: string;
  value: string;
  bold?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex justify-between">
      <span className="text-neutral-500">{label}</span>
      <span
        className={
          'tabular-nums ' +
          (bold ? 'font-bold text-ink' : accent ? 'font-semibold text-green-700' : 'font-medium')
        }
      >
        {value}
      </span>
    </div>
  );
}

function fmt(v: number | string) {
  return Number(v).toLocaleString('uz');
}
