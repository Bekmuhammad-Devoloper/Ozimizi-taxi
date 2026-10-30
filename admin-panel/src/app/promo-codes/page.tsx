'use client';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Ticket,
  Pencil,
  Trash2,
  Power,
  Users,
  CalendarClock,
  ChevronDown,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';
import { fmtShort } from '@/lib/format';
import { Field, IconBtn, Modal } from '@/components/ui';

interface PromoRow {
  id: string;
  code: string;
  discountAmount: string;
  maxUses: number | null;
  maxPercentPerRide?: string | number | null;
  maxAmountPerRide?: string | number | null;
  minRides?: number | null;
  usedCount: number;
  startsAt: string | null;
  endsAt: string | null;
  isActive: boolean;
  createdAt: string;
  appliedCount: number;
  appliedTotal: number;
}

interface Redemption {
  id: string;
  amount: string;
  remaining?: string;
  usedAt: string | null;
  createdAt: string;
  client: { firstName: string; phonePrimary: string } | null;
}

interface FormState {
  code: string;
  discountAmount: string;
  maxUses: string;
  maxPercentPerRide: string;
  maxAmountPerRide: string;
  minRides: string;
  startsAt: string;
  endsAt: string;
}

const EMPTY_FORM: FormState = {
  code: '',
  discountAmount: '',
  maxUses: '',
  maxPercentPerRide: '',
  maxAmountPerRide: '',
  minRides: '',
  startsAt: '',
  endsAt: '',
};

const fmt = (v: string | number) => Number(v).toLocaleString('uz');

const fmtDate = fmtShort;

/** ISO → value for <input type="datetime-local"> in local time. */
function toLocalInput(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
    d.getHours(),
  )}:${pad(d.getMinutes())}`;
}

function promoState(p: PromoRow): { label: string; cls: string } {
  const now = Date.now();
  if (!p.isActive) return { label: 'O‘chirilgan', cls: 'bg-neutral-100 text-neutral-500' };
  if (p.startsAt && new Date(p.startsAt).getTime() > now)
    return { label: 'Boshlanmagan', cls: 'bg-blue-50 text-blue-700' };
  if (p.endsAt && new Date(p.endsAt).getTime() < now)
    return { label: 'Muddati tugagan', cls: 'bg-orange-50 text-orange-700' };
  if (p.maxUses != null && p.usedCount >= p.maxUses)
    return { label: 'O‘rinlar tugagan', cls: 'bg-orange-50 text-orange-700' };
  return { label: 'Faol', cls: 'bg-emerald-50 text-emerald-700' };
}

export default function PromoCodesPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<PromoRow | 'new' | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['promo-codes'],
    queryFn: async () => (await api.get<PromoRow[]>('/admin/promo-codes')).data,
    refetchInterval: 30_000,
  });

  const toggle = useMutation({
    mutationFn: async (p: PromoRow) =>
      (await api.patch(`/admin/promo-codes/${p.id}`, { isActive: !p.isActive }))
        .data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo-codes'] }),
  });

  const remove = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete(`/admin/promo-codes/${id}`)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['promo-codes'] }),
  });

  return (
    <Shell
      title="Promo kodlar"
      subtitle="Aksiya: belgilangan vaqt ichida yoki birinchi N ta mijozga chegirma"
      actions={
        <button onClick={() => setEditing('new')} className="btn-primary">
          <Plus size={16} /> Yangi promo kod
        </button>
      }
    >
      <div className="card p-4 mb-4 text-xs text-neutral-600 leading-relaxed">
        Mijoz botda <b>🎟 Promo kod</b> tugmasini bosib kodni yozadi — summa
        uning <b>bonus balansiga</b> tushadi (xazinadan). Mijoz bonusni istalgan
        safarda “Bonusdan to‘lash” orqali ishlatadi, haydovchi tasdiqlaydi.{' '}
        <b>Bir safarda ishlatish chegarasi</b> har kod uchun alohida: narxning
        foizi va/yoki so‘m — qolgani keyingi safarlarga o‘tadi (bo‘sh — bitta
        safarda hammasini ishlatish mumkin). “Soni” belgilansa — kodni faqat
        birinchi shuncha mijoz oladi.
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <Ticket size={28} className="mx-auto mb-2 text-neutral-300" />
          Hozircha promo kod yo‘q
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((p) => {
            const st = promoState(p);
            const open = openId === p.id;
            return (
              <li key={p.id} className="card">
                <div className="p-4 flex items-center gap-3 flex-wrap">
                  <span className="w-10 h-10 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center shrink-0">
                    <Ticket size={18} />
                  </span>
                  <div className="flex-1 min-w-[180px]">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-base tracking-wide">
                        {p.code}
                      </span>
                      <span
                        className={
                          'text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' +
                          st.cls
                        }
                      >
                        {st.label}
                      </span>
                    </div>
                    <p className="text-sm mt-0.5">
                      <b>{fmt(p.discountAmount)} so‘m</b> bonus
                      <span className="text-neutral-500"> → balansga</span>
                      {(Number(p.maxPercentPerRide ?? 0) > 0 || Number(p.maxAmountPerRide ?? 0) > 0) && (
                        <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 text-[11px] font-semibold">
                          safarda:{' '}
                          {[
                            Number(p.maxPercentPerRide ?? 0) > 0 ? `${Number(p.maxPercentPerRide)}%` : null,
                            Number(p.maxAmountPerRide ?? 0) > 0 ? `${fmt(p.maxAmountPerRide ?? 0)} so‘m` : null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </span>
                      )}
                      {Number(p.minRides ?? 0) > 0 && (
                        <span
                          className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 text-[11px] font-semibold"
                          title="Mijoz shuncha safarni yakunlagandan keyin ishlata oladi"
                        >
                          🔒 {Number(p.minRides)} safardan keyin
                        </span>
                      )}
                    </p>
                    <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-neutral-500">
                      <span className="inline-flex items-center gap-1">
                        <Users size={12} />
                        Olgan: {p.usedCount}
                        {p.maxUses != null ? ` / ${p.maxUses}` : ' (cheklanmagan)'}
                        {' · '}ishlatgan: {p.appliedCount}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock size={12} />
                        {p.startsAt ? fmtDate(p.startsAt) : 'hozirdan'} →{' '}
                        {p.endsAt ? fmtDate(p.endsAt) : 'muddatsiz'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <IconBtn
                      title={open ? 'Yopish' : 'Kimlar oldi'}
                      onClick={() => setOpenId(open ? null : p.id)}
                    >
                      <ChevronDown
                        size={16}
                        className={open ? 'rotate-180 transition' : 'transition'}
                      />
                    </IconBtn>
                    <IconBtn title="Tahrirlash" onClick={() => setEditing(p)}>
                      <Pencil size={15} />
                    </IconBtn>
                    <IconBtn
                      title={p.isActive ? 'O‘chirib qo‘yish' : 'Yoqish'}
                      onClick={() => toggle.mutate(p)}
                      tone={p.isActive ? 'default' : 'green'}
                    >
                      <Power size={15} />
                    </IconBtn>
                    <IconBtn
                      title="O‘chirish"
                      tone="red"
                      onClick={() => {
                        if (confirm(`${p.code} promo kodi butunlay o‘chirilsinmi?`))
                          remove.mutate(p.id);
                      }}
                    >
                      <Trash2 size={15} />
                    </IconBtn>
                  </div>
                </div>
                {open && <Redemptions promoId={p.id} />}
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <PromoForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </Shell>
  );
}

function Redemptions({ promoId }: { promoId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['promo-redemptions', promoId],
    queryFn: async () =>
      (await api.get<Redemption[]>(`/admin/promo-codes/${promoId}/redemptions`))
        .data,
  });
  return (
    <div className="border-t border-line px-4 py-3 bg-neutral-50/60 rounded-b-2xl">
      {isLoading ? (
        <p className="text-xs text-neutral-500">Yuklanmoqda…</p>
      ) : !data?.length ? (
        <p className="text-xs text-neutral-500">Hali hech kim olmagan</p>
      ) : (
        <ul className="divide-y divide-line">
          {data.map((r, i) => (
            <li key={r.id} className="py-2 flex items-center gap-3 text-sm">
              <span className="w-6 text-[11px] text-neutral-400 tabular-nums">
                {data.length - i}.
              </span>
              <span className="flex-1 min-w-0 truncate">
                {r.client?.firstName ?? '—'}{' '}
                <span className="text-neutral-500 font-mono text-xs">
                  {r.client?.phonePrimary}
                </span>
              </span>
              <span className="text-[11px] text-neutral-500">
                {fmtDate(r.createdAt)}
              </span>
              <span
                className={
                  'text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' +
                  (r.usedAt
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-neutral-100 text-neutral-500')
                }
              >
                {Number(r.remaining ?? 0) > 0
                  ? `Qoldiq ${fmt(r.remaining ?? 0)}`
                  : r.usedAt
                    ? 'Ishlatildi'
                    : 'Kutilmoqda'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function PromoForm({
  initial,
  onClose,
}: {
  initial: PromoRow | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(
    initial
      ? {
          code: initial.code,
          discountAmount: String(Number(initial.discountAmount)),
          maxUses: initial.maxUses != null ? String(initial.maxUses) : '',
          maxPercentPerRide: Number(initial.maxPercentPerRide ?? 0) > 0 ? String(Number(initial.maxPercentPerRide)) : '',
          maxAmountPerRide: Number(initial.maxAmountPerRide ?? 0) > 0 ? String(Number(initial.maxAmountPerRide)) : '',
          minRides: Number(initial.minRides ?? 0) > 0 ? String(Number(initial.minRides)) : '',
          startsAt: toLocalInput(initial.startsAt),
          endsAt: toLocalInput(initial.endsAt),
        }
      : EMPTY_FORM,
  );
  const [err, setErr] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const body = {
        code: form.code.trim(),
        discountAmount: Number(form.discountAmount),
        maxUses: form.maxUses ? Number(form.maxUses) : null,
        maxPercentPerRide: form.maxPercentPerRide ? Number(form.maxPercentPerRide) : 0,
        maxAmountPerRide: form.maxAmountPerRide ? Number(form.maxAmountPerRide) : 0,
        minRides: form.minRides ? Number(form.minRides) : 0,
        startsAt: form.startsAt ? new Date(form.startsAt).toISOString() : null,
        endsAt: form.endsAt ? new Date(form.endsAt).toISOString() : null,
      };
      return initial
        ? (await api.patch(`/admin/promo-codes/${initial.id}`, body)).data
        : (await api.post('/admin/promo-codes', body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['promo-codes'] });
      onClose();
    },
    onError: (e: any) => {
      const m = e?.response?.data?.message;
      setErr(Array.isArray(m) ? m.join(', ') : m ?? 'Xato');
    },
  });

  const set = (k: keyof FormState, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  return (
    <Modal title={initial ? 'Promo kodni tahrirlash' : 'Yangi promo kod'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          save.mutate();
        }}
        className="space-y-3"
      >
        <Field label="Kod">
          <input
            value={form.code}
            onChange={(e) => set('code', e.target.value.toUpperCase())}
            placeholder="YANGIYIL"
            className="input font-mono tracking-wide"
            required
          />
        </Field>
        <Field label="Chegirma summasi (so‘m)">
          <input
            value={form.discountAmount}
            onChange={(e) => set('discountAmount', e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="5000"
            className="input tabular-nums"
            required
          />
        </Field>
        <Field label="Nechta mijozga (bo‘sh — cheklanmagan)">
          <input
            value={form.maxUses}
            onChange={(e) => set('maxUses', e.target.value.replace(/[^\d]/g, ''))}
            inputMode="numeric"
            placeholder="masalan, 100 — birinchi 100 kishi"
            className="input tabular-nums"
          />
        </Field>
        <div className="rounded-xl border border-line bg-neutral-50/60 p-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-0.5">
            Bir safarda ishlatish chegarasi
          </p>
          <p className="text-[11px] text-neutral-500 mb-2">
            Bo‘sh qoldirilsa — mijoz butun summani bitta safarda ishlatishi mumkin.
            Ikkalasi ham berilsa, kichigi olinadi.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Narxning % igacha">
              <input
                value={form.maxPercentPerRide}
                onChange={(e) => set('maxPercentPerRide', e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                inputMode="numeric"
                placeholder="masalan, 30"
                className="input tabular-nums"
              />
            </Field>
            <Field label="Ko‘pi bilan (so‘m)">
              <input
                value={form.maxAmountPerRide}
                onChange={(e) => set('maxAmountPerRide', e.target.value.replace(/[^\d]/g, ''))}
                inputMode="numeric"
                placeholder="masalan, 5000"
                className="input tabular-nums"
              />
            </Field>
          </div>
        </div>
        <Field label="Nechta safardan keyin ishlaydi (0 yoki bo‘sh — darhol)">
          <input
            value={form.minRides}
            onChange={(e) => set('minRides', e.target.value.replace(/[^\d]/g, '').slice(0, 4))}
            inputMode="numeric"
            placeholder="masalan, 3 — mijoz 3 ta safarni yakunlagach"
            className="input tabular-nums"
          />
          <p className="mt-1 text-[11px] text-neutral-500">
            Kod kiritilganda summa balansga darhol tushadi, lekin mijoz shuncha safarni
            yakunlamaguncha uni ishlata olmaydi (bot va ilovada 🔒 bilan ko‘rsatiladi).
          </p>
        </Field>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Boshlanish (ixtiyoriy)">
            <input
              type="datetime-local"
              value={form.startsAt}
              onChange={(e) => set('startsAt', e.target.value)}
              className="input"
            />
          </Field>
          <Field label="Tugash (ixtiyoriy)">
            <input
              type="datetime-local"
              value={form.endsAt}
              onChange={(e) => set('endsAt', e.target.value)}
              className="input"
            />
          </Field>
        </div>
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
