'use client';
import { useEffect, useRef, useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { api, errMsg } from '@/lib/api';
import { fmtTime } from '@/lib/date';
import { useOrderStore, OrderMessage } from '@/stores/order';

export function OrderChat({ orderId, enabled, driverName }: { orderId: string; enabled: boolean; driverName?: string }) {
  const messages = useOrderStore((s) => s.messages);
  const setMessages = useOrderStore((s) => s.setMessages);
  const addMessage = useOrderStore((s) => s.addMessage);
  const clearUnread = useOrderStore((s) => s.clearUnread);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api
      .get<OrderMessage[]>(`/client/orders/${orderId}/messages`)
      .then((r) => setMessages(r.data))
      .catch(() => {});
  }, [orderId, setMessages]);

  useEffect(() => {
    if (open) {
      clearUnread();
      bottom.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages.length, open, clearUnread]);

  const send = async () => {
    const t = text.trim();
    if (!t) return;
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post<OrderMessage>(`/client/orders/${orderId}/messages`, { text: t });
      addMessage(data);
      setText('');
    } catch (e) {
      setErr(errMsg(e));
    } finally {
      setBusy(false);
    }
  };

  const unread = useOrderStore((s) => s.unread);

  return (
    <section className="px-5 mt-4">
      <div className="rounded-2xl border border-line bg-white overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 h-14"
        >
          <span className="flex items-center gap-2 font-bold">
            <span className="w-9 h-9 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center">
              <MessageCircle size={18} />
            </span>
            {driverName ? `${driverName} bilan chat` : 'Haydovchi bilan chat'}
            {unread > 0 && !open && (
              <span className="ml-1 min-w-[20px] h-5 px-1.5 rounded-full bg-red-600 text-white text-[11px] font-bold flex items-center justify-center">
                {unread}
              </span>
            )}
          </span>
          <span className="text-sm text-neutral-500">{open ? 'Yopish' : 'Ochish'}</span>
        </button>
        {open && (
          <div className="border-t border-line">
            <div className="max-h-64 overflow-y-auto px-3 py-3 space-y-2 bg-paper">
              {messages.length === 0 && (
                <p className="text-xs text-neutral-500 text-center py-3">
                  Haydovchiga yozing — masalan, qayerda turganingizni aniqlashtiring.
                </p>
              )}
              {messages.map((m) => (
                <div key={m.id} className={'flex ' + (m.sender === 'client' ? 'justify-end' : 'justify-start')}>
                  <div
                    className={
                      'max-w-[80%] rounded-2xl px-3 py-2 text-sm ' +
                      (m.sender === 'client' ? 'bg-ink text-white rounded-br-md' : 'bg-white border border-line rounded-bl-md')
                    }
                  >
                    <p>{m.text}</p>
                    <p className={'text-[10px] mt-0.5 ' + (m.sender === 'client' ? 'text-neutral-400' : 'text-neutral-500')}>
                      {fmtTime(m.createdAt)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={bottom} />
            </div>
            {enabled ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void send();
                }}
                className="flex items-center gap-2 p-2 border-t border-line"
              >
                <input
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  placeholder="Xabar yozing…"
                  className="flex-1 h-11 px-3 rounded-xl bg-paper border border-line outline-none focus:border-ink text-sm"
                  maxLength={500}
                />
                <button type="submit" disabled={busy || !text.trim()} className="w-11 h-11 rounded-xl bg-ink text-gold flex items-center justify-center disabled:opacity-40">
                  <Send size={18} />
                </button>
              </form>
            ) : (
              <p className="text-xs text-neutral-500 text-center py-3 border-t border-line">Chat yopilgan</p>
            )}
            {err && <p className="text-xs text-red-600 px-3 pb-2">{err}</p>}
          </div>
        )}
      </div>
    </section>
  );
}
