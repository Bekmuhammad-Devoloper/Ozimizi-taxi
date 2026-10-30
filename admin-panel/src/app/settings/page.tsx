'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Instagram, MessageCircle, Wallet, Gift, Crown, Sparkles, Ban, FileSignature, UtensilsCrossed } from 'lucide-react';
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
  branded_priority_seconds: string;
  dispatch_offer_seconds: string;
  dispatch_sequential_count: string;
  bonus_max_percent_per_ride: string;
  cancel_penalty_amount: string;
  driver_contract_text: string;
  btn_icon_order: string;
  btn_icon_promo: string;
  btn_icon_invite: string;
  btn_icon_bonus: string;
  btn_icon_become_driver: string;
  btn_icon_instagram: string;
  btn_icon_contact_admin: string;
  btn_icon_my_orders: string;
  btn_icon_settings: string;
  delivery_base_fee: string;
  delivery_free_km: string;
  delivery_per_km: string;
  delivery_commission_percent: string;
}

/** Backend defaults used while a delivery key is left empty. */
const DELIVERY_DEFAULTS = {
  delivery_base_fee: 8000,
  delivery_free_km: 2,
  delivery_per_km: 2000,
  delivery_commission_percent: 10,
} as const;

const EMPTY: SettingsMap = {
  instagram_url_1: '',
  instagram_url_2: '',
  instagram_url_3: '',
  admin_contact_url: '',
  payment_bot_url: '',
  referral_bonus_client: '0',
  referral_bonus_referrer: '0',
  branded_priority_seconds: '5',
  dispatch_offer_seconds: '15',
  dispatch_sequential_count: '3',
  bonus_max_percent_per_ride: '0',
  cancel_penalty_amount: '0',
  driver_contract_text: '',
  btn_icon_order: '',
  btn_icon_promo: '',
  btn_icon_invite: '',
  btn_icon_bonus: '',
  btn_icon_become_driver: '',
  btn_icon_instagram: '',
  btn_icon_contact_admin: '',
  btn_icon_my_orders: '',
  btn_icon_settings: '',
  delivery_base_fee: '',
  delivery_free_km: '',
  delivery_per_km: '',
  delivery_commission_percent: '',
};

const BUTTON_ICONS: { key: keyof SettingsMap; label: string }[] = [
  { key: 'btn_icon_order', label: '🚕 Taxi chaqirish' },
  { key: 'btn_icon_promo', label: '🎟 Promo kod' },
  { key: 'btn_icon_invite', label: '🎁 Do‘stlarni taklif qilish' },
  { key: 'btn_icon_bonus', label: '💰 Bonus' },
  { key: 'btn_icon_become_driver', label: '🚖 Haydovchi bo‘lish' },
  { key: 'btn_icon_instagram', label: '📸 Instagram' },
  { key: 'btn_icon_contact_admin', label: '👨‍💼 Admin bilan aloqa' },
  { key: 'btn_icon_my_orders', label: '🧾 Buyurtmalarim' },
  { key: 'btn_icon_settings', label: '⚙️ Sozlamalar' },
];

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
              <span className="font-mono">https://instagram.com/moviytaxi</span>
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
              Klientlar “👨‍💼 Admin bilan aloqa” tugmasini bosganda shu havolaga o‘tadi.
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

          <Section icon={<Sparkles size={18} />} title="Bot tugmalari ikonkalari (premium emoji)">
            <p className="text-xs text-neutral-500 mb-3">
              Bot menyusidagi tugmalarga premium (animatsiyali) emoji qo‘yish.
              Faqat botni yaratgan akkauntda <b>Telegram Premium</b> bo‘lsa
              ko‘rinadi. ID olish: botga <span className="font-mono">/emojiid</span>{' '}
              yozing va kerakli premium emojini yuboring — bot ID sini qaytaradi.
              Bo‘sh qoldirilsa, oddiy emoji ko‘rsatiladi. O‘zgarish 1 daqiqada
              kuchga kiradi (mijoz menyuni qayta ochganda).
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
              {BUTTON_ICONS.map(({ key, label }) => (
                <Field key={key} label={label}>
                  <input
                    value={form[key]}
                    onChange={(e) => update(key, e.target.value.replace(/[^\d]/g, ''))}
                    inputMode="numeric"
                    placeholder="5368324170671202286"
                    className="input font-mono"
                  />
                </Field>
              ))}
            </div>
          </Section>

          <Section icon={<Gift size={18} />} title="Bonusdan to‘lash">
            <p className="text-xs text-neutral-500 mb-3">
              Umumiy chegara: mijoz safar narxining necha foizigacha bonus balansidan
              to‘lay oladi (haydovchi tasdiqlaydi). Har bir promo kodning o‘z
              chegarasi (foiz / so‘m) promo kod formasida belgilanadi va bunga
              qo‘shimcha qo‘llanadi. 0 — umumiy cheklov yo‘q.
            </p>
            <Field label="Bir safarda maksimal foiz (%)">
              <input
                value={form.bonus_max_percent_per_ride}
                onChange={(e) =>
                  update(
                    'bonus_max_percent_per_ride',
                    e.target.value.replace(/[^\d]/g, '').slice(0, 3),
                  )
                }
                inputMode="numeric"
                className="input"
              />
            </Field>
          </Section>

          <Section icon={<Ban size={18} />} title="Bekor qilish jarimasi">
            <p className="text-xs text-neutral-500 mb-3">
              Haydovchi “Yetib keldim”ni bosgandan keyin mijoz buyurtmani bekor qilsa,
              shu summa uning bonus balansidan yechiladi (balansda qancha bo‘lsa, shuncha).
              0 — jarima yo‘q. Bekor qilishlar soni Klientlar sahifasida ko‘rinadi.
            </p>
            <Field label="Jarima (so'm)">
              <input
                value={form.cancel_penalty_amount}
                onChange={(e) =>
                  update('cancel_penalty_amount', e.target.value.replace(/[^\d]/g, ''))
                }
                inputMode="numeric"
                className="input"
              />
            </Field>
          </Section>

          <Section icon={<Crown size={18} />} title="Buyurtma tarqatish va signal">
            <p className="text-xs text-neutral-500 mb-3">
              Yangi buyurtma avval eng yaqin bo‘sh haydovchiga <b>shaxsiy</b> taklif
              qilinadi va telefoni shuncha soniya kuchli signal beradi. Olmasa yoki
              “Rad etish”ni bossa — keyingi eng yaqin haydovchiga. Shuncha haydovchidan
              keyin buyurtma <b>o‘rtaga tushadi</b>: barcha onlayn haydovchilarga bir
              vaqtda signal bilan yuboriladi, birinchi olgan oladi.
            </p>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Field label="Signal / taklif vaqti (soniya)">
                <input
                  value={form.dispatch_offer_seconds}
                  onChange={(e) =>
                    update('dispatch_offer_seconds', e.target.value.replace(/[^\d]/g, '').slice(0, 2))
                  }
                  inputMode="numeric"
                  className="input"
                />
              </Field>
              <Field label="Navbat bilan nechta haydovchiga">
                <input
                  value={form.dispatch_sequential_count}
                  onChange={(e) =>
                    update('dispatch_sequential_count', e.target.value.replace(/[^\d]/g, '').slice(0, 2))
                  }
                  inputMode="numeric"
                  className="input"
                />
              </Field>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              0 haydovchi — navbatsiz, darhol hammaga. Brendli (VIP) mashinalar navbatda
              birinchi turadi, agar quyidagi ustunlik 0 dan katta bo‘lsa; 0 bo‘lsa
              faqat masofa hisobga olinadi.
            </p>
            <Field label="Ustunlik vaqti (soniya)">
              <input
                value={form.branded_priority_seconds}
                onChange={(e) =>
                  update(
                    'branded_priority_seconds',
                    e.target.value.replace(/[^\d]/g, '').slice(0, 2),
                  )
                }
                inputMode="numeric"
                className="input"
              />
            </Field>
          </Section>

          <DeliverySection form={form} update={update} />

          <Section icon={<Gift size={18} />} title="Mijozlar o‘zaro taklifi (avtomatik bonus)">
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

          <Section icon={<FileSignature size={18} />} title="Haydovchi shartnomasi">
            <p className="text-xs text-neutral-500 mb-3">
              Haydovchi ilovada ro‘yxatdan o‘tganda va birinchi kirishda shu matnni o‘qib,
              “roziman” belgisini qo‘yadi; botdagi anketada ham ko‘rsatiladi. Qabul qilingan
              sana haydovchi sahifasida ko‘rinadi. Bo‘sh qoldirilsa — standart shartnoma matni
              ishlatiladi.
            </p>
            <Field label="Shartnoma matni">
              <textarea
                value={form.driver_contract_text}
                onChange={(e) => update('driver_contract_text', e.target.value)}
                rows={14}
                placeholder="Bo‘sh — standart matn"
                className="input min-h-[280px] text-xs leading-relaxed"
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

/** Effective value of a delivery key (empty / invalid → backend default). */
function deliveryValue(form: SettingsMap, key: keyof typeof DELIVERY_DEFAULTS): number {
  const raw = (form[key] ?? '').trim();
  const v = raw === '' ? NaN : Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : DELIVERY_DEFAULTS[key];
}

function DeliverySection({
  form,
  update,
}: {
  form: SettingsMap;
  update: (k: keyof SettingsMap, v: string) => void;
}) {
  const base = deliveryValue(form, 'delivery_base_fee');
  const freeKm = deliveryValue(form, 'delivery_free_km');
  const perKm = deliveryValue(form, 'delivery_per_km');
  const pct = Math.min(100, deliveryValue(form, 'delivery_commission_percent'));
  const fee = (km: number) => Math.ceil((base + Math.max(0, km - freeKm) * perKm) / 1000) * 1000;
  const f = (n: number) => n.toLocaleString('uz');
  const examples = [1, 3, 5, 8];

  const numField = (key: keyof typeof DELIVERY_DEFAULTS, label: string, decimal = false) => (
    <Field label={label}>
      <input
        value={form[key]}
        onChange={(e) =>
          update(key, e.target.value.replace(decimal ? /[^\d.]/g : /[^\d]/g, '').slice(0, 9))
        }
        inputMode={decimal ? 'decimal' : 'numeric'}
        placeholder={`${DELIVERY_DEFAULTS[key]} (standart)`}
        className="input tabular-nums"
      />
    </Field>
  );

  return (
    <Section icon={<UtensilsCrossed size={18} />} title="Ovqat yetkazish">
      <p className="text-xs text-neutral-500 mb-3">
        Yetkazish haqi mijozdan olinadi va kuryerga tegishli. Masofa oshxonadan mijoz manziligacha
        (yo‘l bo‘yicha taxminan) hisoblanadi:{' '}
        <b>haq = boshlang‘ich narx + (km − bepul km) × 1 km narxi</b>, natija{' '}
        <b>1 000 so‘mgacha yuqoriga yaxlitlanadi</b>. Bo‘sh qoldirilgan maydon standart
        qiymatni oladi.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3">
        {numField('delivery_base_fee', "Boshlang‘ich narx (so'm)")}
        {numField('delivery_free_km', 'Bepul km (shu masofagacha qo‘shimcha yo‘q)', true)}
        {numField('delivery_per_km', "Har qo‘shimcha 1 km (so'm)")}
        {numField('delivery_commission_percent', 'Kuryer komissiyasi (%)', true)}
      </div>
      <div className="rounded-xl border border-line bg-neutral-50/60 p-3 text-xs text-neutral-600 space-y-1">
        <p className="font-semibold text-neutral-700">Hisob namunasi:</p>
        {examples.map((km) => (
          <p key={km} className="tabular-nums">
            {km} km → {f(base)} + ({km} − {f(freeKm)}) × {f(perKm)} ≈{' '}
            <b>{f(fee(km))} so‘m</b>
            <span className="text-neutral-400">
              {' '}
              · komissiya {f(Math.round((fee(km) * pct) / 100))} so‘m
            </span>
          </p>
        ))}
      </div>
      <p className="text-xs text-neutral-500 mt-3">
        <b>Kuryer komissiyasi</b> — yetkazish haqining shu foizi buyurtma yetkazilganda kuryer
        (yoki taksi haydovchi) balansidan yechiladi. <b>Oshxona komissiyasi</b> har bir oshxona
        uchun alohida “Oshxonalar” sahifasida belgilanadi va taomlar summasidan hisoblanadi.
      </p>
    </Section>
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
