'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Inbox,
  Check,
  CheckCheck,
  User as UserIcon,
  MessageSquare,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface FeedbackRow {
  id: string;
  telegramUserId: string;
  telegramUsername: string | null;
  firstName: string | null;
  phone: string | null;
  text: string;
  isRead: boolean;
  createdAt: string;
}

export default function FeedbackPage() {
  const qc = useQueryClient();
  const [filter, setFilter] = useState<'all' | 'unread'>('unread');

  const { data, isLoading } = useQuery({
    queryKey: ['feedback', filter],
    queryFn: async () => {
      const params = filter === 'unread' ? { unreadOnly: 'true' } : {};
      return (await api.get<FeedbackRow[]>('/admin/feedback', { params })).data;
    },
    refetchInterval: 20_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/feedback/${id}/read`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });

  const markAll = useMutation({
    mutationFn: async () => (await api.post('/admin/feedback/read-all')).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });

  return (
    <Shell
      title="Shikoyat va takliflar"
      subtitle="Telegram bot orqali kelgan murojaatlar"
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
          {data.map((f) => (
            <li
              key={f.id}
              className={
                'card p-4 flex items-start gap-3 ' +
                (f.isRead ? 'opacity-70' : 'border-l-4 border-l-gold')
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
                  {!f.isRead && (
                    <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-gold text-ink">
                      Yangi
                    </span>
                  )}
                  <span className="ml-auto text-[11px] text-neutral-500">
                    {new Date(f.createdAt).toLocaleString('uz', {
                      day: '2-digit',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>
                <p className="mt-1.5 text-sm text-ink whitespace-pre-wrap break-words">
                  {f.text}
                </p>
                <div className="mt-2 flex items-center gap-2">
                  <span className="text-[10px] text-neutral-400 inline-flex items-center gap-1">
                    <UserIcon size={11} />
                    TG ID: {f.telegramUserId}
                  </span>
                </div>
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
          ))}
        </ul>
      )}
    </Shell>
  );
}
