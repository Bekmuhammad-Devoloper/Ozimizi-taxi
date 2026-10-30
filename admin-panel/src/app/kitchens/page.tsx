'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  ChefHat,
  Pencil,
  Power,
  MapPin,
  Phone,
  Clock,
  BookOpen,
  ListOrdered,
  ExternalLink,
  KeyRound,
  Copy,
  Check,
  Store,
  Bike,
  Truck,
  Wallet,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { Field, IconBtn, Modal } from '@/components/ui';
import { PhotoUpload } from '@/components/PhotoUpload';
import { api } from '@/lib/api';
import {
  apiError,
  genPassword,
  isShortMapLink,
  osmLink,
  parseLatLng,
  resolveMediaUrl,
  som,
  type Kitchen,
} from '@/lib/food';

const LOGIN_URL = 'moviytaxi.uz/admin/login';

export default function KitchensPage() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Kitchen | 'new' | null>(null);
  const [creds, setCreds] = useState<{ name: string; username: string; password: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['food-kitchens'],
    queryFn: async () => (await api.get<Kitchen[]>('/admin/food/kitchens')).data,
    refetchInterval: 30_000,
  });

  const patch = useMutation({
    mutationFn: async ({ id, body }: { id: string; body: Partial<Kitchen> }) =>
      (await api.patch(`/admin/food/kitchens/${id}`, body)).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['food-kitchens'] }),
    onError: (e) => alert(apiError(e)),
  });

  const list = data ?? [];
  const openCount = list.filter((k) => k.isActive && k.isOpen).length;

  return (
    <Shell
      title="Oshxonalar"
      subtitle={`Ovqat yetkazish: restoran va oshxonalar · jami ${list.length} ta, hozir ochiq ${openCount} ta`}
      actions={
        <button onClick={() => setEditing('new')} className="btn-primary">
          <Plus size={16} /> Yangi oshxona
        </button>
      }
    >
      <div className="card p-4 mb-4 text-xs text-neutral-600 leading-relaxed">
        Har bir oshxonaga alohida <b>login va parol</b> beriladi.{' '}
        <b>Oshxona {LOGIN_URL} sahifasidan shu login va parol bilan kiradi</b> — buyurtmalarni qabul
        qiladi, “Tayyor”ni bosadi, menyu va “Ochiq / Yopiq” holatini o‘zi boshqaradi. Oshxona qabul
        qilgan zahoti avval uning <b>o‘z kuryerlariga</b>, so‘ng eng yaqin bo‘sh kuryerga (yoki
        yetkazish oladigan taksiga) taklif ketadi; oshxona “O‘zimiz yetkazamiz”ni tanlasa kuryer
        chaqirilmaydi. Komissiya foizi oshxonaning <b>taomlar savdosidan</b> hisoblanadi va oshxona{' '}
        <b>hamyonidan</b> yechiladi — hamyonni oshxona sahifasida to‘ldirasiz.
      </div>

      {isLoading ? (
        <p className="text-sm text-neutral-500">Yuklanmoqda…</p>
      ) : !list.length ? (
        <div className="card p-8 text-center text-sm text-neutral-500">
          <ChefHat size={28} className="mx-auto mb-2 text-neutral-300" />
          Hozircha oshxona yo‘q.
          <br />
          “Yangi oshxona” tugmasini bosib qo‘shing.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-3 gap-3">
          {list.map((k) => (
            <KitchenCard
              key={k.id}
              k={k}
              onEdit={() => setEditing(k)}
              onToggleOpen={() => patch.mutate({ id: k.id, body: { isOpen: !k.isOpen } })}
              onToggleActive={() => {
                if (
                  !k.isActive ||
                  confirm(
                    `${k.name} o‘chirib qo‘yilsinmi? Mijozlarga ko‘rinmaydi va oshxona panelga kira olmaydi.`,
                  )
                )
                  patch.mutate({ id: k.id, body: { isActive: !k.isActive } });
              }}
            />
          ))}
        </div>
      )}

      {editing && (
        <KitchenForm
          initial={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onCreds={(c) => {
            setEditing(null);
            setCreds(c);
          }}
        />
      )}
      {creds && <CredsModal {...creds} onClose={() => setCreds(null)} />}
    </Shell>
  );
}

function KitchenLogo({ url, size = 56 }: { url: string | null; size?: number }) {
  const [broken, setBroken] = useState(false);
  return (
    <span
      style={{ width: size, height: size }}
      className="rounded-xl overflow-hidden bg-gold/15 text-gold-deep border border-line flex items-center justify-center shrink-0"
    >
      {url && !broken ? (
        <img src={resolveMediaUrl(url)} alt="" onError={() => setBroken(true)} className="w-full h-full object-cover" />
      ) : (
        <ChefHat size={Math.round(size * 0.42)} />
      )}
    </span>
  );
}

function KitchenCard({
  k,
  onEdit,
  onToggleOpen,
  onToggleActive,
}: {
  k: Kitchen;
  onEdit: () => void;
  onToggleOpen: () => void;
  onToggleActive: () => void;
}) {
  const s = k.stats;
  const balance = Number(k.balance ?? 0);
  return (
    <div className={'card p-4 flex flex-col gap-3 ' + (!k.isActive ? 'opacity-60' : '')}>
      <div className="flex items-start gap-3">
        <KitchenLogo url={k.logoUrl} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold leading-tight truncate">{k.name}</p>
            {!k.isActive ? (
              <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-neutral-100 text-neutral-500">
                O‘chirilgan
              </span>
            ) : (
              <button
                type="button"
                onClick={onToggleOpen}
                title="Bosib ochiq / yopiq qiling"
                className={
                  'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' +
                  (k.isOpen ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700')
                }
              >
                <span className={'w-1.5 h-1.5 rounded-full ' + (k.isOpen ? 'bg-emerald-500' : 'bg-red-500')} />
                {k.isOpen ? 'Ochiq' : 'Yopiq'}
              </button>
            )}
            {!!s?.active && (
              <span className="text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700">
                {s.active} ta faol
              </span>
            )}
            {k.needsCourier === false && (
              <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded bg-violet-50 text-violet-700">
                <Truck size={10} /> O‘zlari yetkazadi
              </span>
            )}
          </div>
          {k.address && (
            <p className="text-xs text-neutral-500 mt-1 flex items-start gap-1">
              <MapPin size={12} className="mt-0.5 shrink-0" />
              <span className="line-clamp-2">{k.address}</span>
            </p>
          )}
          <div className="flex items-center gap-3 flex-wrap mt-1 text-[11px] text-neutral-500">
            {k.phone && (
              <a href={`tel:${k.phone}`} className="inline-flex items-center gap-1 hover:text-ink">
                <Phone size={11} /> {k.phone}
              </a>
            )}
            <span className="inline-flex items-center gap-1">
              <Clock size={11} /> {k.prepMinutes} daq
            </span>
            <span className="inline-flex items-center gap-1 font-mono">
              <KeyRound size={11} /> {k.username}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-5 gap-1.5 text-center">
        <Stat label="Taom" value={String(s?.items ?? 0)} />
        <Stat label="Bugun" value={String(s?.today ?? 0)} />
        <Stat label="Faol" value={String(s?.active ?? 0)} />
        <Stat label="Savdo" value={som(s?.sales ?? 0)} />
        <Stat label="Komissiya" value={som(s?.commission ?? 0)} />
      </div>

      <div className="flex items-center gap-x-3 gap-y-1 text-[11px] text-neutral-500 flex-wrap">
        <span>
          Komissiya: <b className="text-ink">{Number(k.commissionPercent)}%</b>
        </span>
        <span>
          Minimal buyurtma:{' '}
          <b className="text-ink">{Number(k.minOrder) > 0 ? `${som(k.minOrder)} so‘m` : 'yo‘q'}</b>
        </span>
        <span className="inline-flex items-center gap-1">
          <Wallet size={11} /> Balans:{' '}
          <b className={balance < 0 ? 'text-red-600' : 'text-ink'}>{som(balance)} so‘m</b>
        </span>
        <span>
          Yetkazish:{' '}
          <b className="text-ink">
            {k.deliveryPricing === 'taxi' ? 'taksi tarifi' : 'km bo‘yicha'}
            {k.courierMaxKm != null ? ` · ${Number(k.courierMaxKm)} km gacha kuryer` : ''}
          </b>
        </span>
        <a
          href={osmLink(k.lat, k.lng)}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-0.5 text-blue-600 hover:underline"
        >
          Xaritada ko‘rish <ExternalLink size={10} />
        </a>
      </div>

      <div className="flex items-center gap-1.5 mt-auto pt-1">
        <Link href={`/kitchens/${k.id}`} className="btn-secondary h-9 px-3 text-xs flex-1">
          <BookOpen size={14} /> Menyu · hamyon
        </Link>
        <Link href={`/food-orders?kitchen=${k.id}`} className="btn-secondary h-9 px-3 text-xs flex-1">
          <ListOrdered size={14} /> Buyurtmalar
        </Link>
        <IconBtn title="Tahrirlash" onClick={onEdit}>
          <Pencil size={15} />
        </IconBtn>
        <IconBtn
          title={k.isActive ? 'O‘chirib qo‘yish' : 'Yoqish'}
          tone={k.isActive ? 'default' : 'green'}
          onClick={onToggleActive}
        >
          <Power size={15} />
        </IconBtn>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-neutral-50 border border-line px-1 py-1.5 min-w-0">
      <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold truncate">{label}</p>
      <p className="text-xs font-extrabold tabular-nums truncate" title={value}>
        {value}
      </p>
    </div>
  );
}

interface FormState {
  name: string;
  phone: string;
  address: string;
  lat: string;
  lng: string;
  logoUrl: string | null;
  description: string;
  username: string;
  password: string;
  prepMinutes: string;
  minOrder: string;
  commissionPercent: string;
  isActive: boolean;
  isOpen: boolean;
  sort: string;
  needsCourier: boolean;
  deliveryPricing: 'custom' | 'taxi';
  /** Empty = global settings. */
  deliveryBaseFee: string;
  deliveryFreeKm: string;
  deliveryPerKm: string;
  /** Empty = no limit. */
  courierMaxKm: string;
}

/** "" for null, otherwise the number without trailing zeros ("2.50" → "2.5"). */
const numStr = (v: string | number | null | undefined) =>
  v == null || v === '' ? '' : String(Number(v));

/** Optional non-negative number: "" → null, else the number (or an error). */
function optNum(v: string, label: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) throw new Error(`${label}: noto‘g‘ri qiymat`);
  return n;
}

function KitchenForm({
  initial,
  onClose,
  onCreds,
}: {
  initial: Kitchen | null;
  onClose: () => void;
  onCreds: (c: { name: string; username: string; password: string }) => void;
}) {
  const qc = useQueryClient();
  const [form, setForm] = useState<FormState>(() =>
    initial
      ? {
          name: initial.name,
          phone: initial.phone ?? '',
          address: initial.address ?? '',
          lat: String(initial.lat ?? ''),
          lng: String(initial.lng ?? ''),
          logoUrl: initial.logoUrl,
          description: initial.description ?? '',
          username: initial.username,
          password: '',
          prepMinutes: String(initial.prepMinutes ?? 20),
          minOrder: String(Math.round(Number(initial.minOrder ?? 0))),
          commissionPercent: String(Number(initial.commissionPercent ?? 10)),
          isActive: initial.isActive,
          isOpen: initial.isOpen,
          sort: String(initial.sort ?? 0),
          needsCourier: initial.needsCourier !== false,
          deliveryPricing: initial.deliveryPricing === 'taxi' ? 'taxi' : 'custom',
          deliveryBaseFee: numStr(initial.deliveryBaseFee),
          deliveryFreeKm: numStr(initial.deliveryFreeKm),
          deliveryPerKm: numStr(initial.deliveryPerKm),
          courierMaxKm: numStr(initial.courierMaxKm),
        }
      : {
          name: '',
          phone: '+998',
          address: '',
          lat: '',
          lng: '',
          logoUrl: null,
          description: '',
          username: '',
          password: genPassword(),
          prepMinutes: '20',
          minOrder: '0',
          commissionPercent: '10',
          isActive: true,
          isOpen: true,
          sort: '0',
          needsCourier: true,
          deliveryPricing: 'custom',
          deliveryBaseFee: '',
          deliveryFreeKm: '',
          deliveryPerKm: '',
          courierMaxKm: '',
        },
  );
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((s) => ({ ...s, [k]: v }));

  const onPaste = (text: string) => {
    setPaste(text);
    if (!text.trim()) {
      setPasteMsg(null);
      return;
    }
    const p = parseLatLng(text);
    if (p) {
      const lat = Number(p.lat.toFixed(6));
      const lng = Number(p.lng.toFixed(6));
      setForm((s) => ({ ...s, lat: String(lat), lng: String(lng) }));
      setPasteMsg({ ok: true, text: `Topildi: ${lat}, ${lng}` });
    } else if (isShortMapLink(text)) {
      setPasteMsg({
        ok: false,
        text: 'Qisqa havola ochilmaydi — xaritada nuqtani bosib, to‘liq havolani yoki “lat, lng” koordinatani nusxalang',
      });
    } else {
      setPasteMsg({ ok: false, text: 'Koordinata topilmadi. Masalan: 41.311081, 69.240562' });
    }
  };

  const lat = Number(form.lat);
  const lng = Number(form.lng);
  const hasPoint = form.lat.trim() !== '' && form.lng.trim() !== '' && Number.isFinite(lat) && Number.isFinite(lng);

  const save = useMutation({
    mutationFn: async () => {
      const name = form.name.trim();
      if (name.length < 2) throw new Error('Oshxona nomini kiriting');
      if (!hasPoint || Math.abs(lat) > 90 || Math.abs(lng) > 180)
        throw new Error('Oshxona joylashuvini kiriting (lat, lng)');
      const username = form.username.trim().toLowerCase();
      if (!/^[a-z0-9][a-z0-9_.-]{2,31}$/.test(username))
        throw new Error('Login 3–32 belgi: lotin harfi, raqam, _ . - (bo‘sh joysiz)');
      if (!initial && form.password.length < 6) throw new Error('Parol kamida 6 belgi');
      if (initial && form.password && form.password.length < 6) throw new Error('Parol kamida 6 belgi');
      const pct = Number(form.commissionPercent);
      if (!Number.isFinite(pct) || pct < 0 || pct > 100) throw new Error('Komissiya 0–100%');
      const body: Record<string, unknown> = {
        name,
        phone: form.phone.trim() && form.phone.trim() !== '+998' ? form.phone.trim() : null,
        address: form.address.trim() || null,
        lat,
        lng,
        logoUrl: form.logoUrl,
        description: form.description.trim() || null,
        username,
        prepMinutes: Number(form.prepMinutes) || 20,
        minOrder: Number(form.minOrder) || 0,
        commissionPercent: pct,
        isActive: form.isActive,
        isOpen: form.isOpen,
        sort: Number(form.sort) || 0,
        needsCourier: form.needsCourier,
        deliveryPricing: form.deliveryPricing,
        deliveryBaseFee: optNum(form.deliveryBaseFee, 'Boshlang‘ich narx'),
        deliveryFreeKm: optNum(form.deliveryFreeKm, 'Bepul km'),
        deliveryPerKm: optNum(form.deliveryPerKm, 'Har km narxi'),
        courierMaxKm: optNum(form.courierMaxKm, 'Kuryer chegarasi'),
      };
      if (form.password) body.password = form.password;
      return initial
        ? (await api.patch(`/admin/food/kitchens/${initial.id}`, body)).data
        : (await api.post('/admin/food/kitchens', body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['food-kitchens'] });
      if (initial) qc.invalidateQueries({ queryKey: ['food-menu', `/admin/food/kitchens/${initial.id}`] });
      if (form.password) {
        onCreds({ name: form.name.trim(), username: form.username.trim().toLowerCase(), password: form.password });
      } else {
        onClose();
      }
    },
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <Modal wide title={initial ? `${initial.name} — tahrirlash` : 'Yangi oshxona'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          save.mutate();
        }}
        className="space-y-4"
      >
        <div>
          <span className="label">Logotip</span>
          <div className="mt-1">
            <PhotoUpload
              value={form.logoUrl}
              onChange={(u) => set('logoUrl', u)}
              uploadPath="/admin/food/upload"
              size={72}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Field label="Nomi">
            <input
              value={form.name}
              onChange={(e) => set('name', e.target.value)}
              maxLength={120}
              placeholder="Masalan: Rayhon milliy taomlar"
              className="input"
            />
          </Field>
          <Field label="Telefon">
            <input
              value={form.phone}
              onChange={(e) => set('phone', e.target.value)}
              inputMode="tel"
              placeholder="+998901234567"
              className="input"
            />
          </Field>
        </div>
        <Field label="Manzil (mijoz va kuryerga ko‘rinadi)">
          <input
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            maxLength={255}
            placeholder="Masalan: Chilonzor 9-kvartal, 12-uy"
            className="input"
          />
        </Field>

        <div className="rounded-xl border border-line bg-neutral-50/60 p-3 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
              <MapPin size={12} /> Joylashuv (kuryer shu nuqtadan oladi)
            </p>
            {hasPoint && (
              <a
                href={osmLink(lat, lng)}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1 hover:underline"
              >
                Xaritada ko‘rish <ExternalLink size={12} />
              </a>
            )}
          </div>
          <Field label="Google Maps / Yandex havolasi yoki “lat, lng”">
            <input
              value={paste}
              onChange={(e) => onPaste(e.target.value)}
              placeholder="https://maps.google.com/…  yoki  41.311081, 69.240562"
              className="input"
            />
          </Field>
          {pasteMsg && (
            <p className={'text-[11px] ' + (pasteMsg.ok ? 'text-emerald-700' : 'text-amber-700')}>
              {pasteMsg.ok ? '✓ ' : ''}
              {pasteMsg.text}
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kenglik (lat)">
              <input
                value={form.lat}
                onChange={(e) => set('lat', e.target.value.replace(/[^\d.-]/g, ''))}
                inputMode="decimal"
                placeholder="41.311081"
                className="input tabular-nums font-mono"
              />
            </Field>
            <Field label="Uzunlik (lng)">
              <input
                value={form.lng}
                onChange={(e) => set('lng', e.target.value.replace(/[^\d.-]/g, ''))}
                inputMode="decimal"
                placeholder="69.240562"
                className="input tabular-nums font-mono"
              />
            </Field>
          </div>
        </div>

        <Field label="Tavsif (ixtiyoriy, mijozga ko‘rinadi)">
          <textarea
            value={form.description}
            onChange={(e) => set('description', e.target.value)}
            rows={2}
            placeholder="Milliy taomlar, shashlik, somsa…"
            className="input h-auto py-2 min-h-[60px]"
          />
        </Field>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field label="Tayyorlash (daq)">
            <input
              value={form.prepMinutes}
              onChange={(e) => set('prepMinutes', e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
              inputMode="numeric"
              className="input tabular-nums"
            />
          </Field>
          <Field label="Min. buyurtma (so‘m)">
            <input
              value={form.minOrder}
              onChange={(e) => set('minOrder', e.target.value.replace(/[^\d]/g, ''))}
              inputMode="numeric"
              className="input tabular-nums"
            />
          </Field>
          <Field label="Komissiya (%)">
            <input
              value={form.commissionPercent}
              onChange={(e) => set('commissionPercent', e.target.value.replace(/[^\d.]/g, '').slice(0, 5))}
              inputMode="decimal"
              className="input tabular-nums"
            />
          </Field>
          <Field label="Tartib raqami">
            <input
              value={form.sort}
              onChange={(e) => set('sort', e.target.value.replace(/[^\d-]/g, ''))}
              inputMode="numeric"
              className="input tabular-nums"
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Toggle
            checked={form.isActive}
            onChange={(v) => set('isActive', v)}
            label="Faol"
            hint="O‘chirilsa mijozlarga ko‘rinmaydi, panelga kira olmaydi"
          />
          <Toggle
            checked={form.isOpen}
            onChange={(v) => set('isOpen', v)}
            label="Hozir ochiq"
            hint="Buyurtma qabul qiladi (oshxona o‘zi ham almashtiradi)"
          />
        </div>

        <div className="rounded-xl border border-line bg-neutral-50/60 p-3 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
            <Bike size={12} /> Yetkazish
          </p>
          <Toggle
            checked={form.needsCourier}
            onChange={(v) => set('needsCourier', v)}
            label={form.needsCourier ? 'Kuryer chaqiriladi' : 'Oshxona o‘zi yetkazadi'}
            hint="Yangi buyurtmalar uchun odatiy tanlov — oshxona har buyurtmani qabul qilganda o‘zgartira oladi"
          />
          <div>
            <span className="label">Yetkazish narxi</span>
            <div className="mt-1 flex rounded-lg border border-line overflow-hidden">
              {(
                [
                  ['custom', 'Km bo‘yicha (pastdagi narxlar)'],
                  ['taxi', 'Taksi tarifida'],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => set('deliveryPricing', value)}
                  className={
                    'flex-1 h-10 px-2 text-xs font-bold ' +
                    (form.deliveryPricing === value
                      ? 'bg-ink text-gold'
                      : 'bg-white text-neutral-500 hover:bg-neutral-50')
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {form.deliveryPricing === 'custom' ? (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <Field label="Boshlang‘ich narx (so‘m)">
                  <input
                    value={form.deliveryBaseFee}
                    onChange={(e) => set('deliveryBaseFee', e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                    inputMode="numeric"
                    placeholder="umumiy"
                    className="input tabular-nums"
                  />
                </Field>
                <Field label="Bepul km">
                  <input
                    value={form.deliveryFreeKm}
                    onChange={(e) => set('deliveryFreeKm', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
                    inputMode="decimal"
                    placeholder="umumiy"
                    className="input tabular-nums"
                  />
                </Field>
                <Field label="Har km narxi (so‘m)">
                  <input
                    value={form.deliveryPerKm}
                    onChange={(e) => set('deliveryPerKm', e.target.value.replace(/[^\d]/g, '').slice(0, 9))}
                    inputMode="numeric"
                    placeholder="umumiy"
                    className="input tabular-nums"
                  />
                </Field>
              </div>
              <p className="text-[11px] text-neutral-500">
                Narx = boshlang‘ich + (masofa − bepul km) × har km narxi, 1 000 ga yaxlitlanadi. Bo‘sh
                qoldirilgan maydon — umumiy sozlamalardagi qiymat.
              </p>
            </>
          ) : (
            <p className="text-[11px] text-neutral-500">
              Yetkazish narxi taksi safari kabi — joriy taksi tarifi bo‘yicha hisoblanadi.
            </p>
          )}
          <Field label="Kuryer chegarasi (km)">
            <input
              value={form.courierMaxKm}
              onChange={(e) => set('courierMaxKm', e.target.value.replace(/[^\d.]/g, '').slice(0, 6))}
              inputMode="decimal"
              placeholder="cheklovsiz"
              className="input tabular-nums sm:max-w-[200px]"
            />
          </Field>
          <p className="text-[11px] text-neutral-500 -mt-1">
            Shundan uzoq bo‘lsa — taksi tarifida taksiga tushadi. Bo‘sh — cheklovsiz.
          </p>
        </div>

        <div className="rounded-xl border border-gold/40 bg-gold/5 p-3 space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-gold-deep flex items-center gap-1">
            <KeyRound size={12} /> Oshxona paneliga kirish
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Login">
              <input
                value={form.username}
                onChange={(e) => set('username', e.target.value.toLowerCase().replace(/\s/g, ''))}
                autoComplete="off"
                placeholder="rayhon"
                className="input font-mono"
              />
            </Field>
            <Field label={initial ? 'Yangi parol' : 'Parol'}>
              <div className="flex gap-2">
                <input
                  value={form.password}
                  onChange={(e) => set('password', e.target.value)}
                  autoComplete="new-password"
                  placeholder={initial ? 'bo‘sh qoldirsangiz o‘zgarmaydi' : 'kamida 6 belgi'}
                  className="input font-mono"
                />
                <button
                  type="button"
                  onClick={() => set('password', genPassword())}
                  className="btn-secondary px-3 shrink-0"
                >
                  Random
                </button>
              </div>
            </Field>
          </div>
          <p className="text-[11px] text-neutral-600">
            Oshxona <b>{LOGIN_URL}</b> sahifasidan shu login va parol bilan kiradi.
            {initial ? ' Parol maydonini bo‘sh qoldirsangiz o‘zgarmaydi.' : ''}
          </p>
        </div>

        {err && <p className="text-sm text-red-600">{err}</p>}
        <div className="flex gap-2 justify-end pt-1">
          <button type="button" onClick={onClose} className="btn-secondary">
            Bekor qilish
          </button>
          <button type="submit" disabled={save.isPending} className="btn-primary">
            {save.isPending ? 'Saqlanmoqda…' : initial ? 'Saqlash' : 'Yaratish'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={
        'text-left rounded-xl border px-3 py-2 flex items-start gap-3 transition-colors ' +
        (checked ? 'border-emerald-300 bg-emerald-50/60' : 'border-line bg-white')
      }
    >
      <span
        className={
          'mt-0.5 w-9 h-5 rounded-full relative shrink-0 transition-colors ' +
          (checked ? 'bg-emerald-500' : 'bg-neutral-300')
        }
      >
        <span
          className={
            'absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ' +
            (checked ? 'left-[18px]' : 'left-0.5')
          }
        />
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-semibold">{label}</span>
        {hint && <span className="block text-[11px] text-neutral-500">{hint}</span>}
      </span>
    </button>
  );
}

function CredsModal({
  name,
  username,
  password,
  onClose,
}: {
  name: string;
  username: string;
  password: string;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const text = `${name}\nKirish: https://${LOGIN_URL}\nLogin: ${username}\nParol: ${password}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  };
  return (
    <Modal title="Oshxona login ma’lumotlari" onClose={onClose}>
      <div className="space-y-3 text-center">
        <span className="mx-auto w-12 h-12 rounded-xl bg-gold/15 text-gold-deep flex items-center justify-center">
          <Store size={22} />
        </span>
        <p className="text-sm text-neutral-600">
          <b>{name}</b> uchun login ma’lumotlarini oshxonaga yetkazing. Parol faqat hozir ko‘rinadi.
        </p>
        <div className="text-sm text-left bg-neutral-50 border border-line p-3 rounded-xl space-y-1">
          <p>
            🌐 <b>{LOGIN_URL}</b>
          </p>
          <p>
            👤 Login: <b className="font-mono">{username}</b>
          </p>
          <p>
            🔑 Parol: <b className="font-mono">{password}</b>
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => void copy()} className="btn-secondary flex-1">
            {copied ? <Check size={15} /> : <Copy size={15} />} {copied ? 'Nusxalandi' : 'Nusxalash'}
          </button>
          <button type="button" onClick={onClose} className="btn-primary flex-1">
            Yopish
          </button>
        </div>
      </div>
    </Modal>
  );
}
