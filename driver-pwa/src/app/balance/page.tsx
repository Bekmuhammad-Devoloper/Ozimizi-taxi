'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/date';
import { FitText } from '@/components/FitText';

interface BalanceTx {
  id: string;
  amount: string;
  type: string;
  note: string | null;
  orderId?: string | null;
  createdAt: string;
}

interface HistoryOrder {
  status: string;
  price: string | null;
  commission: string | null;
  completedAt: string | null;
  createdAt: string;
}

export default function BalancePage() {
  return (
    <Shell>
      <Inner />
    </Shell>
  );
}

function Inner() {
  const router = useRouter();
  const [balance, setBalance] = useState<string>('0');
  const [txs, setTxs] = useState<BalanceTx[]>([]);
  const [loading, setLoading] = useState(true);
  const [history, setHistory] = useState<HistoryOrder[]>([]);

  useEffect(() => {
    api
      .get('/driver/balance')
      .then((r) => {
        setBalance(r.data.balance);
        setTxs(r.data.transactions);
      })
      .finally(() => setLoading(false));
    api
      .get<HistoryOrder[]>('/driver/orders/history')
      .then((r) => setHistory(r.data))
      .catch(() => {});
  }, []);

  const summary = useMemo(() => calcSummary(history), [history]);
  const negative = Number(balance) < 0;

  return (
    <>
      {/* HERO */}
      <header className="relative bg-ink text-white px-6 pt-6 pb-12 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 20% 100%, rgba(59,155,255,0.45), transparent 60%)',
          }}
        />
        <button
          type="button"
          onClick={() => router.back()}
          className="relative -ml-2 mb-4 inline-flex items-center gap-1.5 px-2 py-1.5 text-sm text-neutral-300 active:text-white"
        >
          <ArrowLeft size={18} /> Orqaga
        </button>
        <div className="relative flex items-center gap-2 text-gold">
          <Wallet size={18} />
          <p className="text-xs uppercase tracking-widest font-bold">
            Joriy balans
          </p>
        </div>
        <FitText
          className={
            'relative mt-3 text-5xl font-extrabold tabular-nums ' +
            (negative ? 'text-red-400' : '')
          }
        >
          {fmt(balance)}
        </FitText>
        <p className="relative text-sm text-neutral-400 mt-1">so‘m</p>
        {negative && (
          <p className="relative mt-3 text-xs text-red-200 bg-red-500/15 border border-red-400/30 rounded-xl px-3 py-2 leading-relaxed">
            Balansingiz manfiy — bu buyurtmalar komissiyasidan qolgan qarz.
            Iltimos, balansni to‘ldiring.
          </p>
        )}
      </header>

      {/* PERIOD STATS */}
      <section className="px-6 -mt-6 relative z-10">
        <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold mb-2 mt-8">
          Sof daromad (naqd − komissiya)
        </p>
        <div className="grid grid-cols-3 gap-2">
          <PeriodCard label="Bugun" value={summary.day} />
          <PeriodCard label="Hafta" value={summary.week} />
          <PeriodCard label="Oy" value={summary.month} />
        </div>
      </section>

      {/* TX LIST */}
      <section className="px-6 mt-8">
        <h2 className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-3">
          Tranzaksiyalar
        </h2>
        {loading && <p className="text-sm text-neutral-500">Yuklanmoqda…</p>}
        {!loading && txs.length === 0 && (
          <p className="text-sm text-neutral-500">Tranzaksiyalar yo‘q</p>
        )}
        <ul className="space-y-2">
          {txs.map((t) => {
            const amt = Number(t.amount);
            const positive = amt >= 0;
            return (
              <li
                key={t.id}
                className="bg-white border border-line rounded-2xl p-4 flex items-start gap-3"
              >
                <div
                  className={
                    'w-9 h-9 shrink-0 rounded-full flex items-center justify-center ' +
                    (positive
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-600')
                  }
                >
                  {positive ? (
                    <ArrowDownLeft size={18} />
                  ) : (
                    <ArrowUpRight size={18} />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium">{labelTx(t.type)}</p>
                  <p className="text-xs text-neutral-500 mt-0.5">
                    {fmtDateTime(t.createdAt)}
                  </p>
                  {txDetail(t) && (
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                      {txDetail(t)}
                    </p>
                  )}
                </div>
                <p
                  className={
                    'tabular-nums font-semibold ' +
                    (positive ? 'text-green-700' : 'text-red-600')
                  }
                >
                  {positive ? '+' : ''}
                  {amt.toLocaleString('uz')}
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    </>
  );
}

function PeriodCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-line rounded-2xl p-3 shadow-sm min-w-0">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </p>
      {/* The unit on its own line: the number gets the card's whole width. */}
      <FitText className="mt-1 text-lg font-bold tabular-nums leading-tight">{fmt(value)}</FitText>
      <p className="text-[10px] text-neutral-500 leading-tight">so‘m</p>
    </div>
  );
}

/** Net earnings per period from completed rides: fare (cash) − commission. */
function calcSummary(history: HistoryOrder[]) {
  const now = Date.now();
  const day = startOfDay();
  const week = now - 7 * 24 * 3600_000;
  const month = now - 30 * 24 * 3600_000;
  let d = 0,
    w = 0,
    m = 0;
  for (const o of history) {
    if (o.status !== 'COMPLETED') continue;
    const at = new Date(o.completedAt ?? o.createdAt).getTime();
    const net = Number(o.price ?? 0) - Number(o.commission ?? 0);
    if (at >= day) d += net;
    if (at >= week) w += net;
    if (at >= month) m += net;
  }
  return { day: d, week: w, month: m };
}
function startOfDay() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}
function labelTx(t: string) {
  const m: Record<string, string> = {
    COMMISSION: 'Buyurtma komissiyasi',
    TOPUP: 'Balans to‘ldirildi',
    WITHDRAW: 'Yechib olindi',
    ADJUSTMENT: 'Tuzatish',
  };
  return m[t] ?? t;
}
function txDetail(t: BalanceTx): string | null {
  if (t.orderId) {
    const ref = `Buyurtma #${t.orderId.slice(0, 8).toUpperCase()}`;
    if (t.type === 'ADJUSTMENT' && t.note?.startsWith('Promo')) {
      return `${ref} · promo chegirma qaytarildi`;
    }
    return ref;
  }
  return t.note;
}
function fmt(v: string | number) {
  return Number(v).toLocaleString('uz');
}
