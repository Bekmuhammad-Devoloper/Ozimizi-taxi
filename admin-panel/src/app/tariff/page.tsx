'use client';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save, Route, AlertCircle, Percent, CheckCircle2 } from 'lucide-react';
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
  const [savedFlash, setSavedFlash] = useState(false);

  useEffect(() => {
    if (!data) return;
    setPricePerKm(String(data.pricePerKm));
    setMinimumFare(String(data.minimumFare));
    setCommissionPerOrder(String(data.commissionPerOrder));
  }, [data]);

  const mut = useMutation({
    mutationFn: async () =>
      (
        await api.patch('/admin/tariff', {
          pricePerKm: Number(pricePerKm),
          minimumFare: Number(minimumFare),
          commissionPerOrder: Number(commissionPerOrder),
        })
      ).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tariff'] });
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2000);
    },
  });

  const example10km =
    Number(pricePerKm) * 10 < Number(minimumFare)
      ? Number(minimumFare)
      : Number(pricePerKm) * 10;

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
            label="Narx 1 km uchun"
            hint="Asosiy tarif — bosib o'tilgan har bir kilometr uchun"
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
            label="Komissiya har buyurtma uchun"
            hint="Har buyurtmadan tizim foydasi (haydovchining balansidan yechiladi)"
          >
            <NumberInput
              value={commissionPerOrder}
              onChange={setCommissionPerOrder}
              suffix="so'm"
            />
          </Field>

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
            <ExampleRow km="3 km" total={calcPrice(3, pricePerKm, minimumFare)} commission={commissionPerOrder} />
            <ExampleRow km="7 km" total={calcPrice(7, pricePerKm, minimumFare)} commission={commissionPerOrder} />
            <ExampleRow km="15 km" total={calcPrice(15, pricePerKm, minimumFare)} commission={commissionPerOrder} />
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
                  −{Number(commissionPerOrder || 0).toLocaleString('uz')} so'm
                </span>
              </div>
              <div className="flex justify-between font-bold text-gold pt-1">
                <span>Haydovchi oladi</span>
                <span>
                  {(
                    Number(example10km) - Number(commissionPerOrder || 0)
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
  commission: string;
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

function calcPrice(km: number, pricePerKm: string, minimumFare: string): number {
  const p = km * Number(pricePerKm || 0);
  const min = Number(minimumFare || 0);
  return Math.max(p, min);
}
