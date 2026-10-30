'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Phone, LogOut, Save, Send, Smartphone, ChevronRight, Loader2 } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api, errMsg } from '@/lib/api';
import { disconnectSocket } from '@/lib/socket';
import { useAuthStore } from '@/stores/auth';
import { useOrderStore } from '@/stores/order';
import { useCartStore } from '@/stores/cart';
import { useFoodStore } from '@/stores/food';

export default function ProfilePage() {
  return (
    <Shell>
      <ProfileInner />
    </Shell>
  );
}

function ProfileInner() {
  const router = useRouter();
  const client = useAuthStore((s) => s.client);
  const setClient = useAuthStore((s) => s.setClient);
  const logout = useAuthStore((s) => s.logout);
  const setActive = useOrderStore((s) => s.setActive);
  const [name, setName] = useState(client?.firstName ?? '');
  const [phone2, setPhone2] = useState(client?.phoneSecondary ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.patch('/client/me', { firstName: name, phoneSecondary: phone2 || null });
      setClient(data);
      setMsg({ ok: true, text: 'Saqlandi ✓' });
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e) });
    } finally {
      setBusy(false);
    }
  };

  const out = () => {
    if (!confirm('Hisobdan chiqasizmi?')) return;
    disconnectSocket();
    setActive(null);
    useCartStore.getState().clear();
    useFoodStore.getState().reset();
    logout();
    router.replace('/login');
  };

  const initial = (client?.firstName ?? '?').trim().charAt(0).toUpperCase();

  return (
    <div className="animate-in fade-in duration-300">
      <header className="bg-ink text-white px-5 pt-10 pb-7 rounded-b-[2rem] relative overflow-hidden">
        <div aria-hidden className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <span className="w-16 h-16 rounded-2xl bg-gold text-ink text-2xl font-extrabold flex items-center justify-center shadow-[0_10px_30px_-10px_rgba(59,155,255,.9)]">
            {initial}
          </span>
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400">Profil</p>
            <h1 className="text-2xl font-extrabold truncate">{client?.firstName}</h1>
            <p className="text-sm text-neutral-300 font-mono">{client?.phonePrimary}</p>
          </div>
        </div>
      </header>

      <section className="px-5 mt-4 space-y-3">
        <div className="rounded-2xl border border-line bg-white p-4 space-y-3 shadow-sm">
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <User size={13} /> Ism
            </span>
            <input value={name} onChange={(e) => setName(e.target.value)} className="input mt-1.5 font-semibold" />
          </label>
          <label className="block">
            <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1.5">
              <Phone size={13} /> Qo‘shimcha telefon
            </span>
            <input value={phone2} onChange={(e) => setPhone2(e.target.value)} inputMode="tel" placeholder="+998 ..." className="input mt-1.5" />
          </label>
          <button onClick={() => void save()} disabled={busy} className="btn-primary rounded-xl flex items-center justify-center gap-2">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} {busy ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
          {msg && <p className={'text-sm ' + (msg.ok ? 'text-emerald-700 font-semibold' : 'text-red-600')}>{msg.text}</p>}
        </div>

        <a href={client?.botUrl ?? 'https://t.me/Moviytaxibot'} target="_blank" rel="noreferrer" className="rounded-2xl border border-line bg-white p-4 flex items-center gap-3 active:bg-neutral-50 transition">
          <span className="w-10 h-10 rounded-xl bg-[#229ED9]/10 text-[#229ED9] flex items-center justify-center">
            <Send size={18} />
          </span>
          <span className="flex-1 text-sm">
            <b>@Moviytaxibot</b>
            <br />
            <span className="text-neutral-500">Asosiy raqamni o‘zgartirish va yordam — botda</span>
          </span>
          <ChevronRight size={18} className="text-neutral-300" />
        </a>

        <a href="/app" className="rounded-2xl border border-line bg-white p-4 flex items-center gap-3 active:bg-neutral-50 transition">
          <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center">
            <Smartphone size={18} />
          </span>
          <span className="flex-1 text-sm">
            <b>Ilova haqida</b>
            <br />
            <span className="text-neutral-500">Moviy Taxi mijoz ilovasi · yangilanishlar va yo‘riqnoma</span>
          </span>
          <ChevronRight size={18} className="text-neutral-300" />
        </a>

        <button onClick={out} className="w-full h-12 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-bold flex items-center justify-center gap-2 active:scale-[0.98] transition">
          <LogOut size={18} /> Chiqish
        </button>
        <p className="text-center text-[11px] text-neutral-400 pt-1">Moviy Taxi · mijoz ilovasi v1.0</p>
      </section>
    </div>
  );
}
