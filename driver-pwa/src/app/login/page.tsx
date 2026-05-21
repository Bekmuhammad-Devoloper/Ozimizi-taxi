'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Phone, Lock } from 'lucide-react';
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

export default function LoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+998 ');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const setAuth = useAuthStore((s) => s.setAuth);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.length < 13) {
      setError('Telefon raqam to‘liq emas');
      return;
    }
    if (password.length < 6) {
      setError('Parol kamida 6 belgi');
      return;
    }
    setLoading(true);
    try {
      const { data } = await api.post('/auth/driver/login', {
        phone: cleanPhone,
        password,
      });
      setAuth(data.access_token, data.driver);
      router.replace('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.message ?? 'Kirib bo‘lmadi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Haydovchi hisobiga kiring">
      <form onSubmit={onSubmit} className="flex-1 flex flex-col">
        <div className="space-y-5">
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

          <Field icon={<Lock size={18} />} label="Parol">
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input pr-11"
                placeholder="••••••"
                autoComplete="current-password"
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

          {error && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
              {error}
            </div>
          )}
        </div>

        <div className="mt-auto pt-10 space-y-4">
          <button
            type="submit"
            disabled={loading}
            className="btn-primary"
          >
            {loading ? 'Kuting…' : 'Kirish'}
          </button>

          <div className="flex flex-col items-center gap-3">
            <Link href="/forgot" className="text-sm text-neutral-500">
              Parolni unutdingizmi?
            </Link>
            <Link
              href="/register"
              className="text-sm font-medium text-ink underline underline-offset-4 decoration-gold decoration-2"
            >
              Yangi hisob — Ro‘yxatdan o‘tish
            </Link>
          </div>
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
