'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  BellRing,
  Bike,
  CarFront,
  CheckCircle2,
  Loader2,
  RefreshCw,
  Search,
  Send,
  Smartphone,
  AlertTriangle,
  X,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { StatsCard } from '@/components/StatsCard';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

interface DriverVersionRow {
  id: string;
  fullName: string;
  phone: string;
  kind: 'taxi' | 'courier';
  isOnline: boolean;
  appVersion: string | null;
  appPlatform: string | null;
  appSeenAt: string | null;
}

interface VersionsResponse {
  latest: string | null;
  drivers: DriverVersionRow[];
}

type VState = 'latest' | 'old' | 'unknown';

/** Same rule as the backend: non-numeric ("web") or missing = outdated. */
function versionState(v: string | null, latest: string | null): VState {
  if (!v || !/^\d+(\.\d+)*$/.test(v)) return 'old';
  if (!latest) return 'unknown';
  const a = v.split('.').map(Number);
  const b = latest.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if ((a[i] ?? 0) !== (b[i] ?? 0)) return (a[i] ?? 0) < (b[i] ?? 0) ? 'old' : 'latest';
  }
  return 'latest';
}

/** "5 daq oldin", "3 soat oldin", "2 kun oldin". */
function ago(s: string | null, now: number): string {
  if (!s) return '';
  const t = new Date(s).getTime();
  if (Number.isNaN(t)) return '';
  const m = Math.max(0, Math.floor((now - t) / 60000));
  if (m < 1) return 'hozirgina';
  if (m < 60) return `${m} daq oldin`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.floor(h / 24)} kun oldin`;
}

const apiErr = (e: any) => {
  const m = e?.response?.data?.message ?? e?.message;
  return Array.isArray(m) ? m.join(', ') : m || 'Xato';
};

export default function DriverVersionsPage() {
  const [filter, setFilter] = useState<'all' | 'old' | 'latest'>('all');
  const [q, setQ] = useState('');
  const [note, setNote] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [toast, setToast] = useState<{ ok: boolean; text: string } | null>(null);

  const { data, isLoading, isFetching, refetch } = useQuery({
    queryKey: ['drivers-versions'],
    queryFn: async () => (await api.get<VersionsResponse>('/admin/drivers-versions')).data,
    refetchInterval: 60_000,
  });

  const showToast = (t: { ok: boolean; text: string }) => {
    setToast(t);
    window.setTimeout(() => setToast((cur) => (cur === t ? null : cur)), 6000);
  };

  const request = useMutation({
    mutationFn: async (driverIds: string[]) =>
      (
        await api.post<{ sent: number; latest: string | null }>('/admin/drivers/request-update', {
          driverIds: driverIds.length ? driverIds : undefined,
          note: note.trim() || undefined,
        })
      ).data,
    onSuccess: (r, ids) => {
      if (ids.length > 1) setSelected([]);
      showToast({
        ok: true,
        text: r.sent
          ? `${r.sent} ta haydovchiga yangilash so‘rovi yuborildi${r.latest ? ` · oxirgi versiya ${r.latest}` : ''}`
          : 'Yuboriladigan haydovchi topilmadi — hammasi yangi versiyada',
      });
    },
    onError: (e) => showToast({ ok: false, text: apiErr(e) }),
  });

  const latest = data?.latest ?? null;
  const now = Date.now();
  const rows = useMemo(
    () => (data?.drivers ?? []).map((d) => ({ ...d, state: versionState(d.appVersion, latest) })),
    [data, latest],
  );
  const counts = {
    all: rows.length,
    latest: rows.filter((r) => r.state === 'latest').length,
    old: rows.filter((r) => r.state === 'old').length,
  };
  const needle = q.trim().toLowerCase();
  const visible = rows.filter(
    (r) =>
      (filter === 'all' || r.state === filter) &&
      (!needle || r.fullName.toLowerCase().includes(needle) || r.phone.includes(needle)),
  );
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.includes(r.id));
  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const toggleAll = () =>
    setSelected((s) =>
      allVisibleSelected ? s.filter((id) => !visible.some((r) => r.id === id)) : [...new Set([...s, ...visible.map((r) => r.id)])],
    );

  const sendOne = (r: DriverVersionRow) => {
    if (confirm(`${r.fullName}ga ilovani yangilash so‘rovi yuborilsinmi?`)) request.mutate([r.id]);
  };
  const sendOutdated = () => {
    if (
      confirm(
        `Eski versiyadagi barcha faol haydovchilarga (${counts.old} ta) yangilash so‘rovi yuborilsinmi? Ilovada xabar va Telegram’da yuklab olish havolasi boradi.`,
      )
    )
      request.mutate([]);
  };
  const sendSelected = () => {
    if (confirm(`Tanlangan ${selected.length} ta haydovchiga yangilash so‘rovi yuborilsinmi?`)) request.mutate(selected);
  };

  return (
    <Shell
      title="Ilova versiyalari"
      subtitle={`Haydovchi ilovasi · oxirgi versiya: ${latest ?? 'aniqlanmadi'}`}
      actions={
        <button onClick={() => void refetch()} className="btn-secondary">
          <RefreshCw size={16} className={isFetching ? 'animate-spin' : ''} /> Yangilash
        </button>
      }
    >
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        <StatsCard title="Oxirgi versiya" value={latest ?? '—'} icon={Smartphone} accent="bg-ink text-gold" />
        <StatsCard title="Haydovchilar" value={counts.all} icon={CarFront} />
        <StatsCard
          title="Yangi versiyada"
          value={counts.latest}
          icon={CheckCircle2}
          accent="bg-emerald-50 text-emerald-700"
        />
        <StatsCard
          title="Eski / noma’lum"
          value={counts.old}
          icon={AlertTriangle}
          accent="bg-red-50 text-red-700"
          hint="“web” yoki versiya yo‘q ham shu yerda"
        />
      </section>

      <div className="card p-4 mb-4 space-y-3">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-end">
          <label className="block flex-1">
            <span className="label">Xabarga qo‘shimcha (ixtiyoriy)</span>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              placeholder="Masalan: yangi versiyada signal ovozi tuzatildi."
              className="input mt-1"
            />
          </label>
          <div className="flex gap-2 flex-wrap">
            {selected.length > 0 && (
              <button onClick={sendSelected} disabled={request.isPending} className="btn-secondary">
                <Send size={15} /> Tanlanganlarga ({selected.length})
              </button>
            )}
            <button onClick={sendOutdated} disabled={request.isPending || !counts.old} className="btn-primary">
              {request.isPending ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
              Eskilarga yuborish ({counts.old})
            </button>
          </div>
        </div>
        <p className="text-[11px] text-neutral-500">
          Haydovchiga ilovada “📲 Ilovani yangilang” xabari va (Telegram ma’lum bo‘lsa) botda yuklab olish havolasi
          boradi.
        </p>
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {(
          [
            ['all', 'Hammasi', counts.all],
            ['old', 'Eskilar', counts.old],
            ['latest', 'Yangilar', counts.latest],
          ] as const
        ).map(([value, label, n]) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={
              'px-3 h-8 text-[11px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
              (filter === value ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-500 border-line hover:border-ink')
            }
          >
            {label} <span className="opacity-70">({n})</span>
          </button>
        ))}
        <div className="flex items-center gap-2 h-9 px-3 rounded-lg border border-line bg-white ml-auto w-full sm:w-64">
          <Search size={15} className="text-neutral-400" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Ism yoki telefon…"
            className="flex-1 outline-none text-sm bg-transparent min-w-0"
          />
        </div>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-2">
        {isLoading && <p className="text-sm text-neutral-500 text-center py-8">Yuklanmoqda…</p>}
        {!isLoading && !visible.length && (
          <p className="text-sm text-neutral-500 text-center py-8">Haydovchi topilmadi</p>
        )}
        {visible.map((r) => (
          <div key={r.id} className="card p-3 flex items-start gap-3">
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              onChange={() => toggle(r.id)}
              className="mt-1 w-4 h-4 accent-ink"
              aria-label="Tanlash"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <DriverName r={r} />
                <VersionBadge v={r.appVersion} platform={r.appPlatform} state={r.state} />
              </div>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {r.phone} · {r.appSeenAt ? `${fmtDateTime(r.appSeenAt)} (${ago(r.appSeenAt, now)})` : 'ilovani ochmagan'}
              </p>
            </div>
            <button
              onClick={() => sendOne(r)}
              disabled={request.isPending}
              title="Yangilash so‘rovi"
              className="w-9 h-9 rounded-lg bg-neutral-100 text-ink flex items-center justify-center shrink-0 disabled:opacity-50"
            >
              <BellRing size={15} />
            </button>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="card overflow-hidden hidden lg:block">
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[900px]">
            <thead>
              <tr>
                <th className="th w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAll}
                    className="w-4 h-4 accent-ink"
                    aria-label="Hammasini tanlash"
                  />
                </th>
                <th className="th">Haydovchi</th>
                <th className="th">Turi</th>
                <th className="th">Versiya</th>
                <th className="th">Oxirgi kirish</th>
                <th className="th text-right">Amal</th>
              </tr>
            </thead>
            <tbody>
              {isLoading && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-neutral-500">
                    Yuklanmoqda…
                  </td>
                </tr>
              )}
              {!isLoading && !visible.length && (
                <tr>
                  <td colSpan={6} className="p-10 text-center text-neutral-500">
                    Haydovchi topilmadi
                  </td>
                </tr>
              )}
              {visible.map((r) => (
                <tr key={r.id} className="hover:bg-neutral-50 transition-colors">
                  <td className="td">
                    <input
                      type="checkbox"
                      checked={selected.includes(r.id)}
                      onChange={() => toggle(r.id)}
                      className="w-4 h-4 accent-ink"
                      aria-label="Tanlash"
                    />
                  </td>
                  <td className="td">
                    <DriverName r={r} />
                    <p className="text-[11px] font-mono text-neutral-500">{r.phone}</p>
                  </td>
                  <td className="td text-xs text-neutral-600">
                    <span className="inline-flex items-center gap-1">
                      {r.kind === 'courier' ? <Bike size={13} /> : <CarFront size={13} />}
                      {r.kind === 'courier' ? 'Kuryer' : 'Taksi'}
                    </span>
                  </td>
                  <td className="td">
                    <VersionBadge v={r.appVersion} platform={r.appPlatform} state={r.state} />
                  </td>
                  <td className="td text-xs text-neutral-600 whitespace-nowrap">
                    {r.appSeenAt ? (
                      <>
                        {fmtDateTime(r.appSeenAt)}
                        <span className="block text-[10px] text-neutral-400">{ago(r.appSeenAt, now)}</span>
                      </>
                    ) : (
                      <span className="text-neutral-300">ilovani ochmagan</span>
                    )}
                  </td>
                  <td className="td text-right">
                    <button
                      onClick={() => sendOne(r)}
                      disabled={request.isPending}
                      className="h-8 px-3 rounded-lg bg-neutral-100 hover:bg-neutral-200 text-xs font-bold inline-flex items-center gap-1.5 disabled:opacity-50"
                    >
                      <BellRing size={13} /> Yangilash so‘rovi
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {toast && (
        <div
          className={
            'fixed bottom-4 left-4 z-50 max-w-[calc(100vw-2rem)] sm:max-w-sm rounded-xl border shadow-lg px-4 py-3 flex items-start gap-2 text-sm ' +
            (toast.ok ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-red-50 text-red-700 border-red-200')
          }
        >
          {toast.ok ? <CheckCircle2 size={18} className="shrink-0 mt-0.5" /> : <AlertTriangle size={18} className="shrink-0 mt-0.5" />}
          <p className="flex-1 font-medium">{toast.text}</p>
          <button onClick={() => setToast(null)} aria-label="Yopish" className="opacity-60 hover:opacity-100">
            <X size={16} />
          </button>
        </div>
      )}
    </Shell>
  );
}

function DriverName({ r }: { r: DriverVersionRow }) {
  return (
    <Link href={`/drivers/${r.id}`} className="font-semibold hover:underline inline-flex items-center gap-1.5">
      <span
        title={r.isOnline ? 'Liniyada' : 'Liniyada emas'}
        className={'w-2 h-2 rounded-full shrink-0 ' + (r.isOnline ? 'bg-emerald-500' : 'bg-neutral-300')}
      />
      {r.fullName}
    </Link>
  );
}

function VersionBadge({ v, platform, state }: { v: string | null; platform: string | null; state: VState }) {
  const cls =
    state === 'latest'
      ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
      : state === 'old'
        ? 'bg-red-50 text-red-700 border-red-200'
        : 'bg-neutral-100 text-neutral-600 border-neutral-200';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={'inline-flex items-center px-2 py-0.5 rounded-full border text-[11px] font-bold font-mono ' + cls}
        title={state === 'latest' ? 'Oxirgi versiya' : state === 'old' ? 'Eski yoki noma’lum versiya' : ''}
      >
        {v || 'noma’lum'}
      </span>
      {platform && <span className="text-[10px] text-neutral-500 uppercase tracking-wider">{platform}</span>}
    </span>
  );
}
