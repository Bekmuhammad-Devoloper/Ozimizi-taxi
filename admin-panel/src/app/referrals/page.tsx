'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Link2,
  Pencil,
  Trash2,
  Power,
  Copy,
  Check,
  Banknote,
  ChevronDown,
  Undo2,
  Users,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtShort } from '@/lib/format';
import { Field, IconBtn, Modal } from '@/components/ui';

interface LinkRow {
  id: string;
  code: string;
  ownerName: string;
  ownerPhone: string | null;
  rewardAmount: string;
  isActive: boolean;
  note: string | null;
  createdAt: string;
  signupsCount: number;
  unpaidCount: number;
  unpaidSum: number;
  paidSum: number;
}

interface Signup {
  id: string;
  rewardAmount: string;
  paidAt: string | null;
  createdAt: string;
  client: {
    firstName: string;
    phonePrimary: string;
    completedRides?: number;
  } | null;
}

const fmt = (v: string | number) => Number(v).toLocaleString('uz');
const fmtDate = fmtShort;
const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const qrSrc = (text: string, size = 240) => `${API}/public/qr.png?text=${encodeURIComponent(text)}&size=${size}`;

export default function ReferralsPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<LinkRow | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['referral-links'],
    queryFn: async () => (await api.get<LinkRow[]>('/admin/referral-links')).data,
    refetchInterval: 30_000,
  });
  const { data: bot } = useQuery({
    queryKey: ['referral-bot'],
    queryFn: async () =>
      (await api.get<{ username: string | null }>('/admin/referral-links/bot'))
        .data,
    staleTime: Infinity,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['referral-links'] });
    qc.invalidateQueries({ queryKey: ['referral-signups'] });
  };

  const toggle = useMutation({
    mutationFn: async (l: LinkRow) =>
      (await api.patch(`/admin/referral-links/${l.id}`, { isActive: !l.isActive }))
        .data,
    onSuccess: invalidate,
  });
  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/referral-links/${id}`)).data,
    onSuccess: invalidate,
    onError: (e: any) => alert(e?.response?.data?.message ?? 'Xato'),
  });
  const payAll = useMutation({
    mutationFn: async (id: string) =>
      (await api.post(`/admin/referral-links/${id}/pay-all`)).data,
    onSuccess: invalidate,
  });

  const linkFor = (code: string) =>
    bot?.username ? `https://t.me/${bot.username}?start=${code}` : code;

  const copy = async (l: LinkRow) => {
    try {
      await navigator.clipboard.writeText(linkFor(l.code));
      setCopied(l.id);
      setTimeout(() => setCopied(null), 1500);
    } catch {
      /* clipboard blocked — link is visible anyway */
    }
  };

  const totalUnpaid = (data ?? []).reduce((s, l) => s + l.unpaidSum, 0);

  return (
    <Shell
      title="Referral linklar"
      subtitle="Admin beradigan taklif havolalari va naqd mukofotlar"
      actions={
        <button onClick={() => setEditing('new')} className="btn-primary">
          <Plus size={16} /> Yangi link
        </button>
      }
    >
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <Stat label="Linklar" value={String(data?.length ?? 0)} />
        <Stat
          label="Jami taklif qilinganlar"
          value={String((data ?? []).reduce((s, l) => s + l.signupsCount, 0))}
        />
        <Stat label="To‘lanishi kerak" value={`${fmt(totalUnpaid)} so‘m`} accent />
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <Link2 size={28} className="mx-auto mb-2 text-neutral-300" />
          Hozircha link yo‘q. “Yangi link” orqali kimgadir link bering.
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((l) => {
            const open = openId === l.id;
            return (
              <li key={l.id} className={'card ' + (l.isActive ? '' : 'opacity-70')}>
                <div className="p-4 flex items-start gap-3 flex-wrap">
                  <a
                    href={qrSrc(linkFor(l.code), 720)}
                    target="_blank"
                    rel="noreferrer"
                    title="QR kodni katta ochish / yuklab olish"
                    className="w-20 h-20 rounded-xl border border-line overflow-hidden bg-white shrink-0"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={qrSrc(linkFor(l.code))} alt="QR" className="w-full h-full" />
                  </a>
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-semibold">{l.ownerName}</p>
                      {l.ownerPhone && (
                        <span className="text-xs text-neutral-500 font-mono">
                          {l.ownerPhone}
                        </span>
                      )}
                      {!l.isActive && (
                        <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                          O‘chirilgan
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => copy(l)}
                      className="mt-1 inline-flex items-center gap-1.5 text-xs font-mono text-blue-600 hover:underline break-all text-left"
                      title="Nusxalash"
                    >
                      {copied === l.id ? <Check size={12} /> : <Copy size={12} />}
                      {linkFor(l.code)}
                    </button>
                    <div className="flex items-center gap-3 flex-wrap mt-1.5 text-[11px] text-neutral-500">
                      <span>Har bir mijoz uchun: <b className="text-ink">{fmt(l.rewardAmount)} so‘m</b></span>
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} /> {l.signupsCount} ta mijoz
                      </span>
                      <span>To‘langan: {fmt(l.paidSum)} so‘m</span>
                      {l.unpaidSum > 0 && (
                        <span className="text-orange-700 font-semibold">
                          Qarz: {fmt(l.unpaidSum)} so‘m ({l.unpaidCount} ta)
                        </span>
                      )}
                    </div>
                    {l.note && (
                      <p className="text-xs text-neutral-500 mt-1 italic">{l.note}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {l.unpaidSum > 0 && (
                      <button
                        onClick={() => {
                          if (
                            confirm(
                              `${l.ownerName}ga ${fmt(l.unpaidSum)} so‘m naqd berildimi? Hammasi “to‘landi” deb belgilanadi.`,
                            )
                          )
                            payAll.mutate(l.id);
                        }}
                        className="h-9 px-3 inline-flex items-center gap-1.5 rounded-lg bg-green-600 text-white text-xs font-bold"
                      >
                        <Banknote size={14} /> Naqd berildi
                      </button>
                    )}
                    <IconBtn
                      title={open ? 'Yopish' : 'Taklif qilinganlar'}
                      onClick={() => setOpenId(open ? null : l.id)}
                    >
                      <ChevronDown size={16} className={open ? 'rotate-180 transition' : 'transition'} />
                    </IconBtn>
                    <IconBtn title="Tahrirlash" onClick={() => setEditing(l)}>
                      <Pencil size={15} />
                    </IconBtn>
                    <IconBtn
                      title={l.isActive ? 'O‘chirib qo‘yish' : 'Yoqish'}
                      onClick={() => toggle.mutate(l)}
                      tone={l.isActive ? 'default' : 'green'}
                    >
                      <Power size={15} />
                    </IconBtn>
                    <IconBtn
                      title="O‘chirish"
                      tone="red"
                      onClick={() => {
                        if (confirm(`${l.ownerName} linki butunlay o‘chirilsinmi?`))
                          remove.mutate(l.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </IconBtn>
                  </div>
                </div>
                {open && <Signups linkId={l.id} onChange={invalidate} />}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <LinkForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Shell>
  );
}

function Signups({ linkId, onChange }: { linkId: string; onChange: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['referral-signups', linkId],
    queryFn: async () =>
      (await api.get<Signup[]>(`/admin/referral-links/${linkId}/signups`)).data,
  });
  const pay = useMutation({
    mutationFn: async (s: Signup) =>
      (
        await api.post(
          `/admin/referral-links/signups/${s.id}/${s.paidAt ? 'unpay' : 'pay'}`,
        )
      ).data,
    onSuccess: onChange,
  });

  return (
    <div className="border-t border-line px-4 py-3 bg-neutral-50/60 rounded-b-2xl">
      {isLoading ? (
        <p className="text-xs text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <p className="text-xs text-neutral-500">Bu link orqali hali hech kim kelmagan</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((s) => (
            <li key={s.id} className="py-2 flex items-center gap-3 text-sm flex-wrap">
              <span className="flex-1 min-w-[140px] truncate">
                {s.client?.firstName ?? '—'}{' '}
                <span className="text-neutral-500 font-mono text-xs">
                  {s.client?.phonePrimary}
                </span>
              </span>
              <span className="text-[11px] text-neutral-500">
                {s.client?.completedRides ?? 0} ta safar
              </span>
              <span className="text-[11px] text-neutral-500">{fmtDate(s.createdAt)}</span>
              <span className="text-xs font-semibold tabular-nums">
                {fmt(s.rewardAmount)} so‘m
              </span>
              <button
                onClick={() => pay.mutate(s)}
                title={s.paidAt ? 'To‘lanmagan deb qaytarish' : 'Naqd berildi'}
                className={
                  'h-7 px-2 inline-flex items-center gap-1 rounded-md text-[11px] font-bold ' +
                  (s.paidAt
                    ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                    : 'bg-orange-50 text-orange-700 hover:bg-orange-100')
                }
              >
                {s.paidAt ? (
                  <>
                    <Check size={12} /> To‘landi <Undo2 size={11} className="opacity-60" />
                  </>
                ) : (
                  <>
                    <Banknote size={12} /> To‘lash
                  </>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function LinkForm({ initial, onClose }: { initial: LinkRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    ownerName: initial?.ownerName ?? '',
    ownerPhone: initial?.ownerPhone ?? '',
    rewardAmount: initial ? String(Number(initial.rewardAmount)) : '',
    code: initial?.code ?? '',
    note: initial?.note ?? '',
  });
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone || null,
        rewardAmount: Number(form.rewardAmount || 0),
        note: form.note || null,
        ...(form.code.trim() ? { code: form.code.trim() } : {}),
      };
      return initial
        ? (await api.patch(`/admin/referral-links/${initial.id}`, body)).data
        : (await api.post('/admin/referral-links', body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['referral-links'] });
      onClose();
    },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(', ') : m ?? 'Xato');
    },
  });

  const set = (k: keyof typeof form, v: string) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <Modal title={initial ? 'Linkni tahrirlash' : 'Yangi referral link'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          save.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Link egasi (ism)">
          <input
            value={form.ownerName}
            onChange={(e) => set('ownerName', e.target.value)}
            placeholder="Masalan, Aziz (bloger)"
            className="input"
            required
          />
        </Field>
        <Field label="Telefon (ixtiyoriy)">
          <input
            value={form.ownerPhone}
            onChange={(e) => set('ownerPhone', e.target.value)}
            placeholder="+998901234567"
            className="input font-mono"
          />
        </Field>
        <Field label="Har bir yangi mijoz uchun mukofot (so‘m)">
          <input
            value={form.rewardAmount}
            onChange={(e) => set('rewardAmount', e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="5000"
            className="input tabular-nums"
          />
        </Field>
        <Field label="Kod (bo‘sh qoldirsangiz — avtomatik)">
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value.replace(/[^A-Za-z0-9_-]/g, ''))}
            placeholder="aziz_blog"
            className="input font-mono"
          />
        </Field>
        {initial && form.code !== initial.code && (
          <p className="text-xs text-orange-700">
            Kod o‘zgarsa, eski link ishlamay qoladi.
          </p>
        )}
        <Field label="Izoh (ixtiyoriy)">
          <input
            value={form.note}
            onChange={(e) => set('note', e.target.value)}
            className="input"
          />
        </Field>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Bekor qilish
          </button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={'card p-4 ' + (accent ? 'border-l-4 border-l-gold' : '')}>
      <p className="label">{label}</p>
      <p className="text-xl font-extrabold tabular-nums mt-1">{value}</p>
    </div>
  );
}
