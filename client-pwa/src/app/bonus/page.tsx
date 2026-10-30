'use client';
import { useState } from 'react';
import { Gift, Ticket, Share2, Copy, Check, Send, Sparkles, Loader2 } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api, errMsg } from '@/lib/api';
import { money } from '@/lib/status';
import { useAuthStore } from '@/stores/auth';

export default function BonusPage() {
  return (
    <Shell>
      <BonusInner />
    </Shell>
  );
}

function BonusInner() {
  const client = useAuthStore((s) => s.client);
  const setClient = useAuthStore((s) => s.setClient);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);

  const claim = async () => {
    const c = code.trim().toUpperCase();
    if (!c) return;
    setBusy(true);
    setMsg(null);
    try {
      const { data } = await api.post('/client/promo/claim', { code: c });
      setClient({ balance: data.balance });
      setMsg({
        ok: true,
        text:
          `🎉 ${money(data.amount)} so‘m bonus balansingizga qo‘shildi!` +
          (data.lockNote ? ` ${data.lockNote}.` : ''),
      });
      setCode('');
    } catch (e) {
      setMsg({ ok: false, text: errMsg(e, 'Promo kod qabul qilinmadi') });
    } finally {
      setBusy(false);
    }
  };

  const invite = client?.inviteUrl ?? client?.botUrl ?? 'https://t.me/Moviytaxibot';
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(invite);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  };
  const share = async () => {
    const text = `Moviy Taxi — Telegram orqali taksi chaqiring. Mening havolam bilan ro‘yxatdan o‘ting: ${invite}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: 'Moviy Taxi', text, url: invite });
        return;
      }
    } catch {
      /* cancelled */
    }
    await copy();
  };

  return (
    <div className="animate-in fade-in duration-300">
      <header className="bg-ink text-white px-5 pt-10 pb-7 rounded-b-[2rem] relative overflow-hidden">
        <div aria-hidden className="absolute -right-12 -top-12 w-56 h-56 rounded-full bg-gold/25 blur-3xl" />
        <div aria-hidden className="absolute -left-16 bottom-0 w-40 h-40 rounded-full bg-gold/10 blur-3xl" />
        <div className="relative">
          <p className="text-[10px] uppercase tracking-[0.25em] text-neutral-400 flex items-center gap-1.5">
            <Sparkles size={12} className="text-gold" /> Bonus balans
          </p>
          <h1 className="mt-2 text-4xl font-extrabold tabular-nums leading-none">
            {money(client?.balance)} <span className="text-base font-normal text-neutral-400">so‘m</span>
          </h1>
          <p className="mt-3 text-sm text-neutral-300 leading-snug max-w-xs">
            Safar yakunida “Bonusdan to‘lash” orqali ishlatasiz — haydovchi tasdiqlaydi.
          </p>
        </div>
      </header>

      <section className="px-5 mt-4 space-y-4">
        <div className="rounded-2xl border border-line bg-white p-4 shadow-sm">
          <p className="font-bold flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center">
              <Ticket size={16} />
            </span>
            Promo kod
          </p>
          <p className="mt-2 text-xs text-neutral-500">Kodni kiriting — summa bonus balansga tushadi. Har bir kodni bir marta ishlatish mumkin.</p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void claim();
            }}
            className="mt-3 flex gap-2"
          >
            <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="YANGIYIL" className="input flex-1 font-mono tracking-widest uppercase font-bold" />
            <button type="submit" disabled={busy || !code.trim()} className="h-12 px-5 rounded-lg bg-ink text-gold font-bold disabled:opacity-50 active:scale-[0.98] flex items-center gap-2">
              {busy ? <Loader2 size={16} className="animate-spin" /> : null} Olish
            </button>
          </form>
          {msg && <p className={'mt-2 text-sm animate-in fade-in ' + (msg.ok ? 'text-emerald-700 font-semibold' : 'text-red-600')}>{msg.text}</p>}
        </div>

        <div className="rounded-2xl border border-gold/40 bg-gradient-to-br from-gold/20 to-gold/5 p-4">
          <p className="font-bold flex items-center gap-2">
            <span className="w-9 h-9 rounded-xl bg-gold text-ink flex items-center justify-center">
              <Gift size={16} />
            </span>
            Do‘stlaringizni taklif qiling
          </p>
          <p className="mt-2 text-xs text-neutral-600 leading-relaxed">
            Do‘stingiz havolangiz orqali ro‘yxatdan o‘tib birinchi safarini yakunlasa, ikkalangizga ham bonus beriladi.
          </p>
          <button onClick={() => void copy()} className="mt-3 w-full text-left text-[11px] font-mono bg-white border border-line rounded-xl px-3 py-2.5 break-all flex items-center gap-2">
            <span className="flex-1">{invite}</span>
            {copied ? <Check size={14} className="text-emerald-700 shrink-0" /> : <Copy size={14} className="text-neutral-400 shrink-0" />}
          </button>
          <div className="mt-3 flex gap-2">
            <button onClick={() => void share()} className="flex-1 h-12 rounded-xl bg-ink text-gold font-bold flex items-center justify-center gap-2 active:scale-[0.98]">
              <Share2 size={16} /> Ulashish
            </button>
            <button onClick={() => void copy()} className="h-12 px-4 rounded-xl border border-line bg-white font-semibold flex items-center gap-1.5 active:scale-[0.98]">
              {copied ? <Check size={16} className="text-emerald-700" /> : <Copy size={16} />} {copied ? 'Nusxalandi' : 'Nusxa'}
            </button>
          </div>
        </div>

        <a href={client?.botUrl ?? 'https://t.me/Moviytaxibot'} target="_blank" rel="noreferrer" className="rounded-2xl border border-line bg-white p-4 flex items-center gap-3 active:bg-neutral-50 transition">
          <span className="w-10 h-10 rounded-xl bg-[#229ED9]/10 text-[#229ED9] flex items-center justify-center">
            <Send size={18} />
          </span>
          <span className="flex-1 text-sm">
            <b>Telegram bot</b>
            <br />
            <span className="text-neutral-500">Bonus va chek xabarlari botga ham keladi</span>
          </span>
        </a>
      </section>
    </div>
  );
}
