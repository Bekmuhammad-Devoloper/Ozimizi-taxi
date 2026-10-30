'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Trash2,
  Wallet,
  Eye,
  Check,
  X,
  Ban,
  ShieldCheck,
  RotateCcw,
  Crown,
  Bike,
  CarFront,
} from 'lucide-react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { DriverAvatar } from '@/components/DriverAvatar';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/format';

interface DriverRow {
  id: string;
  fullName: string;
  phone: string;
  email: string | null;
  isOnline: boolean;
  isActive: boolean;
  isApproved: boolean;
  isBranded?: boolean;
  kind?: 'taxi' | 'courier';
  acceptDelivery?: boolean;
  avatarUrl: string | null;
  balance: string;
  createdAt: string;
  deletedAt?: string | null;
  ordersCount?: number;
  approvedAt?: string | null;
  contractAcceptedAt?: string | null;
}

export default function DriversPage() {
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [adjusting, setAdjusting] = useState<DriverRow | null>(null);
  // Deleted accounts are kept (soft delete) and can be brought back.
  const [showDeleted, setShowDeleted] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['drivers', showDeleted ? 'deleted' : 'active'],
    queryFn: async () =>
      (
        await api.get<DriverRow[]>('/admin/drivers', {
          params: showDeleted ? { deleted: 1 } : {},
        })
      ).data,
  });

  const branded = useMutation({
    mutationFn: async ({ id, branded }: { id: string; branded: boolean }) =>
      (await api.post(`/admin/drivers/${id}/branded`, { branded })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const restore = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/drivers/${id}/restore`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/drivers/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const approve = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/drivers/${id}/approve`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const reject = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/drivers/${id}/reject`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const block = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/drivers/${id}/block`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  const unblock = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/drivers/${id}/unblock`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['drivers'] }),
  });

  return (
    <Shell
      title="Haydovchilar"
      subtitle={`Jami: ${data?.length ?? 0} ta`}
      actions={
        <button onClick={() => setCreateOpen(true)} className="btn-primary">
          <Plus size={16} /> Yangi haydovchi
        </button>
      }
    >
      <div className="flex gap-1.5 mb-4">
        {([false, true] as const).map((del) => (
          <button
            key={String(del)}
            onClick={() => setShowDeleted(del)}
            className={
              'px-3 h-8 text-[11px] uppercase tracking-wider font-bold rounded-full border transition-all ' +
              (showDeleted === del
                ? 'bg-ink text-gold border-ink'
                : 'bg-white text-neutral-500 border-line hover:border-ink')
            }
          >
            {del ? 'O‘chirilganlar' : 'Faol'}
          </button>
        ))}
      </div>

      {/* Mobile card list */}
      <div className="lg:hidden space-y-3">
        {isLoading && (
          <p className="text-sm text-neutral-500 text-center py-8">
            Yuklanmoqda…
          </p>
        )}
        {!isLoading && (!data || data.length === 0) && (
          <p className="text-sm text-neutral-500 text-center py-8">
            Haydovchilar yo'q
          </p>
        )}
        {data?.map((d) => (
          <div
            key={d.id}
            className={
              'card p-4 ' + (!d.isActive ? 'opacity-60 grayscale' : '')
            }
          >
            <div className="flex items-start gap-3">
              <DriverAvatar
                fullName={d.fullName}
                avatarUrl={d.avatarUrl}
                size={40}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <p className="font-semibold truncate">{d.fullName}</p>
                  <div className="flex items-center gap-1 flex-wrap">
                    {!d.isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                        <Ban size={10} /> Bloklangan
                      </span>
                    )}
                    {d.isBranded && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200">
                        Brend
                      </span>
                    )}
                    {d.kind === 'courier' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200">
                        <Bike size={10} /> Kuryer
                      </span>
                    )}
                    {!d.isApproved && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200">
                        Tasdiq kerak
                      </span>
                    )}
                    <span
                      className={
                        'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider shrink-0 ' +
                        (d.isOnline
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-neutral-100 text-neutral-500 border border-neutral-200')
                      }
                    >
                      <span
                        className={
                          'w-1.5 h-1.5 rounded-full ' +
                          (d.isOnline
                            ? 'bg-green-500 animate-pulse'
                            : 'bg-neutral-400')
                        }
                      />
                      {d.isOnline ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
                <p className="text-xs text-neutral-500 font-mono mt-0.5">
                  {d.phone}
                </p>
                {d.email && (
                  <p className="text-xs text-neutral-500 truncate">
                    {d.email}
                  </p>
                )}
              </div>
            </div>
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-line">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-semibold">
                  Balans
                </p>
                <p className="font-bold tabular-nums">
                  {Number(d.balance).toLocaleString('uz')}
                  <span className="text-[10px] text-neutral-500 ml-1 font-normal">
                    so'm
                  </span>
                </p>
              </div>
              <div className="flex gap-1">
                {showDeleted ? (
                  <button
                    onClick={() => restore.mutate(d.id)}
                    className="h-9 px-3 rounded-lg flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold"
                  >
                    <RotateCcw size={14} /> Tiklash
                  </button>
                ) : !d.isApproved ? (
                  <button
                    onClick={() => approve.mutate(d.id)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-600 text-white"
                    title="Tasdiqlash"
                  >
                    <Check size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      if (confirm(`${d.fullName} tasdig'i bekor qilinsinmi?`))
                        reject.mutate(d.id);
                    }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-orange-50 text-orange-700"
                    title="Tasdiqni olib tashlash"
                  >
                    <X size={16} />
                  </button>
                )}
                <Link
                  href={`/drivers/${d.id}`}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-neutral-100 text-neutral-700"
                >
                  <Eye size={16} />
                </Link>
                <button
                  onClick={() => setAdjusting(d)}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-green-50 text-green-700"
                  title="Balansga ta'sir"
                >
                  <Wallet size={16} />
                </button>
                {d.isActive ? (
                  <button
                    onClick={() => {
                      if (confirm(`${d.fullName} bloklansinmi?`))
                        block.mutate(d.id);
                    }}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600"
                    title="Bloklash"
                  >
                    <Ban size={16} />
                  </button>
                ) : (
                  <button
                    onClick={() => unblock.mutate(d.id)}
                    className="w-9 h-9 rounded-lg flex items-center justify-center bg-emerald-50 text-emerald-700"
                    title="Blokdan chiqarish"
                  >
                    <ShieldCheck size={16} />
                  </button>
                )}
                {!showDeleted && (
                  <button
                    onClick={() => branded.mutate({ id: d.id, branded: !d.isBranded })}
                    className={
                      'w-9 h-9 rounded-lg flex items-center justify-center ' +
                      (d.isBranded ? 'bg-blue-600 text-white' : 'bg-blue-50 text-blue-700')
                    }
                    title={d.isBranded ? 'Brenddan olish' : 'Brendli qilish'}
                  >
                    <Crown size={16} />
                  </button>
                )}
                <button
                  onClick={() => {
                    if (confirm(`${d.fullName} o'chirilsinmi?`))
                      remove.mutate(d.id);
                  }}
                  className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600"
                  title="O'chirish"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="card overflow-hidden hidden lg:block">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="th">Haydovchi</th>
              <th className="th">Telefon</th>
              <th className="th">Email</th>
              <th className="th">Status</th>
              <th className="th text-right">Balans</th>
              <th className="th text-right">Safarlar</th>
              <th className="th">Yaratilgan</th>
              <th className="th text-right">Amallar</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-neutral-500">
                  Yuklanmoqda…
                </td>
              </tr>
            )}
            {!isLoading && (!data || data.length === 0) && (
              <tr>
                <td colSpan={8} className="p-10 text-center text-neutral-500">
                  Hozircha haydovchi yo'q.
                  <br />
                  <span className="text-xs">
                    Yangi haydovchi qo'shing yoki ular Telegram orqali ro'yxatdan o'tsin.
                  </span>
                </td>
              </tr>
            )}
            {data?.map((d) => (
              <tr
                key={d.id}
                className={
                  'hover:bg-neutral-50 transition-colors ' +
                  (!d.isActive ? 'opacity-60' : '')
                }
              >
                <td className="td">
                  <div className="flex items-center gap-3">
                    <DriverAvatar
                      fullName={d.fullName}
                      avatarUrl={d.avatarUrl}
                      size={36}
                    />
                    <span className="font-semibold">{d.fullName}</span>
                    {d.kind === 'courier' && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-violet-50 text-violet-700 border border-violet-200">
                        <Bike size={11} /> Kuryer
                      </span>
                    )}
                  </div>
                </td>
                <td className="td font-mono text-xs">{d.phone}</td>
                <td className="td text-neutral-500">
                  {d.email ?? <span className="text-neutral-300">—</span>}
                </td>
                <td className="td">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span
                      className={
                        'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ' +
                        (d.isOnline
                          ? 'bg-green-50 text-green-700 border border-green-200'
                          : 'bg-neutral-100 text-neutral-500 border border-neutral-200')
                      }
                    >
                      <span
                        className={
                          'w-1.5 h-1.5 rounded-full ' +
                          (d.isOnline ? 'bg-green-500 animate-pulse' : 'bg-neutral-400')
                        }
                      />
                      {d.isOnline ? 'Online' : 'Offline'}
                    </span>
                    {!d.isApproved && (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-orange-50 text-orange-700 border border-orange-200">
                        Tasdiq kerak
                      </span>
                    )}
                    {!d.isActive && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-red-50 text-red-700 border border-red-200">
                        <Ban size={11} /> Bloklangan
                      </span>
                    )}
                  </div>
                </td>
                <td className="td text-right font-bold tabular-nums">
                  {Number(d.balance).toLocaleString('uz')}
                  <span className="text-[10px] text-neutral-500 ml-1 font-normal">
                    so'm
                  </span>
                </td>
                <td className="td text-right tabular-nums font-semibold">{d.ordersCount ?? 0}</td>
                <td className="td text-neutral-500 text-xs">
                  {fmtDate(d.createdAt)}
                </td>
                <td className="td">
                  <div className="flex gap-1 justify-end">
                    {showDeleted ? (
                      <button
                        onClick={() => restore.mutate(d.id)}
                        className="h-8 px-3 rounded-lg flex items-center gap-1.5 bg-green-600 text-white text-xs font-bold hover:bg-green-700"
                      >
                        <RotateCcw size={14} /> Tiklash
                      </button>
                    ) : !d.isApproved ? (
                      <button
                        onClick={() => approve.mutate(d.id)}
                        title="Tasdiqlash"
                        className="w-8 h-8 rounded-lg flex items-center justify-center bg-green-600 text-white hover:bg-green-700"
                      >
                        <Check size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => {
                          if (
                            confirm(`${d.fullName} tasdig'i bekor qilinsinmi?`)
                          )
                            reject.mutate(d.id);
                        }}
                        title="Tasdiqni olib tashlash"
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-orange-50 text-orange-700"
                      >
                        <X size={16} />
                      </button>
                    )}
                    <Link
                      href={`/drivers/${d.id}`}
                      title="Ko'rish"
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-neutral-100 text-neutral-600"
                    >
                      <Eye size={16} />
                    </Link>
                    <button
                      onClick={() => setAdjusting(d)}
                      title="Balansga ta'sir"
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-green-50 text-green-700"
                    >
                      <Wallet size={16} />
                    </button>
                    {d.isActive ? (
                      <button
                        onClick={() => {
                          if (confirm(`${d.fullName} bloklansinmi?`))
                            block.mutate(d.id);
                        }}
                        title="Bloklash"
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-600"
                      >
                        <Ban size={16} />
                      </button>
                    ) : (
                      <button
                        onClick={() => unblock.mutate(d.id)}
                        title="Blokdan chiqarish"
                        className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-emerald-50 text-emerald-700"
                      >
                        <ShieldCheck size={16} />
                      </button>
                    )}
                    {!showDeleted && (
                      <button
                        onClick={() => branded.mutate({ id: d.id, branded: !d.isBranded })}
                        className={
                          'w-8 h-8 rounded-lg flex items-center justify-center ' +
                          (d.isBranded
                            ? 'bg-blue-600 text-white hover:bg-blue-700'
                            : 'hover:bg-blue-50 text-blue-700')
                        }
                        title={d.isBranded ? 'Brenddan olish' : 'Brendli qilish'}
                      >
                        <Crown size={16} />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        if (confirm(`${d.fullName} o'chirilsinmi?`))
                          remove.mutate(d.id);
                      }}
                      title="O'chirish"
                      className="w-8 h-8 rounded-lg flex items-center justify-center hover:bg-red-50 text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {createOpen && <CreateDriverModal onClose={() => setCreateOpen(false)} />}
      {adjusting && (
        <AdjustBalanceModal
          driver={adjusting}
          onClose={() => setAdjusting(null)}
        />
      )}
    </Shell>
  );
}


function CreateDriverModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState(genPassword());
  const [kind, setKind] = useState<'taxi' | 'courier'>('taxi');
  const [created, setCreated] = useState<
    { password: string; phone: string; email: string | null } | null
  >(null);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const mut = useMutation({
    mutationFn: async () => {
      if (!fullName.trim()) throw new Error('Ism kerak');
      if (!/^\+?\d{9,15}$/.test(phone.replace(/\s/g, '')))
        throw new Error('Telefon noto‘g‘ri');
      if (email.trim() && !/.+@.+\..+/.test(email.trim()))
        throw new Error('Email noto‘g‘ri');
      if (password.length < 6) throw new Error('Parol kamida 6 belgi');
      const body: any = {
        fullName: fullName.trim(),
        phone: phone.replace(/\s/g, ''),
        password,
        kind,
      };
      if (email.trim()) body.email = email.trim();
      const res = (await api.post('/admin/drivers', body)).data;
      // A revived (previously deleted) account keeps its old type — fix it.
      const id = res?.driver?.id;
      if (id && res.driver.kind && res.driver.kind !== kind) {
        await api.patch(`/admin/drivers/${id}/kind`, { kind }).catch(() => undefined);
      }
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] });
      setCreated({ password, phone, email: email.trim() || null });
    },
    onError: (e: any) => {
      const m = e?.response?.data?.message ?? e?.message;
      setErrMsg(Array.isArray(m) ? m.join(', ') : m ?? 'Xato');
    },
  });

  return (
    <Modal onClose={onClose} title="Yangi haydovchi">
      {!created ? (
        <div className="space-y-4">
          {/* Not a <label>: clicking the caption would press the first button. */}
          <div className="mb-2">
            <span className="text-sm text-slate-500">Turi</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(
                [
                  ['taxi', 'Taksi', CarFront],
                  ['courier', 'Kuryer', Bike],
                ] as const
              ).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setKind(value)}
                  className={
                    'h-10 rounded-lg border text-sm font-bold inline-flex items-center justify-center gap-1.5 ' +
                    (kind === value
                      ? 'bg-ink text-gold border-ink'
                      : 'bg-white text-neutral-500 border-line')
                  }
                >
                  <Icon size={16} /> {label}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-400 mt-1">
              {kind === 'courier'
                ? 'Kuryer faqat ovqat yetkazish buyurtmalarini oladi (mashina shart emas).'
                : 'Taksi haydovchi safarlar bilan birga ovqat yetkazishni ham olishi mumkin.'}
            </p>
          </div>
          <Field label="Ism familiya">
            <input
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              className="w-full h-10 px-3 border rounded"
            />
          </Field>
          <Field label="Telefon">
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full h-10 px-3 border rounded"
              placeholder="+998901234567"
            />
          </Field>
          <Field label="Email (ixtiyoriy — reset uchun)">
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full h-10 px-3 border rounded"
              placeholder="driver@example.com"
            />
          </Field>
          <Field label="Parol (kamida 6 belgi)">
            <div className="flex gap-2">
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="flex-1 h-10 px-3 border rounded font-mono"
              />
              <button
                type="button"
                onClick={() => setPassword(genPassword())}
                className="px-3 h-10 border rounded text-sm"
              >
                Random
              </button>
            </div>
          </Field>
          {errMsg && <p className="text-red-600 text-sm">{errMsg}</p>}
          <button
            disabled={mut.isPending}
            onClick={() => {
              setErrMsg(null);
              mut.mutate();
            }}
            className="w-full h-10 bg-ink text-gold rounded font-semibold"
          >
            Yaratish
          </button>
        </div>
      ) : (
        <div className="space-y-3 text-center">
          <p className="text-slate-600">
            Haydovchiga login ma'lumotlarni yetkazing:
          </p>
          <div className="text-sm text-left bg-slate-50 p-3 rounded space-y-1">
            <p>📞 <b>{created.phone}</b></p>
            {created.email && <p>📧 <b>{created.email}</b></p>}
          </div>
          <p className="text-xs text-slate-500">Parol:</p>
          <p className="text-2xl font-mono font-bold bg-slate-100 py-4 px-2 rounded break-all">
            {created.password}
          </p>
          <button
            onClick={onClose}
            className="w-full h-10 bg-ink text-gold rounded font-semibold"
          >
            Yopish
          </button>
        </div>
      )}
    </Modal>
  );
}

function AdjustBalanceModal({
  driver,
  onClose,
}: {
  driver: DriverRow;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<'topup' | 'withdraw'>('topup');
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');

  const mut = useMutation({
    mutationFn: async () => {
      const signed = mode === 'topup' ? Number(amount) : -Number(amount);
      return (
        await api.post(`/admin/drivers/${driver.id}/balance`, {
          amount: signed,
          note,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['drivers'] });
      onClose();
    },
  });

  return (
    <Modal onClose={onClose} title={`Balans — ${driver.fullName}`}>
      <div className="flex gap-2 mb-4">
        <button
          onClick={() => setMode('topup')}
          className={
            'flex-1 h-10 rounded font-medium ' +
            (mode === 'topup'
              ? 'bg-green-600 text-white'
              : 'bg-slate-100 text-slate-600')
          }
        >
          To‘ldirish
        </button>
        <button
          onClick={() => setMode('withdraw')}
          className={
            'flex-1 h-10 rounded font-medium ' +
            (mode === 'withdraw'
              ? 'bg-red-600 text-white'
              : 'bg-slate-100 text-slate-600')
          }
        >
          Ayirish
        </button>
      </div>
      <Field label="Summa (so‘m)">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value.replace(/[^\d.]/g, ''))}
          className="w-full h-10 px-3 border rounded"
        />
      </Field>
      <Field label="Izoh">
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className="w-full h-10 px-3 border rounded"
        />
      </Field>
      <button
        onClick={() => mut.mutate()}
        disabled={mut.isPending || !amount}
        className="w-full h-10 mt-4 bg-ink text-gold rounded font-semibold disabled:opacity-60"
      >
        Saqlash
      </button>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block mb-2">
      <span className="text-sm text-slate-500">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

function Modal({
  onClose,
  title,
  children,
}: {
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 z-40 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-lg">{title}</h3>
          <button onClick={onClose} className="text-slate-500">
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function genPassword() {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 10; i++) {
    out += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return out;
}
