'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { api } from '@/lib/api';
import { fmtTime } from '@/lib/date';

interface Msg {
  id: string;
  sender: 'driver' | 'client';
  text: string;
  createdAt: string;
}

const QUICK = ['Yetib keldim 🚕', '2 daqiqada yetaman', 'Qayerdasiz?', 'Kutib turibman'];

/** Chat with the passenger for the active order (their side is the bot). */
export function OrderChat({ orderId, enabled }: { orderId: string; enabled: boolean }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const load = () =>
    api
      .get<Msg[]>(`/driver/orders/${orderId}/messages`)
      .then((r) => setMsgs(r.data))
      .catch(() => {});

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    // Instant refresh when the socket hook receives a passenger message.
    const onPush = () => load();
    window.addEventListener('order-message', onPush);
    return () => {
      clearInterval(t);
      window.removeEventListener('order-message', onPush);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orderId]);

  useEffect(() => {
    if (open) {
      setSeen(msgs.length);
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  }, [open, msgs.length]);

  const send = async (t: string) => {
    const clean = t.trim();
    if (!clean || busy) return;
    setBusy(true);
    try {
      await api.post(`/driver/orders/${orderId}/messages`, { text: clean });
      setText('');
      await load();
    } finally {
      setBusy(false);
    }
  };

  const unread = Math.max(0, msgs.filter((m) => m.sender === 'client').length - seenClient(msgs, seen));

  return (
    <section className="px-6 mt-4">
      <div className="bg-white border border-line rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full px-4 py-3 flex items-center gap-2"
        >
          <span className="w-8 h-8 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center">
            <MessageCircle size={16} />
          </span>
          <span className="text-sm font-bold flex-1 text-left">Mijoz bilan chat</span>
          {!open && unread > 0 && (
            <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unread}
            </span>
          )}
          <span className="text-xs text-neutral-500">{open ? 'Yopish' : 'Ochish'}</span>
        </button>

        {open && (
          <div className="border-t border-line">
            <div className="max-h-64 overflow-y-auto px-3 py-3 space-y-2 bg-neutral-50/60">
              {msgs.length === 0 && (
                <p className="text-center text-xs text-neutral-500 py-4">
                  Hali xabar yo‘q. Mijoz sizga botdan yozishi mumkin.
                </p>
              )}
              {msgs.map((m) => (
                <div key={m.id} className={'flex ' + (m.sender === 'driver' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm ' +
                      (m.sender === 'driver'
                        ? 'bg-ink text-white rounded-br-md'
                        : 'bg-white border border-line rounded-bl-md')
                    }
                  >
                    <p className="whitespace-pre-wrap break-words">{m.text}</p>
                    <p className={'text-[10px] mt-0.5 text-right ' + (m.sender === 'driver' ? 'text-neutral-400' : 'text-neutral-400')}>
                      {fmtTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>

            {enabled ? (
              <>
                <div className="px-3 pt-2 flex gap-1.5 overflow-x-auto">
                  {QUICK.map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => send(q)}
                      disabled={busy}
                      className="shrink-0 h-8 px-3 rounded-full bg-gold/15 text-gold-deep text-xs font-semibold"
                    >
                      {q}
                    </button>
                  ))}
                </div>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    send(text);
                  }}
                  className="p-3 flex gap-2"
                >
                  <input
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Mijozga xabar…"
                    className="input h-11"
                  />
                  <button
                    type="submit"
                    disabled={busy || !text.trim()}
                    className="w-11 h-11 shrink-0 rounded-lg bg-ink text-gold flex items-center justify-center disabled:opacity-40"
                    aria-label="Yuborish"
                  >
                    <Send size={16} />
                  </button>
                </form>
              </>
            ) : (
              <p className="px-4 py-3 text-xs text-neutral-500">Safar yakunlangan — chat yopiq.</p>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/** Number of client messages that were already visible when the panel was last open. */
function seenClient(msgs: Msg[], seen: number): number {
  return msgs.slice(0, seen).filter((m) => m.sender === 'client').length;
}
