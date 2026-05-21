'use client';
import { Suspense, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Eye, EyeOff, Phone, Lock, KeyRound } from 'lucide-react';
import { api } from '@/lib/api';
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

export default function ResetPage() {
  return (
    <Suspense fallback={null}>
      <Inner />
    </Suspense>
  );
}

function Inner() {
  const router = useRouter();
  const sp = useSearchParams();
  const [phone, setPhone] = useState('+998 ');
  const [code, setCode] = useState<string[]>(['', '', '', '', '', '']);
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    const p = sp.get('phone');
    if (p) setPhone(maskPhone(p));
  }, [sp]);

  const handleCodeChange = (i: number, v: string) => {
    const digit = v.replace(/\D/g, '').slice(0, 1);
    const next = [...code];
    next[i] = digit;
    setCode(next);
    if (digit && i < 5) codeRefs.current[i + 1]?.focus();
  };

  const handleCodeKey = (
    i: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === 'Backspace' && !code[i] && i > 0) {
      codeRefs.current[i - 1]?.focus();
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.length < 13) {
      setErr('Telefon raqam to‘liq emas');
      return;
    }
    const codeStr = code.join('');
    if (codeStr.length !== 6) {
      setErr('Kod to‘liq emas');
      return;
    }
    if (password.length < 6) {
      setErr('Yangi parol kamida 6 belgi');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/driver/reset', {
        phone: cleanPhone,
        code: codeStr,
        newPassword: password,
      });
      setDone(true);
      setTimeout(() => router.replace('/login'), 1500);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Tiklab bo‘lmadi');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthShell subtitle="Yangi parol o‘rnatish">
        <div className="rounded-lg bg-green-50 border border-green-200 p-5 text-center">
          <p className="text-green-800 font-semibold">Parol yangilandi</p>
          <p className="text-sm text-green-700 mt-1">
            Login sahifasiga yo‘naltirilmoqda…
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell subtitle="Yangi parol o‘rnatish">
      <form onSubmit={submit} className="flex-1 flex flex-col">
        <div className="space-y-5">
          <Field icon={<Phone size={18} />} label="Telefon raqam">
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(maskPhone(e.target.value))}
              className="input"
              inputMode="numeric"
            />
          </Field>

          <div>
            <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
              <KeyRound size={18} className="text-neutral-400" />
              Tasdiqlash kodi
            </span>
            <div className="flex gap-2 mt-2 justify-between">
              {code.map((d, i) => (
                <input
                  key={i}
                  ref={(el) => {
                    codeRefs.current[i] = el;
                  }}
                  type="tel"
                  inputMode="numeric"
                  maxLength={1}
                  value={d}
                  onChange={(e) => handleCodeChange(i, e.target.value)}
                  onKeyDown={(e) => handleCodeKey(i, e)}
                  className="w-12 h-14 text-center text-xl font-semibold border border-line rounded-lg bg-white outline-none focus:border-ink focus:ring-2 focus:ring-gold/40"
                />
              ))}
            </div>
          </div>

          <Field icon={<Lock size={18} />} label="Yangi parol">
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

          {err && (
            <div className="rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
              {err}
            </div>
          )}
        </div>

        <div className="mt-auto pt-8 space-y-4">
          <button disabled={loading} className="btn-primary">
            {loading ? 'Saqlanmoqda…' : 'Parolni saqlash'}
          </button>
          <Link
            href="/login"
            className="block text-center text-sm text-neutral-500"
          >
            ← Login sahifaga qaytish
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
