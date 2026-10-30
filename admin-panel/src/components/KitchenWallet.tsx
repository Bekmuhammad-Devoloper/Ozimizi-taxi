'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Loader2, Wallet } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import { apiError, som, type KitchenWallet } from '@/lib/food';

/** Kitchen wallet query. `base` = `/admin/food/kitchens/<id>` or `/kitchen`. */
export function useKitchenWallet(base: string, refetchInterval: number | false = 30_000) {
  return useQuery({
    queryKey: ['kitchen-wallet', base],
    queryFn: async () => (await api.get<KitchenWallet>(`${base}/wallet`)).data,
    refetchInterval,
  });
}

/**
 * Kitchen balance + movements. With `canAdjust` (admin) also a
 * "Pul tashlash / Yechib olish" form (`POST <base>/balance`).
 */
export function KitchenWalletCard({
  base,
  canAdjust = false,
  className = '',
}: {
  base: string;
  canAdjust?: boolean;
  className?: string;
}) {
  const qc = useQueryClient();
  const { data, isLoading, isError, error } = useKitchenWallet(base);
  const [mode, setMode] = useState<'add' | 'take'>('add');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const adjust = useMutation({
    mutationFn: async () => {
      const n = Math.round(Number(amount));
      if (!Number.isFinite(n) || n <= 0) throw new Error('Summani kiriting');
      return (
        await api.post<KitchenWallet>(`${base}/balance`, {
          amount: mode === 'take' ? -n : n,
          note: note.trim() || undefined,
        })
      ).data;
    },
    onSuccess: (w) => {
      qc.setQueryData(['kitchen-wallet', base], w);
      qc.invalidateQueries({ queryKey: ['food-kitchens'] });
      setMsg({
        ok: true,
        text: `${mode === 'take' ? 'Yechildi' : 'Tashlandi'}: ${som(amount)} so‘m · yangi balans ${som(w.balance)} so‘m`,
      });
      setAmount('');
      setNote('');
    },
    onError: (e) => setMsg({ ok: false, text: apiError(e) }),
  });

  const balance = data?.balance ?? 0;
  const negative = balance < 0;

  return (
    <section className={'card p-4 sm:p-5 ' + className}>
      <div className="flex items-start gap-3 mb-3">
        <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
          <Wallet size={18} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="font-bold">Hamyon</p>
          <p className="text-xs text-neutral-500">
            Balansni admin to‘ldiradi; har yetkazilgan buyurtmadan komissiya shu yerdan yechiladi.
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : isError ? (
        <p className="text-sm text-red-600">Balansni yuklab bo‘lmadi: {apiError(error)}</p>
      ) : (
        <>
          <div
            className={
              'rounded-xl border px-4 py-3 mb-3 ' +
              (negative ? 'bg-red-50 border-red-200' : 'bg-neutral-50 border-line')
            }
          >
            <p className="label">Joriy balans</p>
            <p
              className={
                'text-2xl font-extrabold tabular-nums mt-0.5 ' + (negative ? 'text-red-600' : 'text-ink')
              }
            >
              {som(balance)} <span className="text-sm font-semibold text-neutral-500">so‘m</span>
            </p>
            {negative && (
              <p className="text-[11px] text-red-600 mt-1">
                Balans manfiy — komissiya qarzi. Admin balansni to‘ldirishi kerak.
              </p>
            )}
          </div>

          {canAdjust && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setMsg(null);
                adjust.mutate();
              }}
              className="rounded-xl border border-line p-3 mb-3 space-y-2"
            >
              <div className="flex rounded-lg border border-line overflow-hidden">
                {(
                  [
                    ['add', 'Pul tashlash', ArrowDownLeft],
                    ['take', 'Yechib olish', ArrowUpRight],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setMode(value)}
                    className={
                      'flex-1 h-9 text-xs font-bold inline-flex items-center justify-center gap-1.5 ' +
                      (mode === value
                        ? value === 'add'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-red-600 text-white'
                        : 'bg-white text-neutral-500 hover:bg-neutral-50')
                    }
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-[160px_minmax(0,1fr)] gap-2">
                <input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^\d]/g, '').slice(0, 10))}
                  inputMode="numeric"
                  placeholder="Summa, so‘m"
                  className="input tabular-nums"
                />
                <input
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={200}
                  placeholder="Izoh (ixtiyoriy)"
                  className="input"
                />
              </div>
              <div className="flex items-center gap-3 flex-wrap">
                <button type="submit" disabled={adjust.isPending || !amount} className="btn-primary">
                  {adjust.isPending ? <Loader2 size={15} className="animate-spin" /> : null}
                  {mode === 'take' ? 'Yechib olish' : 'Pul tashlash'}
                </button>
                {msg && (
                  <span className={'text-xs ' + (msg.ok ? 'text-emerald-700' : 'text-red-600')}>{msg.text}</span>
                )}
              </div>
            </form>
          )}

          <p className="label mb-1.5">Harakatlar</p>
          {!data?.ledger?.length ? (
            <p className="text-xs text-neutral-500 py-3">Hali harakat yo‘q.</p>
          ) : (
            <ul className="divide-y divide-line border border-line rounded-xl max-h-[420px] overflow-y-auto">
              {data.ledger.map((r) => {
                const plus = Number(r.amount) > 0;
                return (
                  <li key={r.id} className="px-3 py-2 flex items-start gap-3">
                    <span
                      className={
                        'mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ' +
                        (plus ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600')
                      }
                    >
                      {plus ? <ArrowDownLeft size={14} /> : <ArrowUpRight size={14} />}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-ink break-words">
                        {r.note || (plus ? 'Balans to‘ldirildi' : 'Balansdan yechildi')}
                      </p>
                      <p className="text-[10px] text-neutral-500">{fmtDateTime(r.createdAt)}</p>
                    </div>
                    <span
                      className={
                        'text-sm font-bold tabular-nums whitespace-nowrap ' +
                        (plus ? 'text-emerald-700' : 'text-red-600')
                      }
                    >
                      {plus ? '+' : '−'}
                      {som(Math.abs(Number(r.amount)))}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
