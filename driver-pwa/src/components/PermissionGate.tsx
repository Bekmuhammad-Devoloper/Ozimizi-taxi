'use client';
import { useCallback, useEffect, useState } from 'react';
import { BatteryCharging, Bell, Check, MapPin, Navigation, Settings } from 'lucide-react';
import { AuthShell } from './AuthShell';
import {
  PermKind,
  PermState,
  askPermission,
  isNativeApp,
  openAppSettings,
  permissionState,
} from '@/lib/native';

// Shown once per app start: after "Davom etish" the session does not ask again.
const SESSION_KEY = 'moviy-perms-seen';

const STEPS: { kind: PermKind; icon: React.ReactNode; title: string; why: string }[] = [
  {
    kind: 'location',
    icon: <MapPin size={20} />,
    title: 'Joylashuv (lokatsiya)',
    why: 'Eng yaqin buyurtmalar sizga kelishi va masofa to‘g‘ri hisoblanishi uchun',
  },
  {
    kind: 'backgroundLocation',
    icon: <Navigation size={20} />,
    title: 'Fonda joylashuv — “Har doim ruxsat”',
    why: 'Ilova yopiq yoki ekran o‘chiq bo‘lsa ham safar hisoblanib turadi',
  },
  {
    kind: 'notifications',
    icon: <Bell size={20} />,
    title: 'Bildirishnomalar',
    why: 'Yangi buyurtma kelganda baland signal va xabar chiqishi uchun',
  },
  {
    kind: 'battery',
    icon: <BatteryCharging size={20} />,
    title: 'Batareya cheklovini o‘chirish',
    why: 'Telefon ilovani uxlatib qo‘ymasligi — buyurtmalar uzilmay kelishi uchun',
  },
];

function missing(st: PermState | null): PermKind[] {
  if (!st) return [];
  return STEPS.map((s) => s.kind).filter((k) => st[k] === false);
}

/** Is the permissions screen needed before the login form / dashboard? */
export async function needsPermissionScreen(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    if (sessionStorage.getItem(SESSION_KEY) === '1') return false;
  } catch {
    /* storage blocked — check below */
  }
  return missing(await permissionState()).length > 0;
}

/**
 * First thing in the app: asks, one by one, for everything the driver needs
 * to receive orders. Each row shows its state; returning from Android settings
 * re-checks. "Davom etish" opens once every permission was granted or asked.
 */
export function PermissionGate({ onDone }: { onDone: () => void }) {
  const [st, setSt] = useState<PermState | null>(null);
  const [asked, setAsked] = useState<PermKind[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => setSt(await permissionState()), []);

  useEffect(() => {
    void refresh();
    const onShow = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    document.addEventListener('visibilitychange', onShow);
    window.addEventListener('focus', onShow);
    return () => {
      document.removeEventListener('visibilitychange', onShow);
      window.removeEventListener('focus', onShow);
    };
  }, [refresh]);

  const todo = missing(st);
  const next = todo.find((k) => !asked.includes(k)) ?? null;
  const canContinue = !!st && st.location !== false && todo.every((k) => asked.includes(k));

  const ask = async (kind: PermKind) => {
    setBusy(true);
    try {
      setSt(await askPermission(kind));
      setAsked((a) => (a.includes(kind) ? a : [...a, kind]));
    } finally {
      setBusy(false);
    }
  };

  const finish = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      /* storage blocked */
    }
    onDone();
  };

  return (
    <AuthShell subtitle="Ishni boshlashdan oldin ruxsatlar">
      <div className="flex-1 flex flex-col">
        <p className="text-sm text-neutral-600 leading-relaxed">
          Buyurtmalar o‘z vaqtida kelishi uchun ilovaga quyidagi ruxsatlarni bering. Har birini bosing va
          telefon so‘raganda <b>“Ruxsat berish”</b>ni tanlang.
        </p>

        <div className="mt-5 space-y-2.5">
          {STEPS.map((s) => {
            const v = st ? st[s.kind] : null;
            const ok = v === true;
            const unknown = v === null;
            const wasAsked = asked.includes(s.kind);
            return (
              <button
                key={s.kind}
                type="button"
                disabled={busy || ok || unknown}
                onClick={() => void ask(s.kind)}
                className={
                  'w-full text-left rounded-2xl border px-4 py-3 flex items-center gap-3 active:scale-[0.99] transition ' +
                  (ok
                    ? 'border-emerald-200 bg-emerald-50'
                    : unknown
                      ? 'border-line bg-white opacity-70'
                      : next === s.kind
                        ? 'border-gold bg-gold/10'
                        : 'border-line bg-white')
                }
              >
                <span
                  className={
                    'w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ' +
                    (ok ? 'bg-emerald-500 text-white' : 'bg-gold/15 text-gold-deep')
                  }
                >
                  {ok ? <Check size={20} strokeWidth={3} /> : s.icon}
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-ink">{s.title}</span>
                  <span className="block text-xs text-neutral-500 leading-snug mt-0.5">
                    {ok
                      ? 'Ruxsat berilgan'
                      : unknown
                        ? 'Ilovaning yangi versiyasida so‘raladi'
                        : wasAsked
                          ? 'Berilmadi — qayta bosing yoki sozlamalardan yoqing'
                          : s.why}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        {todo.some((k) => asked.includes(k)) && (
          <button
            type="button"
            onClick={openAppSettings}
            className="mt-3 self-center inline-flex items-center gap-1.5 text-sm font-semibold text-neutral-600 underline underline-offset-4"
          >
            <Settings size={15} /> Telefon sozlamalarini ochish
          </button>
        )}

        <div className="mt-auto pt-8 space-y-3">
          {next && !canContinue ? (
            <button type="button" disabled={busy || !st} onClick={() => void ask(next)} className="btn-primary">
              {busy ? 'Kuting…' : 'Ruxsat berish'}
            </button>
          ) : (
            <button type="button" disabled={!canContinue} onClick={finish} className="btn-primary">
              Davom etish
            </button>
          )}
          {st?.location === false && asked.includes('location') && (
            <p className="text-xs text-center text-red-600">
              Joylashuvsiz buyurtma olib bo‘lmaydi — sozlamalardan joylashuvga ruxsat bering.
            </p>
          )}
        </div>
      </div>
    </AuthShell>
  );
}
