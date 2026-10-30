'use client';
import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { KeyRound, Save } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

/** Change the logged-in admin's / coordinator's own password. */
export default function PasswordPage() {
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      if (next.length < 6) throw new Error('Yangi parol kamida 6 belgi bo‘lsin');
      if (next !== repeat) throw new Error('Yangi parollar bir xil emas');
      return (
        await api.post('/auth/change-password', {
          currentPassword: current,
          newPassword: next,
        })
      ).data;
    },
    onSuccess: () => {
      setMsg({ ok: true, text: 'Parol o‘zgartirildi' });
      setCurrent('');
      setNext('');
      setRepeat('');
    },
    onError: (e: any) => {
      setMsg({
        ok: false,
        text: e?.response?.data?.message ?? e?.message ?? 'Xato',
      });
    },
  });

  return (
    <Shell title="Parolni o‘zgartirish" subtitle="Hisobingiz uchun yangi parol">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setMsg(null);
          save.mutate();
        }}
        className="card p-5 max-w-md space-y-4"
      >
        <div className="flex items-center gap-2 text-gold-deep">
          <KeyRound size={18} />
          <h3 className="font-bold text-ink">Yangi parol</h3>
        </div>
        <Field label="Joriy parol">
          <input
            type="password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="input"
            autoComplete="current-password"
            required
          />
        </Field>
        <Field label="Yangi parol">
          <input
            type="password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="input"
            autoComplete="new-password"
            required
          />
        </Field>
        <Field label="Yangi parolni takrorlang">
          <input
            type="password"
            value={repeat}
            onChange={(e) => setRepeat(e.target.value)}
            className="input"
            autoComplete="new-password"
            required
          />
        </Field>
        {msg && (
          <p className={'text-sm ' + (msg.ok ? 'text-green-700' : 'text-red-600')}>
            {msg.text}
          </p>
        )}
        <button type="submit" disabled={save.isPending} className="btn-primary">
          <Save size={16} /> {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
        </button>
      </form>
    </Shell>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="label">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
