'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Store, Clock, Info, Bike, Truck } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { PhotoUpload } from '@/components/PhotoUpload';
import { api } from '@/lib/api';
import { apiError, som, type Kitchen } from '@/lib/food';

const PREP_PRESETS = [10, 15, 20, 30, 45, 60];

interface FormState {
  prepMinutes: string;
  phone: string;
  address: string;
  description: string;
  logoUrl: string | null;
  /** Default for new orders: call a courier (false = we deliver ourselves). */
  needsCourier: boolean;
}

/** The kitchen's own operational settings (name/commission stay with the admin). */
export default function KitchenSettingsPage() {
  const qc = useQueryClient();
  const { data: me, isLoading } = useQuery({
    queryKey: ['kitchen-me'],
    queryFn: async () => (await api.get<Kitchen>('/kitchen/me')).data,
  });

  const [form, setForm] = useState<FormState>({
    prepMinutes: '20',
    phone: '',
    address: '',
    description: '',
    logoUrl: null,
    needsCourier: true,
  });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  useEffect(() => {
    if (!me) return;
    setForm({
      prepMinutes: String(me.prepMinutes ?? 20),
      phone: me.phone ?? '',
      address: me.address ?? '',
      description: me.description ?? '',
      logoUrl: me.logoUrl ?? null,
      needsCourier: me.needsCourier !== false,
    });
  }, [me]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }));

  const save = useMutation({
    mutationFn: async () => {
      const prep = Number(form.prepMinutes);
      if (!Number.isFinite(prep) || prep < 1 || prep > 180) throw new Error('Tayyorlash vaqti 1–180 daqiqa');
      return (
        await api.patch('/kitchen/me', {
          prepMinutes: Math.round(prep),
          phone: form.phone.trim() || null,
          address: form.address.trim() || null,
          description: form.description.trim() || null,
          logoUrl: form.logoUrl,
          needsCourier: form.needsCourier,
        })
      ).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kitchen-me'] });
      setMsg({ ok: true, text: 'Saqlandi' });
      setTimeout(() => setMsg(null), 2000);
    },
    onError: (e) => setMsg({ ok: false, text: apiError(e) }),
  });

  return (
    <Shell title="Sozlamalar" subtitle={me ? me.name : 'Oshxona ma’lumotlari'}>
      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : (
        <div className="space-y-6 max-w-2xl">
          <div className="card p-5">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-gold-deep">
                <Clock size={18} />
              </span>
              <h3 className="font-bold">Tayyorlash vaqti</h3>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              Yangi buyurtmani qabul qilganda tanlangan vaqt shu qiymatdan boshlanadi (har buyurtmada
              o‘zgartirish mumkin). Mijozga ham taxminiy vaqt sifatida ko‘rsatiladi.
            </p>
            <div className="flex flex-wrap gap-1.5 mb-3">
              {PREP_PRESETS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('prepMinutes', String(m))}
                  className={
                    'h-9 px-3 rounded-lg border text-sm font-bold tabular-nums ' +
                    (form.prepMinutes === String(m)
                      ? 'bg-ink text-gold border-ink'
                      : 'bg-white text-neutral-600 border-line')
                  }
                >
                  {m} daq
                </button>
              ))}
            </div>
            <label className="block max-w-[200px]">
              <span className="label">Boshqa qiymat (daqiqa)</span>
              <input
                value={form.prepMinutes}
                onChange={(e) => set('prepMinutes', e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                inputMode="numeric"
                className="input mt-1 tabular-nums"
              />
            </label>
          </div>

          <div className="card p-5">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-gold-deep">
                <Bike size={18} />
              </span>
              <h3 className="font-bold">Yetkazish</h3>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              Buyurtmani qabul qilganda qaysi tanlov odatiy bo‘lsin. Har buyurtmada “Qabul qilish” oldidan
              o‘zgartirish mumkin. Mijoz o‘zi olib ketadigan buyurtmalarga kuryer chaqirilmaydi.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {(
                [
                  [true, 'Kuryer chaqirish', 'Platforma kuryeri olib ketadi (avval o‘z kuryerlaringizga boradi)', Bike],
                  [false, 'O‘zimiz yetkazamiz', 'Kuryer chaqirilmaydi — “Yo‘lga chiqdi” / “Yetkazildi”ni o‘zingiz bosasiz', Truck],
                ] as const
              ).map(([value, label, hint, Icon]) => (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => set('needsCourier', value)}
                  className={
                    'text-left rounded-xl border px-3 py-2.5 flex items-start gap-2.5 transition-colors ' +
                    (form.needsCourier === value
                      ? 'border-ink bg-ink text-white'
                      : 'border-line bg-white text-ink hover:bg-neutral-50')
                  }
                >
                  <Icon size={18} className={'mt-0.5 shrink-0 ' + (form.needsCourier === value ? 'text-gold' : 'text-neutral-400')} />
                  <span className="min-w-0">
                    <span className="block text-sm font-bold">{label}</span>
                    <span
                      className={
                        'block text-[11px] ' + (form.needsCourier === value ? 'text-neutral-300' : 'text-neutral-500')
                      }
                    >
                      {hint}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="card p-5 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-gold-deep">
                <Store size={18} />
              </span>
              <h3 className="font-bold">Oshxona ma’lumotlari</h3>
            </div>
            <div>
              <span className="label">Logotip</span>
              <div className="mt-1">
                <PhotoUpload
                  value={form.logoUrl}
                  onChange={(u) => set('logoUrl', u)}
                  uploadPath="/kitchen/upload"
                  size={72}
                />
              </div>
            </div>
            <label className="block">
              <span className="label">Telefon</span>
              <input
                value={form.phone}
                onChange={(e) => set('phone', e.target.value)}
                inputMode="tel"
                placeholder="+998901234567"
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">Manzil</span>
              <input
                value={form.address}
                onChange={(e) => set('address', e.target.value)}
                maxLength={255}
                placeholder="Ko‘cha, uy, mo‘ljal"
                className="input mt-1"
              />
            </label>
            <label className="block">
              <span className="label">Tavsif (mijozga ko‘rinadi)</span>
              <textarea
                value={form.description}
                onChange={(e) => set('description', e.target.value)}
                rows={3}
                placeholder="Milliy taomlar, shashlik, somsa…"
                className="input mt-1 h-auto py-2 min-h-[80px]"
              />
            </label>
          </div>

          {me && (
            <div className="card p-5 text-xs text-neutral-600 space-y-1.5">
              <p className="flex items-center gap-1.5 font-bold text-sm text-ink mb-2">
                <Info size={16} className="text-gold-deep" /> Admin belgilaydigan ma’lumotlar
              </p>
              <p>
                Nomi: <b>{me.name}</b>
              </p>
              <p>
                Login: <b className="font-mono">{me.username}</b>
              </p>
              <p>
                Komissiya: <b>{Number(me.commissionPercent)}%</b> (yetkazilgan buyurtmalar taomlar summasidan)
              </p>
              <p>
                Minimal buyurtma: <b>{Number(me.minOrder) > 0 ? `${som(me.minOrder)} so‘m` : 'yo‘q'}</b>
              </p>
              <p>
                Yetkazish narxi: <b>{me.deliveryPricing === 'taxi' ? 'taksi tarifida' : 'km bo‘yicha'}</b>
                {me.courierMaxKm != null && (
                  <> · {Number(me.courierMaxKm)} km dan uzoq bo‘lsa — taksi tarifida taksiga tushadi</>
                )}
              </p>
              <p className="text-neutral-500 pt-1">
                Nomi, joylashuvi, komissiya yoki parolni o‘zgartirish uchun administratorga murojaat qiling.
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <button onClick={() => save.mutate()} disabled={save.isPending || !me} className="btn-primary">
              <Save size={16} /> {save.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
            {msg && (
              <span className={'text-sm ' + (msg.ok ? 'text-emerald-700' : 'text-red-600')}>{msg.text}</span>
            )}
          </div>
        </div>
      )}
    </Shell>
  );
}
