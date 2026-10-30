'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShieldCheck, Wallet, ArrowDownLeft, KeyRound, Users, Search, Copy, Download } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface CoordinatorRow {
  id: string;
  username: string;
  role: 'coordinator';
  balance: string;
  createdAt: string;
}

export default function CoordinatorsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [allocating, setAllocating] = useState<CoordinatorRow | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [creds, setCreds] = useState<{ username: string; password: string }[] | null>(null);
  const [q, setQ] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['coordinators'],
    queryFn: async () =>
      (await api.get<CoordinatorRow[]>('/admin/coordinators')).data,
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/coordinators/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['coordinators'] }),
  });

  const resetPw = useMutation({
    mutationFn: async (c: CoordinatorRow) =>
      (await api.post(`/admin/coordinators/${c.id}/password`, {})).data,
    onSuccess: (d: { username: string; password: string }) => setCreds([d]),
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Xato'),
  });

  const list = (data ?? []).filter((t) => !q.trim() || t.username.includes(q.trim().toLowerCase()));

  return (
    <Shell
      title="Koordinatorlar"
      subtitle={`Pul tashlash huquqiga ega yordamchilar · jami ${data?.length ?? 0} ta`}
      actions={
        <div className="flex gap-2">
          <button onClick={() => setBulkOpen(true)} className="btn-secondary">
            <Users size={16} /> Ommaviy qo‘shish
          </button>
          <button onClick={() => setCreateOpen(true)} className="btn-primary">
            <Plus size={16} /> Yangi
          </button>
        </div>
      }
    >
      <div className="card p-3 mb-3 max-w-2xl flex items-center gap-2">
        <Search size={16} className="text-neutral-400 ml-1" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Username bo‘yicha qidirish…"
          className="flex-1 h-9 outline-none text-sm"
        />
        <span className="text-xs text-neutral-500">{list.length} ta</span>
      </div>
      <p className="text-xs text-neutral-500 mb-3 max-w-2xl">
        Koordinator <b>moviytaxi.uz/admin/login</b> sahifasida yoki Telegram’dagi wallet bot (Mini App) orqali
        shu username va parol bilan kiradi. Username kichik harflarda saqlanadi.
      </p>
      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <ShieldCheck size={28} className="mx-auto mb-2 text-neutral-300" />
          Hozircha koordinator yo‘q.
          <br />
          “Yangi” tugmasini bosib qo‘shing.
        </div>
      ) : (
        <ul className="space-y-2 max-w-2xl">
          {list.map((t) => (
            <li
              key={t.id}
              className="card p-4 flex items-center gap-3 flex-wrap"
            >
              <span className="w-10 h-10 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold shrink-0">
                {t.username.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex-1 min-w-[140px]">
                <p className="font-semibold">{t.username}</p>
                <p className="text-xs text-neutral-500">
                  Yaratilgan:{' '}
                  {fmtDate(t.createdAt)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[10px] uppercase tracking-widest text-neutral-500 font-bold">
                  Hamyon
                </p>
                <p className="font-bold tabular-nums text-gold-deep">
                  {Number(t.balance ?? 0).toLocaleString('uz')}
                  <span className="text-[10px] text-neutral-500 ml-1 font-normal">
                    so‘m
                  </span>
                </p>
              </div>
              <button
                onClick={() => {
                  if (confirm(`${t.username} uchun yangi parol yaratilsinmi? Eski parol ishlamay qoladi.`))
                    resetPw.mutate(t);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-amber-50 text-amber-700"
                title="Parolni yangilash"
              >
                <KeyRound size={16} />
              </button>
              <button
                onClick={() => setAllocating(t)}
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50 text-green-700"
                title="Pul ajratish / qaytarish"
              >
                <Wallet size={16} />
              </button>
              <button
                onClick={() => {
                  if (confirm(`${t.username} o'chirilsinmi?`))
                    remove.mutate(t.id);
                }}
                className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600"
                title="O‘chirish"
              >
                <Trash2 size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}

      {createOpen && <CreateModal onClose={() => setCreateOpen(false)} />}
      {bulkOpen && (
        <BulkModal
          onClose={() => setBulkOpen(false)}
          onDone={(rows) => {
            setBulkOpen(false);
            setCreds(rows);
          }}
        />
      )}
      {creds && <CredsModal rows={creds} onClose={() => setCreds(null)} />}
      {allocating && (
        <AllocateModal
          coord={allocating}
          onClose={() => setAllocating(null)}
        />
      )}
    </Shell>
  );
}

function AllocateModal({
  coord,
  onClose,
}: {
  coord: CoordinatorRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'give' | 'pullback'>('give');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      const a = Number(amount);
      if (!Number.isFinite(a) || a <= 0) throw new Error('Summa noto‘g‘ri');
      const signed = mode === 'give' ? a : -a;
      return (
        await api.post(`/admin/coordinators/${coord.id}/allocate`, {
          amount: signed,
          note,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coordinators'] });
      qc.invalidateQueries({ queryKey: ['stats'] });
      onClose();
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Xato');
    },
  });

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <div>
            <h3 className="font-semibold text-lg">{coord.username}</h3>
            <p className="text-xs text-neutral-500">
              Joriy hamyon:{' '}
              <b className="text-gold-deep">
                {Number(coord.balance ?? 0).toLocaleString('uz')} so‘m
              </b>
            </p>
          </div>
          <button onClick={onClose} className="text-slate-500">
            ✕
          </button>
        </div>

        <div className="flex gap-2 mb-4">
          <button
            onClick={() => setMode('give')}
            className={
              'flex-1 h-10 rounded-lg font-bold text-sm flex items-center justify-center gap-1 ' +
              (mode === 'give'
                ? 'bg-green-600 text-white'
                : 'bg-neutral-100 text-neutral-500')
            }
            type="button"
          >
            <Wallet size={16} /> Pul ajratish
          </button>
          <button
            onClick={() => setMode('pullback')}
            className={
              'flex-1 h-10 rounded-lg font-bold text-sm flex items-center justify-center gap-1 ' +
              (mode === 'pullback'
                ? 'bg-red-600 text-white'
                : 'bg-neutral-100 text-neutral-500')
            }
            type="button"
          >
            <ArrowDownLeft size={16} /> Qaytarish
          </button>
        </div>

        <label className="block mb-3">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
            Summa (so‘m)
          </span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
            placeholder="0"
            inputMode="numeric"
            className="input mt-1 tabular-nums text-lg font-bold"
          />
        </label>

        <label className="block mb-3">
          <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
            Izoh (ixtiyoriy)
          </span>
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Masalan: aprel limiti"
            className="input mt-1"
          />
        </label>

        {err && <p className="text-sm text-red-600 mb-2">{err}</p>}

        <button
          onClick={() => {
            setErr(null);
            mut.mutate();
          }}
          disabled={mut.isPending}
          className="w-full h-11 bg-ink text-gold rounded-lg font-bold disabled:opacity-60"
        >
          {mut.isPending ? 'Yuborilmoqda…' : 'Tasdiqlash'}
        </button>
      </div>
    </div>
  );
}

function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [created, setCreated] = useState<{
    username: string;
    password: string;
  } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!username.trim()) throw new Error('Username kerak');
      if (password.length < 6) throw new Error('Parol kamida 6 belgi');
      return (
        await api.post('/admin/coordinators', {
          username: username.trim().toLowerCase(),
          password,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['coordinators'] });
      setCreated({ username: username.trim().toLowerCase(), password });
    },
    onError: (e: any) => {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Xato');
    },
  });

  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">Yangi koordinator</h3>
          <button onClick={onClose} className="text-slate-500">
            ✕
          </button>
        </div>

        {!created ? (
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm text-slate-500">Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/\s/g, ''))}
                className="mt-1 w-full h-10 px-3 border rounded font-mono"
                placeholder="kassir1"
              />
              <span className="text-[11px] text-slate-400">Kamida 3 belgi: lotin harfi, raqam, _ . -</span>
            </label>
            <label className="block">
              <span className="text-sm text-slate-500">Parol</span>
              <div className="flex gap-2 mt-1">
                <input
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="flex-1 h-10 px-3 border rounded font-mono"
                />
                <button
                  type="button"
                  onClick={() => setPassword(genPassword())}
                  className="px-3 h-10 border rounded text-sm"
                >
                  Random
                </button>
              </div>
            </label>
            {err && <p className="text-red-600 text-sm">{err}</p>}
            <button
              disabled={mut.isPending}
              onClick={() => {
                setErr(null);
                mut.mutate();
              }}
              className="w-full h-10 bg-ink text-gold rounded font-semibold"
            >
              Yaratish
            </button>
          </div>
        ) : (
          <div className="space-y-3 text-center">
            <p className="text-slate-600">
              Koordinatorga login ma'lumotlarni yetkazing:
            </p>
            <div className="text-sm text-left bg-slate-50 p-3 rounded space-y-1">
              <p>
                👤 <b>{created.username}</b>
              </p>
            </div>
            <p className="text-xs text-slate-500">Parol:</p>
            <p className="text-2xl font-mono font-bold bg-slate-100 py-4 px-2 rounded break-all">
              {created.password}
            </p>
            <button
              onClick={onClose}
              className="w-full h-10 bg-ink text-gold rounded font-semibold"
            >
              Yopish
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}

const LOGIN_URL = 'https://moviytaxi.uz/admin/login';

function BulkModal({
  onClose,
  onDone,
}: {
  onClose: () => void;
  onDone: (rows: { username: string; password: string }[]) => void;
}) {
  const qc = useQueryClient();
  const [prefix, setPrefix] = useState('kassir');
  const [count, setCount] = useState('100');
  const [start, setStart] = useState('1');
  const [err, setErr] = useState<string | null>(null);
  const mut = useMutation({
    mutationFn: async () =>
      (
        await api.post(
          '/admin/coordinators/bulk',
          { prefix: prefix.trim().toLowerCase(), count: Number(count), start: Number(start) || 1 },
          { timeout: 300_000 },
        )
      ).data as { created: { username: string; password: string }[] },
    onSuccess: (d) => {
      qc.invalidateQueries({ queryKey: ['coordinators'] });
      onDone(d.created);
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? e?.message ?? 'Xato'),
  });
  const n = Number(count) || 0;
  const s0 = Number(start) || 1;
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Ommaviy koordinator qo‘shish</h3>
          <button onClick={onClose} className="text-slate-500">✕</button>
        </div>
        <label className="block">
          <span className="text-sm text-slate-500">Prefiks (username boshi)</span>
          <input
            value={prefix}
            onChange={(e) => setPrefix(e.target.value.toLowerCase().replace(/[^a-z0-9_.-]/g, ''))}
            className="mt-1 w-full h-10 px-3 border rounded font-mono"
          />
        </label>
        <div className="grid grid-cols-2 gap-3">
          <label className="block">
            <span className="text-sm text-slate-500">Nechta (1–300)</span>
            <input value={count} onChange={(e) => setCount(e.target.value.replace(/\D/g, ''))} className="mt-1 w-full h-10 px-3 border rounded tabular-nums" />
          </label>
          <label className="block">
            <span className="text-sm text-slate-500">Raqam boshlanishi</span>
            <input value={start} onChange={(e) => setStart(e.target.value.replace(/\D/g, ''))} className="mt-1 w-full h-10 px-3 border rounded tabular-nums" />
          </label>
        </div>
        <p className="text-xs text-slate-500">
          Yaratiladi: <b className="font-mono">{prefix}{s0}</b> … <b className="font-mono">{prefix}{s0 + Math.max(0, n - 1)}</b>{' '}
          (band bo‘lganlari o‘tkazib yuboriladi), har biriga 8 belgili parol. Login va parollar ro‘yxati keyingi oynada chiqadi — CSV qilib yuklab oling.
        </p>
        {err && <p className="text-red-600 text-sm">{err}</p>}
        <button
          disabled={mut.isPending}
          onClick={() => {
            setErr(null);
            mut.mutate();
          }}
          className="w-full h-11 bg-ink text-gold rounded-lg font-bold disabled:opacity-60"
        >
          {mut.isPending ? `Yaratilmoqda… (${n} ta, 1–2 daqiqa)` : `${n} ta yaratish`}
        </button>
      </div>
    </div>
  );
}

/** Credentials shown once after bulk create / password reset. */
function CredsModal({
  rows,
  onClose,
}: {
  rows: { username: string; password: string }[];
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = rows.map((r) => `${r.username}\t${r.password}`).join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`Kirish: ${LOGIN_URL}\n` + text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  const download = () => {
    const csv = 'username,parol,kirish\n' + rows.map((r) => `${r.username},${r.password},${LOGIN_URL}`).join('\n');
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `koordinatorlar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-3">
        <div className="flex justify-between items-center">
          <h3 className="font-semibold text-lg">Login va parollar ({rows.length} ta)</h3>
          <button onClick={onClose} className="text-slate-500">✕</button>
        </div>
        <p className="text-xs text-red-600 font-semibold">
          Parollar faqat hozir ko‘rinadi — yopishdan oldin nusxalang yoki CSV yuklab oling.
        </p>
        <div className="max-h-80 overflow-auto border rounded-lg">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 sticky top-0">
              <tr className="text-left text-[11px] uppercase text-slate-500">
                <th className="px-3 py-2">Username</th>
                <th className="px-3 py-2">Parol</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.username} className="border-t">
                  <td className="px-3 py-1.5 font-mono">{r.username}</td>
                  <td className="px-3 py-1.5 font-mono font-bold">{r.password}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-500">Kirish: {LOGIN_URL} yoki Telegram wallet bot (Mini App)</p>
        <div className="flex gap-2">
          <button onClick={() => void copy()} className="flex-1 h-10 border rounded-lg font-semibold inline-flex items-center justify-center gap-1.5">
            <Copy size={14} /> {copied ? 'Nusxalandi' : 'Nusxalash'}
          </button>
          <button onClick={download} className="flex-1 h-10 bg-ink text-gold rounded-lg font-bold inline-flex items-center justify-center gap-1.5">
            <Download size={14} /> CSV yuklab olish
          </button>
        </div>
      </div>
    </div>
  );
}
