'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Instagram, MessageCircle, Wallet, Gift } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

interface SettingsMap {
  instagram_url_1: string;
  instagram_url_2: string;
  instagram_url_3: string;
  admin_contact_url: string;
  payment_bot_url: string;
  referral_bonus_client: string;
  referral_bonus_referrer: string;
}

const EMPTY: SettingsMap = {
  instagram_url_1: '',
  instagram_url_2: '',
  instagram_url_3: '',
  admin_contact_url: '',
  payment_bot_url: '',
  referral_bonus_client: '0',
  referral_bonus_referrer: '0',
};

export default function SettingsPage() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings'],
    queryFn: async () =>
      (await api.get<SettingsMap>('/admin/settings')).data,
  });

  const [form, setForm] = useState<SettingsMap>(EMPTY);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (data) setForm({ ...EMPTY, ...data });
  }, [data]);

  const save = useMutation({
    mutationFn: async () => (await api.patch('/admin/settings', form)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settings'] });
      setMsg('Saqlandi');
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e: any) => {
      setMsg(e?.response?.data?.message ?? 'Xato');
    },
  });

  const update = (k: keyof SettingsMap, v: string) =>
    setForm((s) => ({ ...s, [k]: v }));

  return (
    <Shell
      title="Sozlamalar"
      subtitle="Bot va PWA da ko‘rsatiladigan havolalar"
    >
      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : (
        <div className="space-y-6 max-w-2xl">
          <Section icon={<Instagram size={18} />} title="Instagram sahifalar">
            <p className="text-xs text-neutral-500 mb-3">
              Bo‘sh qoldirilgan havolalar bot menyusida ko‘rsatilmaydi. Masalan:{' '}
              <span className="font-mono">https://instagram.com/ozimizni_taxi</span>
            </p>
            {([1, 2, 3] as const).map((i) => {
              const key = `instagram_url_${i}` as keyof SettingsMap;
              return (
                <Field key={key} label={`Instagram ${i}`}>
                  <input
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value)}
                    placeholder="https://instagram.com/…"
                    className="input"
                  />
                </Field>
              );
            })}
          </Section>

          <Section
            icon={<MessageCircle size={18} />}
            title="Admin bilan aloqa"
          >
            <p className="text-xs text-neutral-500 mb-3">
              Telegram havolasi yoki <span className="font-mono">tg://resolve?domain=…</span>.
              Klientlar “💬 Admin bilan aloqa” tugmasini bosganda shu havolaga o‘tadi.
            </p>
            <Field label="Admin havolasi">
              <input
                value={form.admin_contact_url}
                onChange={(e) => update('admin_contact_url', e.target.value)}
                placeholder="https://t.me/your_admin"
                className="input"
              />
            </Field>
          </Section>

          <Section icon={<Gift size={18} />} title="Referral bonus">
            <p className="text-xs text-neutral-500 mb-3">
              Yangi mijoz referral havolasi orqali kirib, birinchi safarini
              yakunlaganda, bu summalar admin xazinasidan avtomatik o‘tkaziladi
              (masalan 1000 so‘m → admindan klientga). 0 qoldirsangiz dastur
              o‘chirilgan hisoblanadi.
            </p>
            <Field label="Yangi mijozga (so'm)">
              <input
                value={form.referral_bonus_client}
                onChange={(e) =>
                  update(
                    'referral_bonus_client',
                    e.target.value.replace(/[^\d.]/g, ''),
                  )
                }
                className="input"
              />
            </Field>
            <Field label="Taklif qilgan mijozga (so'm)">
              <input
                value={form.referral_bonus_referrer}
                onChange={(e) =>
                  update(
                    'referral_bonus_referrer',
                    e.target.value.replace(/[^\d.]/g, ''),
                  )
                }
                className="input"
              />
            </Field>
          </Section>

          <Section icon={<Wallet size={18} />} title="To‘lov bot/sayti">
            <p className="text-xs text-neutral-500 mb-3">
              Haydovchilar pul to‘ldirish/yechish uchun bog‘lanadigan alohida bot yoki sayt havolasi.
              Yopiq pul tizimi: admin + driver + client + kutilayotgan so‘rovlar
              balanslari yig‘indisi doim 100 000 000 so‘m. Hech qachon oshmaydi
              va kamaymaydi — agar mablag‘ qaytmasa, u admin xazinasiga qaytadi.
            </p>
            <Field label="To‘lov havolasi">
              <input
                value={form.payment_bot_url}
                onChange={(e) => update('payment_bot_url', e.target.value)}
                placeholder="https://t.me/your_payment_bot"
                className="input"
              />
            </Field>
          </Section>

          <div className="flex items-center gap-3">
            <button
              onClick={() => save.mutate()}
              disabled={save.isPending}
              className="btn-primary"
            >
              <Save size={16} /> {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            {msg && <span className="text-sm text-neutral-600">{msg}</span>}
          </div>
        </div>
      )}
    </Shell>
  );
}

function Section({
  icon,
  title,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="card p-5">
      <div className="flex items-center gap-2 mb-4">
        <span className="text-gold-deep">{icon}</span>
        <h3 className="font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block mb-3">
      <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
