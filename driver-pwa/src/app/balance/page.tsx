'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Wallet } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface BalanceTx {
  id: string;
  amount: string;
  type: string;
  note: string | null;
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

  useEffect(() => {
    api
      .get('/driver/balance')
      .then((r) => {
        setBalance(r.data.balance);
        setTxs(r.data.transactions);
      })
      .finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => calcSummary(txs), [txs]);

  return (
    <>
      {/* HERO */}
      <header className="relative bg-ink text-white px-6 pt-6 pb-12 rounded-b-3xl overflow-hidden">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 20% 100%, rgba(250,204,21,0.45), transparent 60%)',
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
        <p className="relative mt-3 text-5xl font-extrabold tabular-nums">
          {fmt(balance)}
        </p>
        <p className="relative text-sm text-neutral-400 mt-1">so‘m</p>
      </header>

      {/* PERIOD STATS */}
      <section className="px-6 -mt-6 relative z-10">
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
                  {t.note && (
                    <p className="text-xs text-neutral-500 mt-1 line-clamp-1">
                      {t.note}
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
    <div className="bg-white border border-line rounded-2xl p-3 shadow-sm">
      <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold tabular-nums">
        {fmt(value)}
        <span className="ml-1 text-[10px] font-normal text-neutral-500">so‘m</span>
      </p>
    </div>
  );
}

function calcSummary(txs: BalanceTx[]) {
  const now = Date.now();
  const day = startOfDay();
  const week = now - 7 * 24 * 3600_000;
  const month = now - 30 * 24 * 3600_000;
  let d = 0,
    w = 0,
    m = 0;
  for (const t of txs) {
    if (t.type !== 'COMMISSION') continue; // earnings only
    const at = new Date(t.createdAt).getTime();
    const amt = Number(t.amount);
    if (amt <= 0) continue;
    if (at >= day) d += amt;
    if (at >= week) w += amt;
    if (at >= month) m += amt;
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
    COMMISSION: 'Buyurtmadan daromad',
    TOPUP: 'Balans to‘ldirildi',
    WITHDRAW: 'Yechib olindi',
    ADJUSTMENT: 'Tuzatish',
  };
  return m[t] ?? t;
}
function fmt(v: string | number) {
  return Number(v).toLocaleString('uz');
}
function fmtDateTime(s: string) {
  const d = new Date(s);
  return (
    d.toLocaleDateString('uz', { day: '2-digit', month: 'short' }) +
    ' · ' +
    d.toLocaleTimeString('uz', { hour: '2-digit', minute: '2-digit' })
  );
}
