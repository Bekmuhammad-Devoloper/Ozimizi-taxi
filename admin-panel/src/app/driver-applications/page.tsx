'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  UserPlus,
  ArrowLeft,
  Send,
  CheckCircle2,
  XCircle,
  Phone,
  Car,
  Image as ImageIcon,
  ExternalLink,
  RotateCcw,
  CarFront,
  Bike,
  UtensilsCrossed,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { Modal } from '@/components/ui';
import { api } from '@/lib/api';
import { fmtShort } from '@/lib/format';

type Status = 'NEW' | 'IN_REVIEW' | 'APPROVED' | 'REJECTED';

interface Application {
  id: string;
  telegramId: string;
  telegramUsername: string | null;
  fullName: string;
  phone: string;
  carModel: string;
  carColor: string;
  carPlate: string;
  carYear: string | null;
  selfEmployed?: boolean | null;
  contractAccepted?: boolean;
  licensePhotoUrl: string | null;
  techPassportPhotoUrl: string | null;
  carPhotoUrl: string | null;
  selfiePhotoUrl: string | null;
  status: Status;
  driverId: string | null;
  unreadCount: number;
  lastMessageAt: string;
  createdAt: string;
}

interface Message {
  id: string;
  sender: 'applicant' | 'admin' | 'system';
  text: string | null;
  photoUrl: string | null;
  createdAt: string;
}

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const resolveUrl = (raw: string) =>
  raw.startsWith('http') ? raw : API.replace(/\/$/, '') + raw;

const STATUS: Record<Status, { label: string; cls: string }> = {
  NEW: { label: 'Yangi', cls: 'bg-gold text-ink' },
  IN_REVIEW: { label: 'Ko‘rib chiqilmoqda', cls: 'bg-blue-50 text-blue-700' },
  APPROVED: { label: 'Qabul qilingan', cls: 'bg-emerald-50 text-emerald-700' },
  REJECTED: { label: 'Rad etilgan', cls: 'bg-red-50 text-red-600' },
};

const FILTERS: { key: Status | 'ALL'; label: string }[] = [
  { key: 'ALL', label: 'Hammasi' },
  { key: 'NEW', label: 'Yangi' },
  { key: 'IN_REVIEW', label: 'Jarayonda' },
  { key: 'APPROVED', label: 'Qabul' },
  { key: 'REJECTED', label: 'Rad' },
];

const fmtTime = fmtShort;

export default function DriverApplicationsPage() {
  const [filter, setFilter] = useState<Status | 'ALL'>('ALL');
  const [selected, setSelected] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['driver-applications', filter],
    queryFn: async () =>
      (
        await api.get<Application[]>('/admin/driver-applications', {
          params: filter === 'ALL' ? {} : { status: filter },
        })
      ).data,
    refetchInterval: 10_000,
  });

  return (
    <Shell
      title="Haydovchi bo‘lmoqchilar"
      subtitle="Bot orqali kelgan arizalar va ular bilan yozishma"
    >
      <div className="grid grid-cols-1 lg:grid-cols-[340px_1fr] gap-4 lg:h-[calc(100vh-170px)]">
        {/* LIST */}
        <div className={'card flex flex-col min-h-0 ' + (selected ? 'hidden lg:flex' : 'flex')}>
          <div className="p-3 border-b border-line flex gap-1.5 flex-wrap">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={
                  'px-2.5 h-7 text-[10px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
                  (filter === f.key
                    ? 'bg-ink text-gold border-ink'
                    : 'bg-white text-neutral-500 border-line hover:border-ink')
                }
              >
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex-1 overflow-y-auto">
            {isLoading ? (
              <p className="p-4 text-sm text-neutral-500">Yuklanmoqda…</p>
            ) : !data?.length ? (
              <div className="p-8 text-center text-sm text-neutral-500">
                <UserPlus size={28} className="mx-auto mb-2 text-neutral-300" />
                Ariza yo‘q
              </div>
            ) : (
              <ul className="divide-y divide-line">
                {data.map((a) => (
                  <li key={a.id}>
                    <button
                      onClick={() => setSelected(a.id)}
                      className={
                        'w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-neutral-50 ' +
                        (selected === a.id ? 'bg-gold/10' : '')
                      }
                    >
                      <Avatar app={a} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="font-semibold text-sm truncate flex-1">{a.fullName}</p>
                          <span className="text-[10px] text-neutral-400 shrink-0">
                            {fmtTime(a.lastMessageAt)}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          <p className="text-xs text-neutral-500 truncate flex-1">
                            {a.carModel} · {a.carPlate}
                          </p>
                          {a.unreadCount > 0 ? (
                            <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">
                              {a.unreadCount}
                            </span>
                          ) : (
                            <StatusPill status={a.status} />
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* DETAIL */}
        <div className={'min-h-0 ' + (selected ? 'block' : 'hidden lg:block')}>
          {selected ? (
            <Conversation id={selected} onBack={() => setSelected(null)} />
          ) : (
            <div className="card h-full min-h-[300px] flex items-center justify-center text-sm text-neutral-500">
              Chap tomondan arizani tanlang
            </div>
          )}
        </div>
      </div>
    </Shell>
  );
}

function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const [err, setErr] = useState<string | null>(null);
  // Approve dialog: the admin picks how the new driver works.
  const [approveKind, setApproveKind] = useState<ApproveKind | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const { data } = useQuery({
    queryKey: ['driver-application', id],
    queryFn: async () =>
      (
        await api.get<{
          application: Application;
          messages: Message[];
          driverDeleted?: boolean;
        }>(`/admin/driver-applications/${id}`)
      ).data,
    refetchInterval: 5_000,
  });

  const app = data?.application;
  const messages = data?.messages ?? [];
  const driverDeleted = !!data?.driverDeleted;

  const refreshAll = () => {
    qc.invalidateQueries({ queryKey: ['driver-application', id] });
    qc.invalidateQueries({ queryKey: ['driver-applications'] });
    qc.invalidateQueries({ queryKey: ['driver-applications-unread'] });
  };

  // Opening the thread (or new applicant messages arriving while it's open)
  // clears the unread counter.
  const unread = app?.unreadCount ?? 0;
  const status = app?.status;
  useEffect(() => {
    if (!app) return;
    if (unread > 0 || status === 'NEW') {
      api.post(`/admin/driver-applications/${id}/read`).then(refreshAll).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, unread, status]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  const onError = (e: any) => {
    const m = e?.response?.data?.message;
    setErr(Array.isArray(m) ? m.join(', ') : m ?? 'Xato');
  };

  const send = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/driver-applications/${id}/messages`, { text })).data,
    onSuccess: () => {
      setText('');
      setErr(null);
      refreshAll();
    },
    onError,
  });
  const approve = useMutation({
    mutationFn: async (kind: ApproveKind) =>
      (await api.post(`/admin/driver-applications/${id}/approve`, { kind })).data,
    onSuccess: () => {
      setApproveKind(null);
      refreshAll();
    },
    onError: (e: any) => {
      setApproveKind(null);
      onError(e);
    },
  });
  const restoreDriver = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/drivers/${app?.driverId}/restore`)).data,
    onSuccess: refreshAll,
    onError,
  });
  const reject = useMutation({
    mutationFn: async (reason: string) =>
      (await api.post(`/admin/driver-applications/${id}/reject`, { reason })).data,
    onSuccess: refreshAll,
    onError,
  });

  if (!app) {
    return <div className="card p-6 text-sm text-neutral-500">Yuklanmoqda…</div>;
  }

  const open = app.status === 'NEW' || app.status === 'IN_REVIEW';
  const photos: { label: string; url: string | null }[] = [
    { label: 'Prava', url: app.licensePhotoUrl },
    { label: 'Texpasport', url: app.techPassportPhotoUrl },
    { label: 'Mashina', url: app.carPhotoUrl },
    { label: 'O‘zi (selfi)', url: app.selfiePhotoUrl },
  ];

  return (
    <div className="card flex flex-col h-full min-h-[70vh] lg:min-h-0">
      {/* Header */}
      <div className="p-4 border-b border-line flex items-start gap-3 flex-wrap">
        <button onClick={onBack} className="lg:hidden text-neutral-500 mt-1" aria-label="back">
          <ArrowLeft size={18} />
        </button>
        <Avatar app={app} size={44} />
        <div className="flex-1 min-w-[160px]">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-bold">{app.fullName}</p>
            <StatusPill status={app.status} />
          </div>
          <div className="flex items-center gap-3 flex-wrap text-xs text-neutral-500 mt-0.5">
            <a href={`tel:${app.phone}`} className="inline-flex items-center gap-1 font-mono">
              <Phone size={12} /> {app.phone}
            </a>
            {app.telegramUsername && (
              <a
                href={`https://t.me/${app.telegramUsername}`}
                target="_blank"
                rel="noreferrer"
                className="text-blue-600 font-mono"
              >
                @{app.telegramUsername}
              </a>
            )}
          </div>
        </div>
        <div className="flex gap-1.5 flex-wrap">
          {open && (
            <>
              <button
                onClick={() => setApproveKind('both')}
                disabled={approve.isPending}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white text-xs font-bold disabled:opacity-50"
              >
                <CheckCircle2 size={14} /> Qabul qilish
              </button>
              <button
                onClick={() => {
                  const reason = prompt('Rad etish sababi (mijozga yuboriladi):', '');
                  if (reason !== null) reject.mutate(reason);
                }}
                disabled={reject.isPending}
                className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-red-50 text-red-600 border border-red-200 text-xs font-bold disabled:opacity-50"
              >
                <XCircle size={14} /> Rad etish
              </button>
            </>
          )}
          {app.driverId && driverDeleted && (
            <button
              onClick={() => {
                if (confirm('Bu haydovchi hisobi o‘chirilgan. Tiklansinmi?'))
                  restoreDriver.mutate();
              }}
              disabled={restoreDriver.isPending}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-orange-50 text-orange-700 border border-orange-200 text-xs font-bold disabled:opacity-50"
            >
              <RotateCcw size={14} /> Haydovchi o‘chirilgan — tiklash
            </button>
          )}
          {app.driverId && !driverDeleted && (
            <Link
              href={`/drivers/${app.driverId}`}
              className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-neutral-100 text-ink text-xs font-bold"
            >
              <ExternalLink size={14} /> Haydovchi profili
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Application details */}
        <div className="p-4 border-b border-line">
          <div className="flex items-center gap-2 text-sm flex-wrap">
            <Car size={15} className="text-gold-deep" />
            <b>{app.carModel}</b>
            <span className="text-neutral-500">· {app.carColor}</span>
            <span className="font-mono bg-neutral-100 px-1.5 py-0.5 rounded text-xs">
              {app.carPlate}
            </span>
            {app.carYear && <span className="text-neutral-500">· {app.carYear}-yil</span>}
            {app.selfEmployed != null && (
              <span
                className={
                  'text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ' +
                  (app.selfEmployed
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                    : 'bg-neutral-100 text-neutral-500 border-neutral-200')
                }
                title="Yo‘lovchi tashish bo‘yicha o‘z-o‘zini band qilgan shaxs sifatida ro‘yxatdan o‘tganmi"
              >
                {app.selfEmployed ? 'O‘z-o‘zini band qilgan ✓' : 'O‘z-o‘zini band qilmagan'}
              </span>
            )}
            {app.contractAccepted && (
              <span
                className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border bg-blue-50 text-blue-700 border-blue-200"
                title="Ariza yuborishda shartnomaga rozilik bildirgan"
              >
                Shartnoma ✓
              </span>
            )}
            <span className="ml-auto text-[11px] text-neutral-400">
              Ariza: {fmtTime(app.createdAt)}
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
            {photos.map((p) =>
              p.url ? (
                <a
                  key={p.label}
                  href={resolveUrl(p.url)}
                  target="_blank"
                  rel="noreferrer"
                  className="group block rounded-xl overflow-hidden border border-line"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={resolveUrl(p.url)}
                    alt={p.label}
                    className="w-full h-24 object-cover group-hover:opacity-90"
                  />
                  <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 px-2 py-1">
                    {p.label}
                  </p>
                </a>
              ) : (
                <div
                  key={p.label}
                  className="rounded-xl border border-dashed border-line h-[122px] flex flex-col items-center justify-center text-neutral-400"
                >
                  <ImageIcon size={18} />
                  <p className="text-[10px] uppercase tracking-wider font-bold mt-1">
                    {p.label} yo‘q
                  </p>
                </div>
              ),
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="p-4 space-y-2 bg-neutral-50/50">
          {messages.map((m) =>
            m.sender === 'system' ? (
              <p key={m.id} className="text-center text-[11px] text-neutral-500">
                <span className="bg-white border border-line rounded-full px-2.5 py-1 inline-block">
                  {m.text} · {fmtTime(m.createdAt)}
                </span>
              </p>
            ) : (
              <div
                key={m.id}
                className={'flex ' + (m.sender === 'admin' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={
                    'max-w-[80%] rounded-2xl px-3 py-2 text-sm ' +
                    (m.sender === 'admin'
                      ? 'bg-ink text-white rounded-br-md'
                      : 'bg-white border border-line rounded-bl-md')
                  }
                >
                  {m.photoUrl && (
                    <a href={resolveUrl(m.photoUrl)} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={resolveUrl(m.photoUrl)}
                        alt="rasm"
                        className="rounded-lg max-h-60 mb-1"
                      />
                    </a>
                  )}
                  {m.text && <p className="whitespace-pre-wrap break-words">{m.text}</p>}
                  <p
                    className={
                      'text-[10px] mt-0.5 text-right ' +
                      (m.sender === 'admin' ? 'text-neutral-400' : 'text-neutral-400')
                    }
                  >
                    {fmtTime(m.createdAt)}
                  </p>
                </div>
              </div>
            ),
          )}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Composer */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (text.trim()) send.mutate();
        }}
        className="p-3 border-t border-line flex gap-2 items-end"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              if (text.trim()) send.mutate();
            }
          }}
          rows={1}
          placeholder="Xabar yozing… (Enter — yuborish)"
          className="input h-auto min-h-10 py-2 resize-none"
        />
        <button
          type="submit"
          disabled={send.isPending || !text.trim()}
          className="btn-primary shrink-0"
          aria-label="send"
        >
          <Send size={16} />
        </button>
      </form>
      {err && <p className="px-3 pb-2 text-xs text-red-600">{err}</p>}

      {approveKind && (
        <Modal title={`${app.fullName} — qabul qilish`} onClose={() => !approve.isPending && setApproveKind(null)}>
          <p className="text-sm text-neutral-600 mb-3">
            Qaysi buyurtmalarni oladi? Hisob yaratilib, login-parol unga botda yuboriladi. Keyin haydovchi
            sahifasida o‘zgartirish mumkin.
          </p>
          <div className="space-y-2">
            {APPROVE_KINDS.map((k) => (
              <button
                key={k.value}
                type="button"
                onClick={() => setApproveKind(k.value)}
                className={
                  'w-full text-left rounded-xl border px-3 py-2.5 flex items-start gap-3 transition-colors ' +
                  (approveKind === k.value ? 'border-ink bg-ink text-white' : 'border-line bg-white hover:bg-neutral-50')
                }
              >
                <k.icon
                  size={18}
                  className={'mt-0.5 shrink-0 ' + (approveKind === k.value ? 'text-gold' : 'text-neutral-400')}
                />
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{k.label}</span>
                  <span
                    className={'block text-[11px] ' + (approveKind === k.value ? 'text-neutral-300' : 'text-neutral-500')}
                  >
                    {k.hint}
                  </span>
                </span>
              </button>
            ))}
          </div>
          <div className="flex gap-2 justify-end pt-4">
            <button
              type="button"
              onClick={() => setApproveKind(null)}
              disabled={approve.isPending}
              className="btn-secondary"
            >
              Bekor qilish
            </button>
            <button
              type="button"
              onClick={() => approve.mutate(approveKind)}
              disabled={approve.isPending}
              className="h-10 px-4 inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white text-sm font-bold disabled:opacity-50"
            >
              <CheckCircle2 size={16} /> {approve.isPending ? 'Qabul qilinmoqda…' : 'Qabul qilish'}
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

type ApproveKind = 'taxi' | 'courier' | 'both';

const APPROVE_KINDS: { value: ApproveKind; label: string; hint: string; icon: typeof CarFront }[] = [
  { value: 'taxi', label: 'Faqat taksi', hint: 'Faqat taksi safarlari — yetkazish buyurtmalari kelmaydi', icon: CarFront },
  { value: 'courier', label: 'Faqat kuryer', hint: 'Faqat ovqat yetkazish — taksi safarlari kelmaydi', icon: Bike },
  {
    value: 'both',
    label: 'Taksi + yetkazish',
    hint: 'Taksi safarlari bilan birga ovqat yetkazish buyurtmalarini ham oladi',
    icon: UtensilsCrossed,
  },
];

function StatusPill({ status }: { status: Status }) {
  const s = STATUS[status];
  return (
    <span
      className={
        'text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded shrink-0 ' + s.cls
      }
    >
      {s.label}
    </span>
  );
}

function Avatar({ app, size = 40 }: { app: Application; size?: number }) {
  const style = { width: size, height: size };
  if (app.selfiePhotoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={resolveUrl(app.selfiePhotoUrl)}
        alt={app.fullName}
        style={style}
        className="rounded-full object-cover shrink-0"
      />
    );
  }
  return (
    <span
      style={style}
      className="rounded-full bg-gold/15 text-gold-deep flex items-center justify-center font-bold shrink-0"
    >
      {app.fullName.slice(0, 1).toUpperCase()}
    </span>
  );
}
