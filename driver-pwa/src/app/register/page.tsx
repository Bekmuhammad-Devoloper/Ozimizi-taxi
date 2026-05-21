'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, User, Phone, Lock } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { AuthShell } from '@/components/AuthShell';

function maskPhone(raw: string) {
  const digits = raw.replace(/\D/g, '').slice(0, 12);
  const withCc = digits.startsWith('998') ? digits : '998' + digits;
  const d = withCc.slice(0, 12);
  let out = '+998';
  if (d.length > 3) out += ' ' + d.slice(3, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 8);
  if (d.length > 8) out += ' ' + d.slice(8, 10);
  if (d.length > 10) out += ' ' + d.slice(10, 12);
  return out;
}

export default function RegisterPage() {
  const router = useRouter();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (fullName.trim().length < 2) {
      setError('Ismni to‘liq kiriting');
      return;
    }
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.length < 13) {
      setError('Telefon raqam to‘liq emas');
      return;
    }
    if (password.length < 6) {
      setError('Parol kamida 6 belgi');
      return;
    }
    if (password !== confirm) {
      setError('Parollar mos kelmadi');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/driver/register', {
        fullName: fullName.trim(),
        phone: cleanPhone,
        password,
      });
      setAuth(data.access_token, data.driver);
      router.replace('/dashboard');
    } catch (err: any) {
      const m = err?.response?.data?.message;
      setError(
        Array.isArray(m) ? m.join(', ') : m ?? 'Ro‘yxatdan o‘tib bo‘lmadi',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Yangi haydovchi hisobi">
      <form onSubmit={onSubmit} className="flex-1 flex flex-col">
        <div className="space-y-5">
          <Field icon={<User size={18} />} label="Ism familiya">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="input"
              autoComplete="name"
            />
          </Field>

          <Field icon={<Phone size={18} />} label="Telefon raqam">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              className="input"
              placeholder="+998 90 123 45 67"
              inputMode="numeric"
              autoComplete="tel"
            />
          </Field>

          <Field icon={<Lock size={18} />} label="Parol (kamida 6 belgi)">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-11"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-500"
              >
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          <Field icon={<Lock size={18} />} label="Parolni qaytaring">
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="input pr-11"
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowConfirm((v) => !v)}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-neutral-500"
              >
                {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </Field>

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
              {error}
            </div>
          )}
        </div>

        <div className="mt-auto pt-8 space-y-4">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Yaratilmoqda…' : 'Ro‘yxatdan o‘tish'}
          </button>
          <Link
            href="/login"
            className="block text-center text-sm text-neutral-500"
          >
            ← Hisobingiz bormi? Kirish
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}

function Field({
  icon,
  label,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
        <span className="text-neutral-400">{icon}</span>
        {label}
      </span>
      <div className="mt-2">{children}</div>
    </label>
  );
}
