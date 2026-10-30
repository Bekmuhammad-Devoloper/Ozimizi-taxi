'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Route, AlertCircle, Percent, CheckCircle2, Layers, Plus, Trash2, Clock } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { api } from '@/lib/api';

export default function TariffPage() {
  const qc = useQueryClient();
  const { data } = useQuery({
    queryKey: ['tariff'],
    queryFn: async () => (await api.get('/admin/tariff')).data,
  });

  const [pricePerKm, setPricePerKm] = useState('');
  const [minimumFare, setMinimumFare] = useState('');
  const [commissionPerOrder, setCommissionPerOrder] = useState('');
  const [commissionPercent, setCommissionPercent] = useState('');
  // Distance price table: "up to X km -> Y so'm". Beyond the last row the
  // per-km rate applies on top of that row's price.
  const [tiers, setTiers] = useState<{ uptoKm: string; price: string }[]>([]);
  const [waitingFree, setWaitingFree] = useState('');
  const [waitingPrice, setWaitingPrice] = useState('');
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPricePerKm(String(data.pricePerKm));
    setMinimumFare(String(data.minimumFare));
    setCommissionPerOrder(String(data.commissionPerOrder));
    setCommissionPercent(String(Number(data.commissionPercent ?? 0)));
    setWaitingFree(String(Number(data.waitingFreeMinutes ?? 0)));
    setWaitingPrice(String(Number(data.waitingPricePerMinute ?? 0)));
    setTiers(
      (data.tiers ?? []).map((t: { uptoKm: number; price: number }) => ({
        uptoKm: String(t.uptoKm),
        price: String(t.price),
      })),
    );
  }, [data]);

  const mut = useMutation({
    mutationFn: async () =>
      (
        await api.patch('/admin/tariff', {
          pricePerKm: Number(pricePerKm),
          minimumFare: Number(minimumFare),
          commissionPerOrder: Number(commissionPerOrder),
          commissionPercent: Number(commissionPercent || 0),
          waitingFreeMinutes: Number(waitingFree || 0),
          waitingPricePerMinute: Number(waitingPrice || 0),
          tiers: tiers
            .map((t) => ({ uptoKm: Number(t.uptoKm), price: Number(t.price) }))
            .filter((t) => t.uptoKm > 0 && t.price >= 0),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tariff'] });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    },
  });

  // Commission for a given fare: % when set, otherwise the fixed amount.
  const commissionOf = (fare: number) =>
    Number(commissionPercent) > 0
      ? Math.round((fare * Number(commissionPercent)) / 100)
      : Number(commissionPerOrder || 0);

  const fareTariff = {
    pricePerKm: Number(pricePerKm || 0),
    minimumFare: Number(minimumFare || 0),
    tiers: tiers.map((t) => ({ uptoKm: Number(t.uptoKm), price: Number(t.price) })),
  };
  const example10km = computeFare(10, fareTariff);
  // Last tier (by distance) — beyond it every extra km costs pricePerKm.
  const lastTier = fareTariff.tiers
    .filter((t) => t.uptoKm > 0)
    .sort((a, b) => a.uptoKm - b.uptoKm)
    .at(-1);
  const fmtN = (n: number) => Number(n).toLocaleString('uz');

  return (
    <Shell
      title="Tariflar"
      subtitle="Narx va komissiya sozlamalari"
    >
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* FORM */}
        <div className="lg:col-span-2 card p-6 space-y-5">
          <Field
            icon={<Route size={16} />}
            label={lastTier ? 'Pog‘onalardan keyin har 1 km narxi' : 'Narx 1 km uchun'}
            hint={
              lastTier
                ? `${lastTier.uptoKm} km dan uzoq safar: ${fmtN(lastTier.price)} so‘m + har qo‘shimcha km uchun shu narx`
                : "Asosiy tarif — bosib o'tilgan har bir kilometr uchun"
            }
          >
            <NumberInput
              value={pricePerKm}
              onChange={setPricePerKm}
              suffix="so'm"
            />
          </Field>

          <Field
            icon={<AlertCircle size={16} />}
            label="Minimal narx"
            hint="Buyurtma narxi shundan kam bo'lmaydi (qisqa masofalar uchun)"
          >
            <NumberInput
              value={minimumFare}
              onChange={setMinimumFare}
              suffix="so'm"
            />
          </Field>

          <Field
            icon={<Percent size={16} />}
            label="Komissiya (foizda)"
            hint="Safar narxidan necha foiz tizimga ketadi. 0 bo‘lsa, pastdagi qat’iy summa ishlaydi"
          >
            <NumberInput
              value={commissionPercent}
              onChange={setCommissionPercent}
              suffix="%"
            />
          </Field>

          <Field
            icon={<Percent size={16} />}
            label="Komissiya qat’iy summa (har buyurtma)"
            hint="Foiz 0 bo‘lganda har buyurtmadan shu summa yechiladi"
          >
            <NumberInput
              value={commissionPerOrder}
              onChange={setCommissionPerOrder}
              suffix="so'm"
            />
          </Field>

          <div className="pt-3 border-t border-line grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field
              icon={<Clock size={16} />}
              label="Bepul kutish (daqiqa)"
              hint="Haydovchi yetib kelgach mijozni shuncha daqiqa bepul kutadi"
            >
              <NumberInput value={waitingFree} onChange={setWaitingFree} suffix="daq" />
            </Field>
            <Field
              icon={<Clock size={16} />}
              label="Kutish narxi (har daqiqa)"
              hint="Bepul vaqtdan keyin har daqiqa uchun. 0 — kutish pullik emas. Kutish (mijozni kutish + yo‘ldagi “Kutish”) faqat mashina turganda hisoblanadi, harakat vaqti qo‘shilmaydi"
            >
              <NumberInput value={waitingPrice} onChange={setWaitingPrice} suffix="so'm" />
            </Field>
          </div>

          <div className="pt-3 border-t border-line">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-neutral-400"><Layers size={16} /></span>
              <span className="text-sm font-semibold">Masofa bo‘yicha narx jadvali</span>
            </div>
            <p className="text-xs text-neutral-500 mb-3">
              Masalan: 0.5 km gacha — 5 000, 1 km gacha — 7 000, 5 km gacha — 15 000.
              Oxirgi pog‘onadan uzoq safarlar: oxirgi narx + qo‘shimcha har km uchun
              “Narx 1 km uchun”. Jadval bo‘sh bo‘lsa, oddiy km×narx va minimal narx ishlaydi.
            </p>
            <div className="space-y-2">
              {tiers.map((t, i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      inputMode="decimal"
                      value={t.uptoKm}
                      onChange={(e) =>
                        setTiers((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, uptoKm: e.target.value.replace(/[^\d.]/g, '') } : r,
                          ),
                        )
                      }
                      placeholder="0.5"
                      className="input pr-16 tabular-nums font-bold"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 font-semibold uppercase">
                      km gacha
                    </span>
                  </div>
                  <div className="relative flex-1">
                    <input
                      inputMode="numeric"
                      value={t.price}
                      onChange={(e) =>
                        setTiers((rows) =>
                          rows.map((r, j) =>
                            j === i ? { ...r, price: e.target.value.replace(/[^\d]/g, '') } : r,
                          ),
                        )
                      }
                      placeholder="5000"
                      className="input pr-12 tabular-nums font-bold"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 font-semibold uppercase">
                      so'm
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setTiers((rows) => rows.filter((_, j) => j !== i))}
                    className="w-10 h-10 shrink-0 rounded-lg flex items-center justify-center bg-red-50 text-red-600"
                    title="O'chirish"
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))}
              {lastTier && (
                <div className="flex items-center gap-2 rounded-lg border border-gold/50 bg-gold/10 p-2">
                  <span className="flex-1 text-xs font-semibold">
                    {lastTier.uptoKm} km dan keyin — har qo‘shimcha 1 km:
                  </span>
                  <div className="relative w-40">
                    <input
                      inputMode="numeric"
                      value={pricePerKm}
                      onChange={(e) => setPricePerKm(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="4500"
                      className="input pr-12 tabular-nums font-bold bg-white"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] text-neutral-500 font-semibold uppercase">
                      so'm
                    </span>
                  </div>
                </div>
              )}
              {lastTier && (
                <p className="text-[11px] text-neutral-500">
                  Misol: {lastTier.uptoKm + 2} km = {fmtN(lastTier.price)} + 2 × {fmtN(Number(pricePerKm || 0))} ={' '}
                  <b className="text-ink">{fmtN(computeFare(lastTier.uptoKm + 2, fareTariff))} so‘m</b> (mingga yaxlitlanadi)
                </p>
              )}
              <button
                type="button"
                onClick={() => setTiers((rows) => [...rows, { uptoKm: '', price: '' }])}
                className="btn-secondary"
              >
                <Plus size={16} /> Pog‘ona qo‘shish
              </button>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-line">
            <div>
              {data?.updatedAt && (
                <p className="text-xs text-neutral-500">
                  Oxirgi yangilanish:{' '}
                  {new Date(data.updatedAt).toLocaleString('uz')}
                </p>
              )}
              {savedFlash && (
                <p className="text-xs text-green-700 flex items-center gap-1 mt-1">
                  <CheckCircle2 size={12} /> Saqlandi
                </p>
              )}
            </div>
            <button
              onClick={() => mut.mutate()}
              disabled={mut.isPending}
              className="btn-primary"
            >
              <Save size={16} />
              {mut.isPending ? 'Saqlanmoqda…' : 'Saqlash'}
            </button>
          </div>
        </div>

        {/* PREVIEW */}
        <div className="space-y-4">
          <div className="card p-5">
            <p className="label mb-3">Hisob namunasi</p>
            <ExampleRow km="400 m" total={computeFare(0.4, fareTariff)} commission={commissionOf(computeFare(0.4, fareTariff))} />
            <ExampleRow km="900 m" total={computeFare(0.9, fareTariff)} commission={commissionOf(computeFare(0.9, fareTariff))} />
            <ExampleRow km="3 km" total={computeFare(3, fareTariff)} commission={commissionOf(computeFare(3, fareTariff))} />
            <ExampleRow km="7 km" total={computeFare(7, fareTariff)} commission={commissionOf(computeFare(7, fareTariff))} />
            <ExampleRow km="15 km" total={computeFare(15, fareTariff)} commission={commissionOf(computeFare(15, fareTariff))} />
          </div>

          <div className="bg-ink text-white rounded-2xl p-5 relative overflow-hidden">
            <div
              aria-hidden
              className="absolute -right-6 -top-6 w-24 h-24 rounded-full bg-gold/20 blur-2xl"
            />
            <p className="relative text-[10px] uppercase tracking-widest text-gold font-bold mb-2">
              10 km misol
            </p>
            <p className="relative text-3xl font-extrabold tabular-nums">
              {Number(example10km).toLocaleString('uz')}{' '}
              <span className="text-sm font-normal text-neutral-400">so'm</span>
            </p>
            <p className="relative text-xs text-neutral-400 mt-2">
              Klient to'laydigan jami summa
            </p>
            <div className="relative mt-4 pt-3 border-t border-neutral-700 text-xs text-neutral-300 space-y-1">
              <div className="flex justify-between">
                <span>Komissiya</span>
                <span className="text-white">
                  −{commissionOf(Number(example10km)).toLocaleString('uz')} so'm
                  {Number(commissionPercent) > 0 ? ` (${commissionPercent}%)` : ''}
                </span>
              </div>
              <div className="flex justify-between font-bold text-gold pt-1">
                <span>Haydovchi oladi</span>
                <span>
                  {(
                    Number(example10km) - commissionOf(Number(example10km))
                  ).toLocaleString('uz')}{' '}
                  so'm
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Shell>
  );
}

function Field({
  icon,
  label,
  hint,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-neutral-400">{icon}</span>
        <span className="text-sm font-semibold">{label}</span>
      </div>
      {hint && <p className="text-xs text-neutral-500 mb-2">{hint}</p>}
      {children}
    </label>
  );
}

function NumberInput({
  value,
  onChange,
  suffix,
}: {
  value: string;
  onChange: (v: string) => void;
  suffix?: string;
}) {
  return (
    <div className="relative">
      <input
        inputMode="numeric"
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ''))}
        className="input pr-14 font-bold tabular-nums text-lg h-12"
      />
      {suffix && (
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-neutral-500 font-semibold uppercase">
          {suffix}
        </span>
      )}
    </div>
  );
}

function ExampleRow({
  km,
  total,
  commission,
}: {
  km: string;
  total: number;
  commission: string | number;
}) {
  const net = total - Number(commission || 0);
  return (
    <div className="flex items-center justify-between py-2 border-b border-line last:border-0">
      <span className="text-xs text-neutral-500 font-semibold">{km}</span>
      <div className="text-right">
        <p className="text-sm font-bold tabular-nums">
          {total.toLocaleString('uz')} so'm
        </p>
        <p className="text-[10px] text-neutral-500 tabular-nums">
          driver: {net.toLocaleString('uz')}
        </p>
      </div>
    </div>
  );
}

interface FareTariff {
  pricePerKm: number;
  minimumFare: number;
  tiers: { uptoKm: number; price: number }[];
}

/** Same formula as backend/src/common/utils/fare.ts (rounded to 1000). */
function computeFare(distanceKm: number, t: FareTariff): number {
  const km = Math.max(0, distanceKm);
  const tiers = t.tiers
    .filter((x) => x.uptoKm > 0 && x.price >= 0)
    .sort((a, b) => a.uptoKm - b.uptoKm);
  let raw: number;
  if (tiers.length) {
    const hit = tiers.find((x) => km <= x.uptoKm);
    const last = tiers[tiers.length - 1];
    raw = hit ? hit.price : last.price + (km - last.uptoKm) * t.pricePerKm;
  } else {
    raw = Math.max(km * t.pricePerKm, t.minimumFare);
  }
  return Math.round(raw / 1000) * 1000;
}
