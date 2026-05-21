'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Phone } from 'lucide-react';
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

export default function ForgotPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('+998 ');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    const cleanPhone = phone.replace(/\s/g, '');
    if (cleanPhone.length < 13) {
      setErr('Telefon raqam to‘liq emas');
      return;
    }
    setLoading(true);
    try {
      await api.post('/auth/driver/forgot', { phone: cleanPhone });
      router.push(`/reset?phone=${encodeURIComponent(cleanPhone)}`);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Xato');
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthShell subtitle="Parolni tiklash">
      <form onSubmit={submit} className="flex-1 flex flex-col">
        <p className="text-sm text-neutral-600 mb-6">
          Telefon raqamingizni kiriting. Sizga 6 raqamli tasdiqlash kodi yuboriladi.
        </p>

        <label className="block">
          <span className="flex items-center gap-2 text-xs uppercase tracking-wider text-neutral-500 font-semibold">
            <Phone size={18} className="text-neutral-400" />
            Telefon raqam
          </span>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(maskPhone(e.target.value))}
            className="input mt-2"
            placeholder="+998 90 123 45 67"
            inputMode="numeric"
          />
        </label>

        {err && (
          <div className="mt-4 rounded-md bg-red-50 border border-red-200 text-red-700 text-sm p-3">
            {err}
          </div>
        )}

        <div className="mt-auto pt-10 space-y-4">
          <button disabled={loading} className="btn-primary">
            {loading ? 'Yuborilmoqda…' : 'Kod yuborish'}
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
