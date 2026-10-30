'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  Check,
  CheckCheck,
  User as UserIcon,
  MessageSquare,
  Phone,
  Send,
  Loader2,
  CornerDownRight,
  Image as ImageIcon,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { getAdminSocket } from '@/lib/socket';
import { fmtDateTime } from '@/lib/format';

interface FeedbackRow {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string | null;
  phone: string | null;
  text: string;
  photoUrl?: string | null;
  clientId?: string | null;
  replyText?: string | null;
  repliedAt?: string | null;
  isRead: boolean;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const resolveUrl = (raw: string) =>
  raw.startsWith('http://') || raw.startsWith('https://')
    ? raw
    : API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);

export default function FeedbackPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');
  const [replyFor, setReplyFor] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [replyErr, setReplyErr] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', filter],
    queryFn: async () => {
      const params = filter === 'unread' ? { unreadOnly: 'true' } : {};
      return (await api.get<FeedbackRow[]>('/admin/feedback', { params })).data;
    },
    refetchInterval: 20_000,
  });

  // Bot users write straight into this inbox — show new messages live.
  useEffect(() => {
    const socket = getAdminSocket();
    if (!socket) return;
    const onNew = () => {
      qc.invalidateQueries({ queryKey: ['feedback'] });
      qc.invalidateQueries({ queryKey: ['feedback-unread'] });
    };
    socket.on('feedback_new', onNew);
    return () => {
      socket.off('feedback_new', onNew);
    };
  }, [qc]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['feedback'] });
    qc.invalidateQueries({ queryKey: ['feedback-unread'] });
  };

  const markRead = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/feedback/${id}/read`)).data,
    onSuccess: invalidate,
  });

  const markAll = useMutation({
    mutationFn: async () => (await api.post('/admin/feedback/read-all')).data,
    onSuccess: invalidate,
  });

  const reply = useMutation({
    mutationFn: async ({ id, text }: { id: string; text: string }) =>
      (await api.post(`/admin/feedback/${id}/reply`, { text })).data,
    onSuccess: () => {
      setReplyFor(null);
      setReplyText('');
      setReplyErr(null);
      invalidate();
    },
    onError: (e: any) =>
      setReplyErr(e?.response?.data?.message ?? 'Javobni yuborib bo‘lmadi'),
  });

  return (
    <Shell
      title="Murojaatlar"
      subtitle="Botdagi “Admin bilan aloqa” orqali kelgan xabarlar — javob shu yerdan yoziladi"
      actions={
        <button
          onClick={() => {
            if (confirm('Barchasi o‘qildi deb belgilansinmi?'))
              markAll.mutate();
          }}
          disabled={markAll.isPending}
          className="btn-primary"
        >
          <CheckCheck size={16} /> Hammasini o‘qildi
        </button>
      }
    >
      <div className="flex gap-1.5 mb-4">
        {(['unread', 'all'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={
              'px-3 h-8 text-[11px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
              (filter === f
                ? 'bg-ink text-gold border-ink'
                : 'bg-white text-neutral-500 border-line hover:border-ink')
            }
          >
            {f === 'unread' ? 'Yangi' : 'Hammasi'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <Inbox size={28} className="mx-auto mb-2 text-neutral-300" />
          {filter === 'unread'
            ? 'Yangi murojaat yo‘q'
            : 'Hozircha murojaat yo‘q'}
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((f) => {
            const open = replyFor === f.id;
            return (
              <li
                key={f.id}
                className={
                  'card p-4 flex items-start gap-3 ' +
                  (f.isRead ? 'opacity-80' : 'border-l-4 border-l-gold')
                }
              >
                <span className="w-9 h-9 rounded-full bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
                  <MessageSquare size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">
                      {f.firstName ?? 'Anonim'}
                    </p>
                    {f.telegramUsername && (
                      <a
                        href={`https://t.me/${f.telegramUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 font-mono"
                      >
                        @{f.telegramUsername}
                      </a>
                    )}
                    {f.phone && (
                      <a
                        href={`tel:${f.phone}`}
                        className="text-xs text-neutral-600 inline-flex items-center gap-1"
                      >
                        <Phone size={11} /> {f.phone}
                      </a>
                    )}
                    {!f.isRead && (
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-gold text-ink">
                        Yangi
                      </span>
                    )}
                    {f.replyText && (
                      <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                        Javob berildi
                      </span>
                    )}
                    <span className="ml-auto text-[11px] text-neutral-500">
                      {fmtDateTime(f.createdAt)}
                    </span>
                  </div>
                  <p className="mt-1.5 text-sm text-ink whitespace-pre-wrap break-words">
                    {f.text}
                  </p>
                  {f.photoUrl && (
                    <a
                      href={resolveUrl(f.photoUrl)}
                      target="_blank"
                      rel="noreferrer"
                      className="mt-2 inline-block"
                      title="Rasmni ochish"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveUrl(f.photoUrl)}
                        alt="Yuborilgan rasm"
                        className="h-28 w-auto rounded-lg border border-line object-cover"
                      />
                    </a>
                  )}
                  {f.replyText && (
                    <div className="mt-2 rounded-lg bg-neutral-50 border border-line px-3 py-2 text-sm">
                      <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 flex items-center gap-1">
                        <CornerDownRight size={11} /> Admin javobi
                        {f.repliedAt && (
                          <span className="ml-auto normal-case tracking-normal font-normal">
                            {fmtDateTime(f.repliedAt)}
                          </span>
                        )}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words">{f.replyText}</p>
                    </div>
                  )}
                  <div className="mt-2 flex items-center gap-3 flex-wrap">
                    <span className="text-[10px] text-neutral-400 inline-flex items-center gap-1">
                      <UserIcon size={11} />
                      TG ID: {f.telegramUserId}
                    </span>
                    {f.photoUrl && (
                      <span className="text-[10px] text-neutral-400 inline-flex items-center gap-1">
                        <ImageIcon size={11} /> rasm bilan
                      </span>
                    )}
                    <button
                      onClick={() => {
                        setReplyErr(null);
                        setReplyText('');
                        setReplyFor(open ? null : f.id);
                      }}
                      className="text-xs font-semibold text-blue-700 hover:underline inline-flex items-center gap-1"
                    >
                      <Send size={12} /> {f.replyText ? 'Yana javob yozish' : 'Javob yozish'}
                    </button>
                  </div>
                  {open && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const text = replyText.trim();
                        if (!text) return;
                        reply.mutate({ id: f.id, text });
                      }}
                      className="mt-2 space-y-2"
                    >
                      <textarea
                        value={replyText}
                        onChange={(e) => setReplyText(e.target.value)}
                        rows={3}
                        autoFocus
                        placeholder="Javobingiz — foydalanuvchiga bot orqali yuboriladi"
                        className="input w-full h-auto py-2"
                      />
                      {replyErr && <p className="text-xs text-red-600">{replyErr}</p>}
                      <div className="flex gap-2">
                        <button
                          type="submit"
                          disabled={reply.isPending || !replyText.trim()}
                          className="btn-primary h-9"
                        >
                          {reply.isPending ? (
                            <Loader2 size={14} className="animate-spin" />
                          ) : (
                            <Send size={14} />
                          )}
                          Yuborish
                        </button>
                        <button
                          type="button"
                          onClick={() => setReplyFor(null)}
                          className="btn-secondary h-9"
                        >
                          Bekor
                        </button>
                      </div>
                    </form>
                  )}
                </div>
                {!f.isRead && (
                  <button
                    onClick={() => markRead.mutate(f.id)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50 text-green-700 hover:bg-green-100"
                    title="O‘qildi"
                  >
                    <Check size={16} />
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}
