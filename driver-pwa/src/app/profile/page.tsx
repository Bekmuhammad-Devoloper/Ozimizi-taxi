'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import Link from 'next/link';
import {
  Camera,
  Car,
  CreditCard,
  TrendingUp,
  LogOut,
  Shield,
  ChevronRight,
  Info,
  Save,
} from 'lucide-react';
import { Shell } from '@/components/Shell';
import { useAuthStore } from '@/stores/auth';
import { disconnectSocket } from '@/lib/socket';
import { api } from '@/lib/api';
import { assetUrl } from '@/lib/asset';
import { UzPlateInput } from '@/components/UzPlateInput';

interface BalanceTx {
  amount: string;
  type: string;
  createdAt: string;
}

export default function ProfilePage() {
  return (
    <Shell>
      <Inner />
    </Shell>
  );
}

function Inner() {
  const driver = useAuthStore((s) => s.driver);
  const setDriver = useAuthStore((s) => s.setDriver);
  const logout = useAuthStore((s) => s.logout);
  const router = useRouter();

  const [carModel, setCarModel] = useState(driver?.carModel ?? '');
  const [carColor, setCarColor] = useState(driver?.carColor ?? '');
  const [carPlate, setCarPlate] = useState(driver?.carPlate ?? '');
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [txs, setTxs] = useState<BalanceTx[]>([]);
  const avatarInput = useRef<HTMLInputElement>(null);
  const carInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api
      .get('/driver/me')
      .then((r) => {
        setDriver(r.data);
        setCarModel(r.data.carModel ?? '');
        setCarColor(r.data.carColor ?? '');
        setCarPlate(r.data.carPlate ?? '');
      })
      .catch(() => {});
    api
      .get('/driver/balance')
      .then((r) => setTxs(r.data.transactions ?? []))
      .catch(() => {});
  }, [setDriver]);

  const todayEarnings = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return txs
      .filter((t) => t.type === 'COMMISSION')
      .filter((t) => new Date(t.createdAt).getTime() >= today.getTime())
      .reduce((s, t) => s + Math.max(0, Number(t.amount)), 0);
  }, [txs]);

  const uploadImage = async (
    file: File,
  ): Promise<string> => {
    const form = new FormData();
    form.append('file', file);
    const { data } = await api.post('/driver/upload', form, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return data.url as string;
  };

  const onAvatar = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    try {
      const url = await uploadImage(file);
      await api.patch('/driver/profile', { avatarUrl: url });
      setDriver({ avatarUrl: url });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Yuklab bo‘lmadi');
    }
  };

  const onCarPhoto = async (file: File | undefined) => {
    if (!file) return;
    setErr(null);
    try {
      const url = await uploadImage(file);
      await api.patch('/driver/profile', { carPhotoUrl: url });
      setDriver({ carPhotoUrl: url });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Yuklab bo‘lmadi');
    }
  };

  const saveCar = async () => {
    setSaving(true);
    setErr(null);
    setSaveMsg(null);
    try {
      if (carModel.trim().length < 2) throw new Error('Mashina modeli majburiy');
      if (carColor.trim().length < 2) throw new Error('Rang majburiy');
      if (carPlate.trim().length < 3) throw new Error('Davlat raqami majburiy');
      const { data } = await api.patch('/driver/profile', {
        carModel: carModel.trim(),
        carColor: carColor.trim(),
        carPlate: carPlate.trim(),
      });
      setDriver({
        carModel: data.carModel,
        carColor: data.carColor,
        carPlate: data.carPlate,
      });
      setSaveMsg('Saqlandi');
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? e?.message ?? 'Xato');
    } finally {
      setSaving(false);
    }
  };

  const onLogout = () => {
    disconnectSocket();
    logout();
    router.replace('/login');
  };

  const initials = (driver?.fullName ?? '?')
    .split(' ')
    .map((s) => s[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <>
      {/* HERO + AVATAR */}
      <header className="relative bg-ink text-white px-6 pt-10 pb-10 rounded-b-3xl overflow-hidden text-center">
        <div
          aria-hidden
          className="absolute inset-0 opacity-30 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at 50% 0%, rgba(250,204,21,0.45), transparent 60%)',
          }}
        />
        <div className="relative inline-block">
          <button
            type="button"
            onClick={() => avatarInput.current?.click()}
            className="w-24 h-24 rounded-full overflow-hidden bg-gold text-ink text-2xl font-extrabold flex items-center justify-center ring-4 ring-gold/30 relative"
          >
            {driver?.avatarUrl ? (
              <Image
                src={assetUrl(driver.avatarUrl)}
                alt="avatar"
                width={96}
                height={96}
                className="w-full h-full object-cover"
              />
            ) : (
              <span>{initials || '?'}</span>
            )}
            <span className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-ink text-gold flex items-center justify-center ring-2 ring-gold">
              <Camera size={14} />
            </span>
          </button>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onAvatar(e.target.files?.[0])}
          />
        </div>
        <h1 className="relative mt-4 text-lg font-bold">
          {driver?.fullName ?? '—'}
        </h1>
        <p className="relative text-sm text-neutral-400">{driver?.phone}</p>
      </header>

      {/* INFO */}
      <section className="px-6 mt-6">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 ml-1">
          Ma'lumotlar
        </p>
        <ul className="bg-white border border-line rounded-2xl overflow-hidden divide-y divide-line">
          <InfoRow
            icon={<TrendingUp size={16} />}
            label="Bugungi daromad"
            valueClass="text-gold-deep font-bold"
          >
            {fmt(todayEarnings)} so‘m
          </InfoRow>
          <li>
            <Link
              href="/balance"
              className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-50 transition-colors"
            >
              <span className="text-neutral-400">
                <CreditCard size={16} />
              </span>
              <span className="text-xs text-neutral-500 flex-1">Balans</span>
              <span className="text-sm font-medium text-right">
                {fmt(driver?.balance ?? 0)} so‘m
              </span>
              <ChevronRight size={14} className="text-neutral-400" />
            </Link>
          </li>
        </ul>
      </section>

      {/* CAR */}
      <section className="px-6 mt-6">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 ml-1">
          Mashina ma'lumotlari
        </p>
        <div className="bg-white border border-line rounded-2xl p-4 space-y-4">
          {/* CAR PHOTO */}
          <button
            type="button"
            onClick={() => carInput.current?.click()}
            className="block w-full"
          >
            {driver?.carPhotoUrl ? (
              <div className="relative w-full aspect-video rounded-xl overflow-hidden">
                <Image
                  src={assetUrl(driver.carPhotoUrl)}
                  alt="car"
                  fill
                  className="object-cover"
                />
                <span className="absolute bottom-2 right-2 w-8 h-8 rounded-full bg-ink text-gold flex items-center justify-center">
                  <Camera size={14} />
                </span>
              </div>
            ) : (
              <div className="w-full aspect-video rounded-xl border-2 border-dashed border-line flex flex-col items-center justify-center text-neutral-400">
                <Car size={28} className="mb-1" />
                <p className="text-xs">Mashina rasmini yuklash</p>
              </div>
            )}
          </button>
          <input
            ref={carInput}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onCarPhoto(e.target.files?.[0])}
          />

          <FormField label="Model (rusmi) *">
            <input
              value={carModel}
              onChange={(e) => setCarModel(e.target.value)}
              placeholder="Chevrolet Cobalt"
              className="input"
            />
          </FormField>
          <FormField label="Rangi *">
            <input
              value={carColor}
              onChange={(e) => setCarColor(e.target.value)}
              placeholder="Oq"
              className="input"
            />
          </FormField>
          <FormField label="Davlat raqami *">
            <UzPlateInput
              value={carPlate}
              onChange={(v) => setCarPlate(v)}
            />
            <p className="mt-1.5 text-[11px] text-neutral-500">
              Format: <span className="font-mono">HUDUD · SERIYA</span>{' '}
              (masalan, <span className="font-mono">01 A123BC</span>)
            </p>
          </FormField>

          {err && <p className="text-sm text-red-600">{err}</p>}
          {saveMsg && <p className="text-sm text-green-700">{saveMsg}</p>}

          <button
            type="button"
            onClick={saveCar}
            disabled={saving}
            className="btn-primary flex items-center justify-center gap-2"
          >
            <Save size={16} /> {saving ? 'Saqlanmoqda…' : 'Saqlash'}
          </button>
        </div>
      </section>

      {/* SECURITY */}
      <section className="px-6 mt-6">
        <p className="text-xs uppercase tracking-wider text-neutral-500 font-semibold mb-2 ml-1">
          Xavfsizlik
        </p>
        <ul className="bg-white border border-line rounded-2xl overflow-hidden">
          <ActionRow
            icon={<Shield size={16} />}
            onClick={() => router.push('/forgot')}
          >
            Parolni o‘zgartirish
          </ActionRow>
        </ul>
      </section>

      {/* INFO BOX */}
      <section className="px-6 mt-6">
        <div className="rounded-2xl bg-gold/10 border border-gold/30 p-4 flex gap-3">
          <Info size={18} className="text-gold-deep shrink-0 mt-0.5" />
          <p className="text-xs text-gold-deep leading-relaxed">
            Mashina ma'lumotlari va rasm to‘liq bo‘lgandagina ONLINE rejimga
            o‘tib, buyurtma qabul qila olasiz.
          </p>
        </div>
      </section>

      {/* LOGOUT */}
      <section className="px-6 mt-6">
        <button
          onClick={onLogout}
          className="w-full h-12 flex items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50 text-red-700 text-sm font-semibold active:scale-[0.98]"
        >
          <LogOut size={16} /> Chiqish
        </button>
      </section>
    </>
  );
}

function InfoRow({
  icon,
  label,
  children,
  valueClass,
}: {
  icon: React.ReactNode;
  label: string;
  children: React.ReactNode;
  valueClass?: string;
}) {
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="text-neutral-400">{icon}</span>
      <span className="text-xs text-neutral-500 flex-1">{label}</span>
      <span
        className={
          'text-sm text-right truncate max-w-[55%] ' +
          (valueClass ?? 'font-medium')
        }
      >
        {children}
      </span>
    </li>
  );
}

function ActionRow({
  icon,
  onClick,
  children,
}: {
  icon: React.ReactNode;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-neutral-50 transition-colors"
      >
        <span className="text-neutral-400">{icon}</span>
        <span className="flex-1 text-sm font-medium">{children}</span>
        <ChevronRight size={16} className="text-neutral-400" />
      </button>
    </li>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="text-xs uppercase tracking-wider text-neutral-500 font-semibold">
        {label}
      </span>
      <div className="mt-1.5">{children}</div>
    </label>
  );
}

function fmt(v: string | number) {
  return Number(v).toLocaleString('uz');
}
