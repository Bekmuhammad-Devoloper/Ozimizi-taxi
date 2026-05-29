'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, ShieldCheck } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface CoordinatorRow {
  id: string;
  username: string;
  role: 'coordinator';
  createdAt: string;
}

export default function CoordinatorsPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);

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

  return (
    <Shell
      title="Koordinatorlar"
      subtitle="Pul tashlash huquqiga ega super-admin yordamchilari (aylanmani ko‘rmaydi)"
      actions={
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <Plus size={16} /> Yangi
        </button>
      }
    >
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
          {data.map((t) => (
            <li
              key={t.id}
              className="card p-4 flex items-center gap-3"
            >
              <span className="w-10 h-10 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold">
                {t.username.slice(0, 2).toUpperCase()}
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold">{t.username}</p>
                <p className="text-xs text-neutral-500">
                  Yaratilgan:{' '}
                  {new Date(t.createdAt).toLocaleDateString('uz', {
                    day: '2-digit',
                    month: 'short',
                    year: '2-digit',
                  })}
                </p>
              </div>
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
    </Shell>
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
      setCreated({ username, password });
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
                onChange={(e) => setUsername(e.target.value)}
                className="mt-1 w-full h-10 px-3 border rounded"
                placeholder="kassir1"
              />
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
