'use client';
import { useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  KeyRound,
  Copy,
  Check,
  Loader2,
  Send,
  FileBadge,
  Upload,
  CalendarDays,
  Image as ImageIcon,
} from 'lucide-react';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
const resolveUrl = (raw?: string | null) =>
  !raw ? '' : raw.startsWith('http') ? raw : API.replace(/\/$/, '') + (raw.startsWith('/') ? raw : '/' + raw);

/** Admin issues a new password (shown once, sent to the driver's Telegram). */
export function DriverAccessCard({
  driverId,
  phone,
  passwordChangedAt,
}: {
  driverId: string;
  phone: string;
  passwordChangedAt?: string | null;
}) {
  const qc = useQueryClient();
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState<{ password: string; notified: boolean } | null>(null);
  const [copied, setCopied] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const reset = useMutation({
    mutationFn: async () =>
      (await api.post(`/admin/drivers/${driverId}/password`, { password: custom.trim() || undefined })).data,
    onSuccess: (d) => {
      setResult({ password: d.password, notified: !!d.notified });
      setCustom('');
      setErr(null);
      qc.invalidateQueries({ queryKey: ['driver', driverId] });
    },
    onError: (e: any) => setErr(e?.response?.data?.message ?? 'Xato'),
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };

  return (
    <div className="card p-5">
      <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
        <KeyRound size={14} /> Ilovaga kirish
      </h3>
      <dl className="space-y-2 text-sm">
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Login (telefon)</dt>
          <dd className="font-mono font-semibold">{phone}</dd>
        </div>
        <div className="flex justify-between gap-3">
          <dt className="text-neutral-500">Parol</dt>
          <dd className="text-neutral-500 text-xs text-right">
            Shifrlangan holda saqlanadi, ko‘rib bo‘lmaydi.
            {passwordChangedAt ? ` Oxirgi yangilangan: ${fmtDateTime(passwordChangedAt)}` : ''}
          </dd>
        </div>
      </dl>

      <div className="mt-4 rounded-xl border border-line bg-neutral-50/60 p-3">
        <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 mb-2">Parolni yangilash</p>
        <div className="flex gap-2">
          <input
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            placeholder="Bo‘sh qoldirilsa — 6 xonali parol yaratiladi"
            className="input flex-1 font-mono"
          />
          <button
            onClick={() => {
              if (confirm(`${phone} uchun yangi parol o‘rnatilsinmi? Eski parol ishlamay qoladi.`)) reset.mutate();
            }}
            disabled={reset.isPending}
            className="btn-primary h-11 whitespace-nowrap"
          >
            {reset.isPending ? <Loader2 size={14} className="animate-spin" /> : <KeyRound size={14} />} Yangilash
          </button>
        </div>
        {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
        {result && (
          <div className="mt-3 rounded-lg bg-white border border-emerald-200 p-3">
            <p className="text-[11px] uppercase tracking-wider font-bold text-emerald-700">Yangi parol (bir marta ko‘rsatiladi)</p>
            <div className="mt-1 flex items-center gap-2">
              <code className="text-lg font-bold tracking-widest">{result.password}</code>
              <button
                onClick={() => copy(`Login: ${phone}\nParol: ${result.password}`)}
                className="h-8 px-2 rounded-lg border border-line text-xs inline-flex items-center gap-1"
              >
                {copied ? <Check size={12} /> : <Copy size={12} />} Nusxa
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500 inline-flex items-center gap-1">
              <Send size={11} />
              {result.notified
                ? 'Haydovchiga Telegram orqali yuborildi.'
                : 'Haydovchining Telegram chati topilmadi — parolni o‘zingiz yetkazing.'}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

type DocKind = 'license' | 'techPassport' | 'car' | 'avatar';

/** License number/expiry + document photos the admin can upload or replace. */
export function DriverDocumentsCard({
  driver,
}: {
  driver: {
    id: string;
    licenseNumber?: string | null;
    licenseExpiresAt?: string | null;
    licensePhotoUrl?: string | null;
    techPassportPhotoUrl?: string | null;
    carPhotoUrl?: string | null;
    avatarUrl?: string | null;
  };
}) {
  const qc = useQueryClient();
  const [num, setNum] = useState(driver.licenseNumber ?? '');
  const [exp, setExp] = useState(driver.licenseExpiresAt ? String(driver.licenseExpiresAt).slice(0, 10) : '');
  const [msg, setMsg] = useState<string | null>(null);
  const [uploading, setUploading] = useState<DocKind | null>(null);
  const inputs = useRef<Record<DocKind, HTMLInputElement | null>>({ license: null, techPassport: null, car: null, avatar: null });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['driver', driver.id] });

  const save = useMutation({
    mutationFn: async () =>
      (await api.patch(`/admin/drivers/${driver.id}/documents`, { licenseNumber: num, licenseExpiresAt: exp || null })).data,
    onSuccess: () => {
      setMsg('Saqlandi');
      setTimeout(() => setMsg(null), 1500);
      invalidate();
    },
    onError: (e: any) => setMsg(e?.response?.data?.message ?? 'Xato'),
  });

  const upload = async (kind: DocKind, file: File) => {
    setUploading(kind);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api.post(`/admin/drivers/${driver.id}/documents/${kind}`, fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      invalidate();
    } catch (e: any) {
      alert(e?.response?.data?.message ?? 'Yuklab bo‘lmadi');
    } finally {
      setUploading(null);
    }
  };

  const expired = exp && new Date(exp).getTime() < Date.now();
  const docs: { kind: DocKind; label: string; url?: string | null }[] = [
    { kind: 'license', label: 'Haydovchilik guvohnomasi (litsenziya)', url: driver.licensePhotoUrl },
    { kind: 'techPassport', label: 'Texnik pasport', url: driver.techPassportPhotoUrl },
    { kind: 'car', label: 'Avtomobil rasmi', url: driver.carPhotoUrl },
    { kind: 'avatar', label: 'Haydovchi rasmi', url: driver.avatarUrl },
  ];

  return (
    <div className="card p-5">
      <h3 className="font-bold text-sm uppercase tracking-wider text-neutral-500 mb-3 flex items-center gap-2">
        <FileBadge size={14} /> Hujjatlar va litsenziya
      </h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 items-end"
      >
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold">Litsenziya / guvohnoma raqami</span>
          <input value={num} onChange={(e) => setNum(e.target.value)} placeholder="AB 1234567" className="input mt-1 font-mono" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-wider text-neutral-500 font-bold inline-flex items-center gap-1">
            <CalendarDays size={11} /> Amal qilish muddati
          </span>
          <input type="date" value={exp} onChange={(e) => setExp(e.target.value)} className={'input mt-1 ' + (expired ? 'border-red-400' : '')} />
        </label>
        <button type="submit" disabled={save.isPending} className="btn-primary h-11">
          {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Saqlash
        </button>
      </form>
      {expired && <p className="mt-1 text-xs text-red-600 font-semibold">Litsenziya muddati tugagan!</p>}
      {msg && <p className="mt-1 text-xs text-neutral-500">{msg}</p>}

      <div className="mt-4 grid grid-cols-2 gap-3">
        {docs.map((d) => (
          <div key={d.kind} className="rounded-xl border border-line overflow-hidden bg-neutral-50/60">
            {d.url ? (
              <a href={resolveUrl(d.url)} target="_blank" rel="noreferrer" title="Kattalashtirish">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={resolveUrl(d.url)} alt={d.label} className="w-full aspect-[4/3] object-cover" />
              </a>
            ) : (
              <div className="w-full aspect-[4/3] flex items-center justify-center text-neutral-300">
                <ImageIcon size={28} />
              </div>
            )}
            <div className="p-2 flex items-center justify-between gap-2">
              <p className="text-[11px] font-semibold leading-tight">{d.label}</p>
              <input
                ref={(el) => {
                  inputs.current[d.kind] = el;
                }}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void upload(d.kind, f);
                  e.target.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => inputs.current[d.kind]?.click()}
                disabled={uploading === d.kind}
                className="h-8 px-2 rounded-lg border border-line bg-white text-[11px] font-semibold inline-flex items-center gap-1 whitespace-nowrap"
              >
                {uploading === d.kind ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                {d.url ? 'Almashtirish' : 'Yuklash'}
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
