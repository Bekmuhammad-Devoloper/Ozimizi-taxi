'use client';
import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowLeft,
  Bike,
  ExternalLink,
  Loader2,
  MapPin,
  Minus,
  Plus,
  Search,
  ShoppingBag,
  Store,
  Trash2,
  Truck,
  User,
  UtensilsCrossed,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { Field } from '@/components/ui';
import { ItemKindBadge, useKitchenMenu } from '@/components/MenuEditor';
import { api } from '@/lib/api';
import {
  MENU_KIND_LABEL,
  apiError,
  isShortMapLink,
  osmLink,
  parseLatLng,
  som,
  type Kitchen,
  type MenuItem,
  type MenuItemKind,
} from '@/lib/food';

const PREP_CHOICES = [10, 15, 20, 30, 45, 60];

interface CustomLine {
  key: number;
  name: string;
  price: string;
  qty: string;
}

let lineSeq = 1;
const newLine = (): CustomLine => ({ key: lineSeq++, name: '', price: '', qty: '1' });

/**
 * Order typed in by the kitchen itself: a phone / walk-in client, or raw
 * materials and semi-finished goods. It starts already accepted (COOKING).
 */
export default function KitchenNewOrderPage() {
  const router = useRouter();
  const qc = useQueryClient();
  const { data: me } = useQuery({
    queryKey: ['kitchen-me'],
    queryFn: async () => (await api.get<Kitchen>('/kitchen/me')).data,
  });
  const { data: menu, isLoading: menuLoading, isError: menuError, error: menuErr } = useKitchenMenu('/kitchen');

  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('+998');
  const [deliveryType, setDeliveryType] = useState<'delivery' | 'pickup'>('delivery');
  const [courierPick, setCourierPick] = useState<boolean | null>(null);
  const needsCourier = courierPick ?? me?.needsCourier !== false;
  const [address, setAddress] = useState('');
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [comment, setComment] = useState('');
  const [prepPick, setPrepPick] = useState<string | null>(null);
  const prep = prepPick ?? String(me?.prepMinutes ?? 20);

  const [qty, setQty] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState<CustomLine[]>([]);
  const [q, setQ] = useState('');
  const [kindFilter, setKindFilter] = useState<MenuItemKind | ''>('');
  const [err, setErr] = useState<string | null>(null);

  const pickup = deliveryType === 'pickup';
  const latN = Number(lat);
  const lngN = Number(lng);
  const hasPoint =
    lat.trim() !== '' &&
    lng.trim() !== '' &&
    Number.isFinite(latN) &&
    Number.isFinite(lngN) &&
    Math.abs(latN) <= 90 &&
    Math.abs(lngN) <= 180;

  const onPaste = (text: string) => {
    setPaste(text);
    if (!text.trim()) {
      setPasteMsg(null);
      return;
    }
    const p = parseLatLng(text);
    if (p) {
      const a = Number(p.lat.toFixed(6));
      const b = Number(p.lng.toFixed(6));
      setLat(String(a));
      setLng(String(b));
      setPasteMsg({ ok: true, text: `Topildi: ${a}, ${b}` });
    } else if (isShortMapLink(text)) {
      setPasteMsg({
        ok: false,
        text: 'Qisqa havola ochilmaydi — xaritada nuqtani bosib, to‘liq havolani yoki “lat, lng” koordinatani nusxalang',
      });
    } else {
      setPasteMsg({ ok: false, text: 'Koordinata topilmadi. Masalan: 41.311081, 69.240562' });
    }
  };

  const items = menu?.items ?? [];
  const categories = menu?.categories ?? [];
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const groups = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const match = (i: MenuItem) =>
      (!needle || i.name.toLowerCase().includes(needle)) &&
      (!kindFilter || (i.kind ?? 'dish') === kindFilter);
    const ids = new Set(categories.map((c) => c.id));
    const out = categories
      .map((c) => ({ id: c.id, name: c.name, items: items.filter((i) => i.categoryId === c.id && match(i)) }))
      .filter((g) => g.items.length);
    const rest = items.filter((i) => (!i.categoryId || !ids.has(i.categoryId)) && match(i));
    if (rest.length) out.push({ id: 'none', name: 'Bo‘limsiz', items: rest });
    return out;
  }, [items, categories, q, kindFilter]);

  const hasKinds = items.some((i) => i.kind === 'raw' || i.kind === 'semi');

  const setItemQty = (id: string, n: number) =>
    setQty((s) => {
      const next = { ...s };
      if (n <= 0) delete next[id];
      else next[id] = Math.min(500, n);
      return next;
    });

  const menuLines = Object.entries(qty)
    .map(([id, n]) => ({ item: byId.get(id), qty: n }))
    .filter((l): l is { item: MenuItem; qty: number } => !!l.item && l.qty > 0);
  const customLines = custom
    .map((c) => ({ ...c, priceN: Number(c.price), qtyN: Math.max(1, Math.round(Number(c.qty) || 1)) }))
    .filter((c) => c.name.trim());
  const total =
    menuLines.reduce((s, l) => s + Number(l.item.price) * l.qty, 0) +
    customLines.reduce((s, c) => s + (Number.isFinite(c.priceN) ? c.priceN : 0) * c.qtyN, 0);
  const lineCount = menuLines.length + customLines.length;

  const create = useMutation({
    mutationFn: async () => {
      if (!lineCount) throw new Error('Kamida bitta mahsulot kiriting');
      for (const c of customLines) {
        if (!Number.isFinite(c.priceN) || c.priceN < 0 || c.price.trim() === '')
          throw new Error(`“${c.name.trim()}” narxini kiriting`);
      }
      if (!pickup && (lat.trim() || lng.trim()) && !hasPoint) throw new Error('Koordinata noto‘g‘ri (lat, lng)');
      if (!pickup && needsCourier && !hasPoint)
        throw new Error('Kuryer uchun mijoz manzilini kiriting: xarita havolasi yoki lat, lng');
      const prepN = Number(prep);
      if (!Number.isFinite(prepN) || prepN < 1 || prepN > 180) throw new Error('Tayyorlash vaqti 1–180 daqiqa');
      const body: Record<string, unknown> = {
        clientName: clientName.trim() || null,
        phone: phone.trim() && phone.trim() !== '+998' ? phone.trim() : null,
        address: pickup ? null : address.trim() || null,
        items: menuLines.map((l) => ({ itemId: l.item.id, qty: l.qty })),
        customItems: customLines.map((c) => ({ name: c.name.trim(), price: c.priceN, qty: c.qtyN })),
        deliveryType,
        comment: comment.trim() || null,
        prepMinutes: Math.round(prepN),
      };
      if (!pickup) {
        body.needsCourier = needsCourier;
        if (hasPoint) {
          body.lat = latN;
          body.lng = lngN;
        }
      }
      return (await api.post('/kitchen/orders', body)).data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
      qc.invalidateQueries({ queryKey: ['kitchen-stats'] });
      router.push('/kitchen');
    },
    onError: (e) => setErr(apiError(e)),
  });

  return (
    <Shell
      title="Yangi buyurtma"
      subtitle="Telefon orqali yoki joyida kelgan mijoz · xom ashyo / yarim tayyor mahsulot — qo‘lda kiritish"
      actions={
        <Link href="/kitchen" className="btn-secondary">
          <ArrowLeft size={16} /> Buyurtmalar
        </Link>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setErr(null);
          create.mutate();
        }}
        className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4 items-start"
      >
        {/* ---------------------------------------------------- products */}
        <div className="space-y-4 min-w-0">
          <section className="card p-4">
            <div className="flex items-center gap-2 mb-3">
              <UtensilsCrossed size={18} className="text-gold-deep" />
              <h3 className="font-bold flex-1">Menyudan</h3>
              {menuLines.length > 0 && (
                <span className="text-xs text-neutral-500">{menuLines.length} ta tanlandi</span>
              )}
            </div>
            <div className="flex items-center gap-2 h-10 px-3 rounded-lg border border-line bg-white mb-2">
              <Search size={15} className="text-neutral-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Qidirish…"
                className="flex-1 outline-none text-sm bg-transparent min-w-0"
              />
            </div>
            {hasKinds && (
              <div className="flex flex-wrap gap-1.5 mb-2">
                {(['', 'dish', 'raw', 'semi'] as const).map((k) => (
                  <button
                    key={k || 'all'}
                    type="button"
                    onClick={() => setKindFilter(k)}
                    className={
                      'px-3 h-8 text-[11px] font-bold rounded-full border ' +
                      (kindFilter === k ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-500 border-line')
                    }
                  >
                    {k ? MENU_KIND_LABEL[k] : 'Hammasi'}
                  </button>
                ))}
              </div>
            )}
            {menuLoading ? (
              <p className="text-sm text-neutral-500 py-4">Yuklanmoqda…</p>
            ) : menuError ? (
              <p className="text-sm text-red-600 py-4">Menyuni yuklab bo‘lmadi: {apiError(menuErr)}</p>
            ) : !items.length ? (
              <p className="text-sm text-neutral-500 py-4">
                Menyu bo‘sh —{' '}
                <Link href="/kitchen/menu" className="text-blue-600 underline">
                  menyuga qo‘shing
                </Link>{' '}
                yoki pastda qo‘lda qator kiriting.
              </p>
            ) : !groups.length ? (
              <p className="text-sm text-neutral-500 py-4">Mos mahsulot topilmadi</p>
            ) : (
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                {groups.map((g) => (
                  <div key={g.id}>
                    <p className="label mb-1">{g.name}</p>
                    <ul className="divide-y divide-line border border-line rounded-xl">
                      {g.items.map((it) => {
                        const n = qty[it.id] ?? 0;
                        return (
                          <li
                            key={it.id}
                            className={
                              'px-3 py-2 flex items-center gap-3 ' +
                              (n > 0 ? 'bg-gold/10' : '') +
                              (!it.isAvailable ? ' opacity-60' : '')
                            }
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold leading-tight flex items-center gap-1.5 flex-wrap">
                                <span className="break-words">{it.name}</span>
                                <ItemKindBadge kind={it.kind} />
                                {!it.isAvailable && (
                                  <span className="text-[9px] font-bold uppercase tracking-wider text-red-600">
                                    Tugagan
                                  </span>
                                )}
                              </p>
                              <p className="text-xs text-neutral-500 tabular-nums">{som(it.price)} so‘m</p>
                            </div>
                            <QtyStepper value={n} onChange={(v) => setItemQty(it.id, v)} />
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="card p-4">
            <div className="flex items-center gap-2 mb-1">
              <ShoppingBag size={18} className="text-gold-deep" />
              <h3 className="font-bold flex-1">Menyuda yo‘q mahsulot</h3>
              <button
                type="button"
                onClick={() => setCustom((s) => [...s, newLine()])}
                className="btn-secondary h-9 px-3 text-xs"
              >
                <Plus size={14} /> Qator qo‘shish
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 mb-3">
              Masalan: 5 kg go‘sht (xom ashyo), 50 ta chuchvara (yarim tayyor) — nomi, narxi va soni.
            </p>
            {!custom.length ? (
              <p className="text-xs text-neutral-400 py-2">Qator yo‘q</p>
            ) : (
              <div className="space-y-2">
                {custom.map((c) => (
                  <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_110px_70px_36px] gap-2 items-center">
                    <input
                      value={c.name}
                      onChange={(e) =>
                        setCustom((s) => s.map((x) => (x.key === c.key ? { ...x, name: e.target.value } : x)))
                      }
                      maxLength={120}
                      placeholder="Nomi"
                      className="input"
                    />
                    <input
                      value={c.price}
                      onChange={(e) =>
                        setCustom((s) =>
                          s.map((x) =>
                            x.key === c.key ? { ...x, price: e.target.value.replace(/[^\d]/g, '').slice(0, 9) } : x,
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="Narx"
                      className="input tabular-nums"
                    />
                    <input
                      value={c.qty}
                      onChange={(e) =>
                        setCustom((s) =>
                          s.map((x) =>
                            x.key === c.key ? { ...x, qty: e.target.value.replace(/[^\d]/g, '').slice(0, 3) } : x,
                          ),
                        )
                      }
                      inputMode="numeric"
                      placeholder="Soni"
                      className="input tabular-nums text-center"
                    />
                    <button
                      type="button"
                      title="O‘chirish"
                      onClick={() => setCustom((s) => s.filter((x) => x.key !== c.key))}
                      className="w-9 h-9 rounded-lg flex items-center justify-center bg-red-50 text-red-600 hover:bg-red-100"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>

        {/* ------------------------------------------- client + delivery */}
        <div className="space-y-4 min-w-0 lg:sticky lg:top-24">
          <section className="card p-4 space-y-3">
            <div className="flex items-center gap-2">
              <User size={18} className="text-gold-deep" />
              <h3 className="font-bold">Mijoz</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Ismi">
                <input
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  maxLength={120}
                  placeholder="Mijoz"
                  className="input"
                />
              </Field>
              <Field label="Telefon">
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  inputMode="tel"
                  placeholder="+998901234567"
                  className="input font-mono"
                />
              </Field>
            </div>

            <div>
              <span className="label">Qanday oladi</span>
              <div className="mt-1 grid grid-cols-2 gap-1.5">
                {(
                  [
                    ['delivery', 'Yetkazib berish', Truck],
                    ['pickup', 'O‘zi olib ketadi', Store],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setDeliveryType(value)}
                    className={
                      'h-10 rounded-lg text-sm font-bold border inline-flex items-center justify-center gap-1.5 ' +
                      (deliveryType === value ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-600 border-line')
                    }
                  >
                    <Icon size={15} /> {label}
                  </button>
                ))}
              </div>
            </div>

            {!pickup && (
              <>
                <div>
                  <span className="label">Kim yetkazadi</span>
                  <div className="mt-1 grid grid-cols-2 gap-1.5">
                    {(
                      [
                        [true, 'Kuryer chaqirish', Bike],
                        [false, 'O‘zimiz yetkazamiz', Truck],
                      ] as const
                    ).map(([value, label, Icon]) => (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => setCourierPick(value)}
                        className={
                          'h-10 rounded-lg text-sm font-bold border inline-flex items-center justify-center gap-1.5 px-1 ' +
                          (needsCourier === value
                            ? value
                              ? 'bg-violet-600 text-white border-violet-600'
                              : 'bg-ink text-gold border-ink'
                            : 'bg-white text-neutral-600 border-line')
                        }
                      >
                        <Icon size={15} /> {label}
                      </button>
                    ))}
                  </div>
                </div>

                <Field label="Manzil (ko‘cha, uy, mo‘ljal)">
                  <input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    maxLength={255}
                    placeholder="Masalan: Chilonzor 9-kvartal, 12-uy"
                    className="input"
                  />
                </Field>

                <div className="rounded-xl border border-line bg-neutral-50/60 p-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                      <MapPin size={12} /> Xaritadagi nuqta {needsCourier ? '(kuryer uchun shart)' : '(ixtiyoriy)'}
                    </p>
                    {hasPoint && (
                      <a
                        href={osmLink(latN, lngN)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-blue-600 inline-flex items-center gap-1 hover:underline"
                      >
                        Tekshirish <ExternalLink size={12} />
                      </a>
                    )}
                  </div>
                  <input
                    value={paste}
                    onChange={(e) => onPaste(e.target.value)}
                    placeholder="Mijoz yuborgan Google / Yandex havola yoki 41.31, 69.24"
                    className="input"
                  />
                  {pasteMsg && (
                    <p className={'text-[11px] ' + (pasteMsg.ok ? 'text-emerald-700' : 'text-amber-700')}>
                      {pasteMsg.ok ? '✓ ' : ''}
                      {pasteMsg.text}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      value={lat}
                      onChange={(e) => setLat(e.target.value.replace(/[^\d.-]/g, ''))}
                      inputMode="decimal"
                      placeholder="lat 41.311081"
                      className="input tabular-nums font-mono"
                    />
                    <input
                      value={lng}
                      onChange={(e) => setLng(e.target.value.replace(/[^\d.-]/g, ''))}
                      inputMode="decimal"
                      placeholder="lng 69.240562"
                      className="input tabular-nums font-mono"
                    />
                  </div>
                  <p className="text-[11px] text-neutral-500">
                    Yetkazish narxi shu nuqtagacha masofaga qarab avtomatik qo‘shiladi.
                  </p>
                </div>
              </>
            )}

            <Field label="Izoh (ixtiyoriy)">
              <textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={2}
                maxLength={1000}
                placeholder="Qo‘ng‘iroq qilib keling, 3-qavat…"
                className="input h-auto py-2 min-h-[56px]"
              />
            </Field>

            <div>
              <span className="label">Tayyorlash vaqti (daqiqa)</span>
              <div className="mt-1 flex flex-wrap gap-1">
                {PREP_CHOICES.map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setPrepPick(String(m))}
                    className={
                      'flex-1 min-w-[40px] h-9 rounded-lg text-sm font-bold border tabular-nums ' +
                      (prep === String(m) ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-600 border-line')
                    }
                  >
                    {m}
                  </button>
                ))}
                <input
                  value={prep}
                  onChange={(e) => setPrepPick(e.target.value.replace(/[^\d]/g, '').slice(0, 3))}
                  inputMode="numeric"
                  aria-label="Boshqa qiymat"
                  className="input h-9 w-16 text-center tabular-nums"
                />
              </div>
            </div>
          </section>

          <section className="card p-4">
            <p className="label mb-2">Buyurtma</p>
            {!lineCount ? (
              <p className="text-xs text-neutral-400 pb-2">Hali mahsulot tanlanmagan</p>
            ) : (
              <ul className="space-y-1 mb-2">
                {menuLines.map((l) => (
                  <li key={l.item.id} className="flex justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      {l.item.name} <b>× {l.qty}</b>
                    </span>
                    <span className="tabular-nums text-neutral-600 whitespace-nowrap">
                      {som(Number(l.item.price) * l.qty)}
                    </span>
                  </li>
                ))}
                {customLines.map((c) => (
                  <li key={c.key} className="flex justify-between gap-3 text-xs">
                    <span className="min-w-0">
                      {c.name.trim()} <b>× {c.qtyN}</b>
                    </span>
                    <span className="tabular-nums text-neutral-600 whitespace-nowrap">
                      {Number.isFinite(c.priceN) && c.price.trim() ? som(c.priceN * c.qtyN) : '—'}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <div className="border-t border-line pt-2 flex justify-between items-baseline">
              <span className="text-sm text-neutral-500">Mahsulotlar</span>
              <span className="text-lg font-extrabold tabular-nums">
                {som(total)} <span className="text-[10px] font-normal text-neutral-500">so‘m</span>
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {pickup
                ? 'Mijoz o‘zi olib ketadi — yetkazish narxi yo‘q.'
                : hasPoint
                  ? '+ yetkazish narxi (masofaga qarab, saqlanganda hisoblanadi).'
                  : 'Nuqta kiritilmasa yetkazish narxi qo‘shilmaydi.'}
            </p>
            {err && <p className="text-sm text-red-600 mt-2">{err}</p>}
            <button type="submit" disabled={create.isPending} className="btn-primary w-full h-12 text-base mt-3">
              {create.isPending ? <Loader2 size={18} className="animate-spin" /> : <Plus size={18} />}
              Buyurtmani yaratish
            </button>
            <p className="text-[11px] text-neutral-500 mt-2 text-center">
              Buyurtma darhol “Tayyorlanmoqda” bo‘limiga tushadi
              {!pickup && needsCourier ? ' va kuryer qidiriladi' : ''}.
            </p>
          </section>
        </div>
      </form>
    </Shell>
  );
}

function QtyStepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  if (value <= 0)
    return (
      <button
        type="button"
        onClick={() => onChange(1)}
        className="h-9 px-3 rounded-lg bg-ink text-gold text-xs font-bold inline-flex items-center gap-1 shrink-0"
      >
        <Plus size={14} /> Qo‘shish
      </button>
    );
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button
        type="button"
        onClick={() => onChange(value - 1)}
        aria-label="Kamaytirish"
        className="w-9 h-9 rounded-lg border border-line bg-white flex items-center justify-center"
      >
        <Minus size={14} />
      </button>
      <input
        value={String(value)}
        onChange={(e) => onChange(Number(e.target.value.replace(/[^\d]/g, '').slice(0, 3)) || 0)}
        inputMode="numeric"
        aria-label="Soni"
        className="w-12 h-9 rounded-lg border border-line text-center text-sm font-bold tabular-nums outline-none focus:border-ink"
      />
      <button
        type="button"
        onClick={() => onChange(value + 1)}
        aria-label="Ko‘paytirish"
        className="w-9 h-9 rounded-lg bg-ink text-gold flex items-center justify-center"
      >
        <Plus size={14} />
      </button>
    </div>
  );
}
