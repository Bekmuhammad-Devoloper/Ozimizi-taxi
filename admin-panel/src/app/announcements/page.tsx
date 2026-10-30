'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Megaphone, Send, Users, Car, Globe } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

type Audience = 'all' | 'drivers' | 'clients';

interface Announcement {
  id: string;
  title: string;
  text: string;
  audience: Audience;
  sentClients: number;
  sentDrivers: number;
  createdAt: string;
}

const AUDIENCES: { key: Audience; label: string; hint: string; icon: React.ReactNode }[] = [
  { key: 'all', label: 'Hammaga', hint: 'haydovchilar + mijozlar', icon: <Globe size={14} /> },
  { key: 'drivers', label: 'Haydovchilarga', hint: 'ilovada bildirishnoma', icon: <Car size={14} /> },
  { key: 'clients', label: 'Mijozlarga', hint: 'Telegram bot orqali', icon: <Users size={14} /> },
];

export default function AnnouncementsPage() {
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [audience, setAudience] = useState<Audience>('all');
  const [msg, setMsg] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => (await api.get<Announcement[]>('/admin/announcements')).data,
    refetchInterval: 15_000,
  });

  const send = useMutation({
    mutationFn: async () =>
      (await api.post('/admin/announcements', { title, text, audience })).data,
    onSuccess: () => {
      setTitle('');
      setText('');
      setMsg('Yuborildi');
      setTimeout(() => setMsg(null), 2500);
      qc.invalidateQueries({ queryKey: ['announcements'] });
    },
    onError: (e: any) => setMsg(e?.response?.data?.message ?? 'Xato'),
  });

  return (
    <Shell title="Xabarnoma" subtitle="Haydovchilar va mijozlarga ommaviy xabar yuborish">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,420px)_1fr] gap-4 items-start">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!title.trim() || !text.trim()) return;
            if (!confirm(`${AUDIENCES.find((a) => a.key === audience)?.label} yuborilsinmi?`)) return;
            send.mutate();
          }}
          className="card p-5 space-y-4"
        >
          <div className="flex items-center gap-2 text-gold-deep">
            <Megaphone size={18} />
            <h3 className="font-bold text-ink">Yangi xabar</h3>
          </div>

          <div>
            <span className="label">Kimga</span>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {AUDIENCES.map((a) => (
                <button
                  type="button"
                  key={a.key}
                  onClick={() => setAudience(a.key)}
                  className={
                    'rounded-xl border p-2.5 text-left transition ' +
                    (audience === a.key
                      ? 'border-ink bg-ink text-gold'
                      : 'border-line bg-white text-neutral-600 hover:border-ink')
                  }
                >
                  <span className="flex items-center gap-1.5 text-xs font-bold">
                    {a.icon} {a.label}
                  </span>
                  <span className={'block text-[10px] mt-0.5 ' + (audience === a.key ? 'text-gold/70' : 'text-neutral-400')}>
                    {a.hint}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <label className="block">
            <span className="label">Sarlavha</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value.slice(0, 160))}
              placeholder="Masalan: Bayram kunlari ish tartibi"
              className="input mt-1"
              required
            />
          </label>
          <label className="block">
            <span className="label">Matn</span>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 2000))}
              rows={5}
              placeholder="Xabar matni…"
              className="input mt-1 h-auto py-2 resize-y"
              required
            />
            <span className="block text-right text-[11px] text-neutral-400 mt-1">{text.length}/2000</span>
          </label>

          <div className="flex items-center gap-3">
            <button type="submit" disabled={send.isPending} className="btn-primary">
              <Send size={16} /> {send.isPending ? 'Yuborilmoqda…' : 'Yuborish'}
            </button>
            {msg && <span className="text-sm text-neutral-600">{msg}</span>}
          </div>
        </form>

        <div>
          <p className="label mb-2">Yuborilganlar</p>
          {isLoading ? (
            <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
          ) : !data?.length ? (
            <div className="card p-8 text-center text-sm text-neutral-500">
              <Megaphone size={28} className="mx-auto mb-2 text-neutral-300" />
              Hali xabar yuborilmagan
            </div>
          ) : (
            <ul className="space-y-2">
              {data.map((a) => (
                <li key={a.id} className="card p-4">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm flex-1 min-w-0">{a.title}</p>
                    <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-gold/15 text-gold-deep">
                      {AUDIENCES.find((x) => x.key === a.audience)?.label ?? a.audience}
                    </span>
                    <span className="text-[11px] text-neutral-500">{fmtDateTime(a.createdAt)}</span>
                  </div>
                  <p className="mt-1.5 text-sm text-neutral-700 whitespace-pre-wrap">{a.text}</p>
                  <p className="mt-2 text-[11px] text-neutral-500">
                    {a.audience !== 'clients' && `Haydovchilar: ${a.sentDrivers} · `}
                    {a.audience !== 'drivers' && `Mijozlar: ${a.sentClients}`}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </Shell>
  );
}
