'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Cookies from 'js-cookie';
import { api } from '@/lib/api';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setLoading(true);
    try {
      const { data } = await api.post('/auth/admin/login', {
        username,
        password,
      });
      Cookies.set('admin_token', data.access_token, { expires: 7 });
      router.replace('/dashboard');
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Kirib bo‘lmadi');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-white">
      <form onSubmit={submit} className="w-full max-w-sm px-8">
        <div className="flex flex-col items-center mb-10">
          <div className="w-20 h-20 mb-3 rounded-2xl overflow-hidden bg-ink ring-1 ring-gold/40 shadow-lg shadow-gold/20">
            <Image
              src="/logo.jpg"
              alt="OZIMIZNI TAXI"
              width={80}
              height={80}
              className="w-full h-full object-cover"
              priority
            />
          </div>
          <h1 className="text-lg font-bold tracking-wide">OZIMIZNI TAXI</h1>
          <p className="text-xs text-neutral-500 mt-1">Admin paneli</p>
        </div>

        <div className="space-y-6">
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
              Username
            </span>
            <input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 w-full h-11 bg-transparent border-b border-line outline-none focus:border-gold-dark"
              placeholder="admin"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-neutral-500 font-medium">
              Parol
            </span>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full h-11 bg-transparent border-b border-line outline-none focus:border-gold-dark"
            />
          </label>
        </div>

        {err && <p className="mt-6 text-sm text-red-600">{err}</p>}

        <button
          disabled={loading}
          className="mt-10 w-full h-11 bg-ink text-gold text-sm font-semibold rounded-md disabled:opacity-40"
        >
          {loading ? 'Kuting…' : 'Kirish'}
        </button>
      </form>
    </main>
  );
}
