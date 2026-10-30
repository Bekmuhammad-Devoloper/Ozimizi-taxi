'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  BellRing,
  Bike,
  Check,
  ChefHat,
  Clock,
  History,
  Loader2,
  MapPin,
  MessageSquare,
  PackageCheck,
  Phone,
  Power,
  ShoppingBag,
  Banknote,
  CalendarDays,
  Percent,
  Volume2,
  VolumeX,
  X as XIcon,
  ClipboardList,
  Plus,
  Truck,
  Store,
  Wallet,
  Send,
} from 'lucide-react';
import Link from 'next/link';
import { Shell } from '@/components/Shell';
import { StatsCard } from '@/components/StatsCard';
import { FoodStatusBadge } from '@/components/FoodStatusBadge';
import { FoodOrderTags, cashDueOf, isOwnDelivery, isPickup } from '@/components/FoodOrderTags';
import { InstallPrompt } from '@/components/InstallPrompt';
import { useKitchenWallet } from '@/components/KitchenWallet';
import { api } from '@/lib/api';
import { fmtDateTime } from '@/lib/format';
import {
  apiError,
  minutesSince,
  osmLink,
  som,
  timeHM,
  type FoodOrder,
  type FoodStatus,
  type Kitchen,
} from '@/lib/food';

const PREP_CHOICES = [10, 15, 20, 30, 45, 60];
const MUTE_KEY = 'moviy-kitchen-muted';

interface KitchenStatsResp {
  today: number;
  delivered_today: number;
  sales_today: number;
  sales_month: number;
  commission_month: number;
}

const COLUMNS: { status: FoodStatus; title: string; hint: string; head: string }[] = [
  { status: 'NEW', title: 'Yangi', hint: 'Qabul qiling yoki rad eting', head: 'bg-blue-600 text-white' },
  { status: 'COOKING', title: 'Tayyorlanmoqda', hint: 'Tayyor bo‘lgach “Tayyor”ni bosing', head: 'bg-gold text-ink' },
  { status: 'READY', title: 'Tayyor', hint: 'Kuryer / mijoz olib ketishini kutmoqda', head: 'bg-emerald-600 text-white' },
  { status: 'PICKED_UP', title: 'Yo‘lda', hint: 'Mijozga yetkazilmoqda', head: 'bg-violet-600 text-white' },
];

/** Re-render every `ms` so timers ("5 daq oldin") stay fresh. */
function useNow(ms: number) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(t);
  }, [ms]);
  return now;
}

/** Loud phone-like ring made with Web Audio (no asset needed). */
function ring(ctx: AudioContext) {
  const pattern = [988, 784, 988, 784, 988, 784];
  pattern.forEach((f, i) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(g);
    g.connect(ctx.destination);
    const t = ctx.currentTime + i * 0.2;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.35, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
    o.start(t);
    o.stop(t + 0.19);
  });
}

/**
 * Rings every ~4 s while `on`. Browsers keep audio locked until the first
 * click/tap on the page — `blocked` tells the UI to ask for one.
 */
function useAlarm(on: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);
  const [blocked, setBlocked] = useState(false);

  const ensure = useCallback((): AudioContext | null => {
    try {
      if (!ctxRef.current) {
        const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext;
        if (!Ctx) return null;
        ctxRef.current = new Ctx() as AudioContext;
      }
      const ctx = ctxRef.current;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
      return ctx;
    } catch {
      return null;
    }
  }, []);

  // Unlock audio on the first interaction.
  useEffect(() => {
    const unlock = () => {
      const c = ensure();
      if (c) void c.resume().then(() => setBlocked(c.state !== 'running')).catch(() => undefined);
    };
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
    };
  }, [ensure]);

  useEffect(() => {
    if (!on) return;
    const tick = () => {
      const c = ensure();
      if (!c) return;
      setBlocked(c.state !== 'running');
      if (c.state === 'running') ring(c);
    };
    tick();
    const t = window.setInterval(tick, 4000);
    return () => window.clearInterval(t);
  }, [on, ensure]);

  useEffect(
    () => () => {
      void ctxRef.current?.close().catch(() => undefined);
    },
    [],
  );

  const test = () => {
    const c = ensure();
    if (c) ring(c);
  };
  return { blocked: on && blocked, test };
}

/** Blink the tab title while new orders wait for an answer. */
function useTitleBlink(count: number) {
  useEffect(() => {
    if (!count) return;
    const base = document.title;
    let flip = false;
    const t = window.setInterval(() => {
      flip = !flip;
      document.title = flip ? `🔔 ${count} ta yangi buyurtma!` : base;
    }, 1000);
    return () => {
      window.clearInterval(t);
      document.title = base;
    };
  }, [count]);
}

export default function KitchenBoardPage() {
  const qc = useQueryClient();
  const now = useNow(15_000);
  const [tab, setTab] = useState<'active' | 'history'>('active');
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    try {
      setMuted(localStorage.getItem(MUTE_KEY) === '1');
    } catch {
      /* storage blocked */
    }
    if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
      void Notification.requestPermission().catch(() => undefined);
    }
  }, []);

  const { data: me } = useQuery({
    queryKey: ['kitchen-me'],
    queryFn: async () => (await api.get<Kitchen>('/kitchen/me')).data,
    refetchInterval: 60_000,
  });

  const { data: stats } = useQuery({
    queryKey: ['kitchen-stats'],
    queryFn: async () => (await api.get<KitchenStatsResp>('/kitchen/stats')).data,
    refetchInterval: 30_000,
  });

  const active = useQuery({
    queryKey: ['kitchen-orders', 'active'],
    queryFn: async () =>
      (await api.get<FoodOrder[]>('/kitchen/orders', { params: { scope: 'active' } })).data,
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
  });

  const history = useQuery({
    queryKey: ['kitchen-orders', 'history'],
    queryFn: async () =>
      (await api.get<FoodOrder[]>('/kitchen/orders', { params: { scope: 'history' } })).data,
    enabled: tab === 'history',
    refetchInterval: 30_000,
  });

  const orders = active.data ?? [];
  const newOrders = orders.filter((o) => o.status === 'NEW');

  const alarm = useAlarm(newOrders.length > 0 && !muted);
  useTitleBlink(newOrders.length);

  // Desktop notification for each order that just arrived.
  const seen = useRef<Set<string> | null>(null);
  useEffect(() => {
    if (!active.data) return;
    const fresh = active.data.filter((o) => o.status === 'NEW');
    if (seen.current === null) {
      seen.current = new Set(fresh.map((o) => o.id));
      return;
    }
    for (const o of fresh) {
      if (seen.current.has(o.id)) continue;
      seen.current.add(o.id);
      if (typeof Notification !== 'undefined' && Notification.permission === 'granted' && document.hidden) {
        try {
          new Notification(`🔔 Yangi buyurtma #${o.number}`, {
            body: `${o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')} · ${som(o.itemsTotal)} so‘m`,
            tag: o.id,
          });
        } catch {
          /* not allowed */
        }
      }
    }
  }, [active.data]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['kitchen-orders'] });
    qc.invalidateQueries({ queryKey: ['kitchen-stats'] });
  };

  const accept = useMutation({
    mutationFn: async ({
      id,
      prepMinutes,
      needsCourier,
    }: {
      id: string;
      prepMinutes: number;
      /** undefined for pickup orders (no courier question). */
      needsCourier?: boolean;
    }) => (await api.post(`/kitchen/orders/${id}/accept`, { prepMinutes, needsCourier })).data,
    onSuccess: refresh,
    onError: (e) => {
      alert(apiError(e));
      refresh();
    },
  });
  /** Own delivery / pickup steps and "call a courier after all". */
  const step = useMutation({
    mutationFn: async ({ id, action }: { id: string; action: 'call-courier' | 'dispatched' | 'delivered' }) =>
      (await api.post(`/kitchen/orders/${id}/${action}`)).data,
    onSuccess: refresh,
    onError: (e) => {
      alert(apiError(e));
      refresh();
    },
  });
  const reject = useMutation({
    mutationFn: async ({ id, reason }: { id: string; reason: string }) =>
      (await api.post(`/kitchen/orders/${id}/reject`, { reason })).data,
    onSuccess: refresh,
    onError: (e) => {
      alert(apiError(e));
      refresh();
    },
  });
  const ready = useMutation({
    mutationFn: async (id: string) => (await api.post(`/kitchen/orders/${id}/ready`)).data,
    onSuccess: refresh,
    onError: (e) => {
      alert(apiError(e));
      refresh();
    },
  });
  const toggleOpen = useMutation({
    mutationFn: async (isOpen: boolean) => (await api.patch('/kitchen/me', { isOpen })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['kitchen-me'] }),
    onError: (e) => alert(apiError(e)),
  });

  const toggleMute = () => {
    const m = !muted;
    setMuted(m);
    try {
      localStorage.setItem(MUTE_KEY, m ? '1' : '0');
    } catch {
      /* storage blocked */
    }
    if (!m) alarm.test();
  };

  const isOpen = me?.isOpen ?? true;
  const defaultPrep = me?.prepMinutes ?? 20;
  const defaultNeedsCourier = me?.needsCourier !== false;
  const { data: wallet } = useKitchenWallet('/kitchen', 60_000);
  const balance = wallet?.balance;

  const busy = (id: string) =>
    (accept.isPending && accept.variables?.id === id) ||
    (reject.isPending && reject.variables?.id === id) ||
    (ready.isPending && ready.variables === id) ||
    (step.isPending && step.variables?.id === id);

  return (
    <Shell
      title={me?.name ?? 'Buyurtmalar'}
      subtitle="Oshxona paneli · buyurtmalar har 5 soniyada yangilanadi"
      actions={
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/kitchen/new-order"
            className="h-12 px-4 rounded-xl bg-ink text-gold text-sm font-extrabold inline-flex items-center gap-2 shadow-sm"
          >
            <Plus size={18} /> Yangi buyurtma
          </Link>
          {balance != null && (
            <Link
              href="/kitchen/wallet"
              title="Hamyon"
              className={
                'h-12 px-3 rounded-xl border text-sm font-bold inline-flex items-center gap-1.5 tabular-nums ' +
                (balance < 0 ? 'bg-red-50 text-red-700 border-red-200' : 'bg-white text-ink border-line')
              }
            >
              <Wallet size={16} /> {som(balance)}
              <span className="text-[10px] font-semibold opacity-70">so‘m</span>
            </Link>
          )}
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}
            className={
              'h-12 w-12 rounded-xl border flex items-center justify-center ' +
              (muted ? 'bg-red-50 text-red-600 border-red-200' : 'bg-white text-ink border-line')
            }
          >
            {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
          </button>
          <button
            type="button"
            disabled={!me || toggleOpen.isPending}
            onClick={() => {
              if (
                isOpen &&
                !confirm('Oshxonani yopasizmi? Mijozlar yangi buyurtma bera olmaydi (faol buyurtmalar davom etadi).')
              )
                return;
              toggleOpen.mutate(!isOpen);
            }}
            className={
              'h-12 px-5 rounded-xl text-base font-extrabold inline-flex items-center gap-2 shadow-sm disabled:opacity-60 ' +
              (isOpen ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white')
            }
          >
            {toggleOpen.isPending ? <Loader2 size={18} className="animate-spin" /> : <Power size={18} />}
            {isOpen ? 'Ochiq' : 'Yopiq'}
            <span className="text-[11px] font-semibold opacity-80 hidden sm:inline">
              {isOpen ? '· yopish' : '· ochish'}
            </span>
          </button>
        </div>
      }
    >
      <InstallPrompt />
      {balance != null && balance < 0 && (
        <Link
          href="/kitchen/wallet"
          className="mb-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold flex items-center gap-2"
        >
          <Wallet size={16} /> Hamyon balansi manfiy: {som(balance)} so‘m — komissiya qarzi. Administrator
          balansni to‘ldirishi kerak.
        </Link>
      )}
      {!isOpen && me && (
        <div className="mb-4 rounded-2xl border border-red-200 bg-red-50 text-red-700 px-4 py-3 text-sm font-semibold flex items-center gap-2">
          <Power size={16} /> Oshxona yopiq — mijozlar yangi buyurtma bera olmaydi. Ochish uchun yuqoridagi
          “Yopiq” tugmasini bosing.
        </div>
      )}
      {newOrders.length > 0 && (
        <div className="mb-4 rounded-2xl bg-blue-600 text-white px-4 py-3 flex items-center gap-3 animate-pulse">
          <BellRing size={22} />
          <p className="font-extrabold text-base flex-1">
            {newOrders.length} ta yangi buyurtma javob kutmoqda!
          </p>
        </div>
      )}
      {alarm.blocked && !muted && (
        <div className="mb-4 rounded-2xl border border-amber-300 bg-amber-50 text-amber-800 px-4 py-3 text-sm font-semibold">
          🔈 Ovozli signal ishlashi uchun sahifaning istalgan joyini bir marta bosing.
        </div>
      )}

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-4">
        <StatsCard title="Bugun buyurtma" value={stats?.today ?? 0} icon={ShoppingBag} />
        <StatsCard
          title="Bugun yetkazildi"
          value={stats?.delivered_today ?? 0}
          icon={PackageCheck}
          accent="bg-emerald-50 text-emerald-700"
        />
        <StatsCard title="Bugungi savdo" value={som(stats?.sales_today)} unit="so‘m" icon={Banknote} />
        <StatsCard title="Oylik savdo" value={som(stats?.sales_month)} unit="so‘m" icon={CalendarDays} />
        <StatsCard
          title="Oylik komissiya"
          value={som(stats?.commission_month)}
          unit="so‘m"
          icon={Percent}
          hint={me ? `${Number(me.commissionPercent)}% taomlar savdosidan` : undefined}
          className="col-span-2 lg:col-span-1"
        />
      </section>

      <div className="flex gap-1.5 mb-4">
        {(
          [
            ['active', 'Faol buyurtmalar', ClipboardList],
            ['history', 'Tarix', History],
          ] as const
        ).map(([value, label, Icon]) => (
          <button
            key={value}
            onClick={() => setTab(value)}
            className={
              'px-4 h-9 text-xs uppercase tracking-wider font-bold rounded-full border inline-flex items-center gap-1.5 transition-all ' +
              (tab === value ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-500 border-line hover:border-ink')
            }
          >
            <Icon size={14} /> {label}
            {value === 'active' && orders.length > 0 && (
              <span className="ml-0.5 text-[10px] opacity-80">({orders.length})</span>
            )}
          </button>
        ))}
      </div>

      {tab === 'active' ? (
        <>
          {active.isError && (
            <p className="mb-3 text-sm text-red-600">
              Buyurtmalarni yuklab bo‘lmadi: {apiError(active.error)} — qayta urinilmoqda…
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 items-start">
            {COLUMNS.map((col) => {
              const list = orders.filter((o) => o.status === col.status);
              return (
                <div key={col.status} className="rounded-2xl bg-neutral-100/80 border border-line p-2 min-w-0">
                  <div className={'rounded-xl px-3 py-2 mb-2 flex items-center justify-between ' + col.head}>
                    <div>
                      <p className="font-extrabold text-sm">{col.title}</p>
                      <p className="text-[10px] opacity-80">{col.hint}</p>
                    </div>
                    <span className="text-lg font-extrabold tabular-nums">{list.length}</span>
                  </div>
                  {active.isLoading ? (
                    <p className="text-xs text-neutral-500 text-center py-6">Yuklanmoqda…</p>
                  ) : !list.length ? (
                    <p className="text-xs text-neutral-400 text-center py-6">Bo‘sh</p>
                  ) : (
                    <div className="space-y-2">
                      {list.map((o) => (
                        <OrderCard
                          key={o.id}
                          o={o}
                          now={now}
                          defaultPrep={defaultPrep}
                          defaultNeedsCourier={defaultNeedsCourier}
                          busy={busy(o.id)}
                          onAccept={(prepMinutes, needsCourier) =>
                            accept.mutate({ id: o.id, prepMinutes, needsCourier })
                          }
                          onReject={(reason) => reject.mutate({ id: o.id, reason })}
                          onReady={() => ready.mutate(o.id)}
                          onStep={(action) => step.mutate({ id: o.id, action })}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      ) : (
        <HistoryList orders={history.data ?? []} loading={history.isLoading} />
      )}
    </Shell>
  );
}

function OrderCard({
  o,
  now,
  defaultPrep,
  defaultNeedsCourier,
  busy,
  onAccept,
  onReject,
  onReady,
  onStep,
}: {
  o: FoodOrder;
  now: number;
  defaultPrep: number;
  defaultNeedsCourier: boolean;
  busy: boolean;
  onAccept: (prepMinutes: number, needsCourier?: boolean) => void;
  onReject: (reason: string) => void;
  onReady: () => void;
  onStep: (action: 'call-courier' | 'dispatched' | 'delivered') => void;
}) {
  // Follows the kitchen's default until the cook picks another value.
  const [picked, setPrep] = useState<number | null>(null);
  const prep = picked ?? defaultPrep;
  const [courierPick, setCourierPick] = useState<boolean | null>(null);
  const wantCourier = courierPick ?? defaultNeedsCourier;
  const choices = PREP_CHOICES.includes(defaultPrep)
    ? PREP_CHOICES
    : [...PREP_CHOICES, defaultPrep].sort((a, b) => a - b);
  const waited = minutesSince(o.createdAt, now);
  const isNew = o.status === 'NEW';
  const pickup = isPickup(o);
  const own = isOwnDelivery(o);
  const cash = cashDueOf(o);
  // Courier search ended (or never started) while no courier took it.
  const canCallCourier =
    !pickup &&
    !o.courier &&
    (o.status === 'COOKING' || o.status === 'READY') &&
    (o.needsCourier === false || !o.dispatchStage);

  let readyInfo: { text: string; late: boolean } | null = null;
  if (o.status === 'COOKING' && o.acceptedAt && o.prepMinutes) {
    const due = new Date(o.acceptedAt).getTime() + o.prepMinutes * 60_000;
    const left = Math.round((due - now) / 60_000);
    readyInfo =
      left >= 0
        ? { text: `${timeHM(new Date(due))} gacha · ${left} daq qoldi`, late: false }
        : { text: `${timeHM(new Date(due))} edi · ${-left} daq kechikmoqda`, late: true };
  }

  const callCourierBtn = canCallCourier && (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (
          confirm(
            o.needsCourier === false
              ? `#${o.number} uchun kuryer chaqirilsinmi? Endi kuryer olib ketadi.`
              : `#${o.number} uchun kuryer qayta qidirilsinmi?`,
          )
        )
          onStep('call-courier');
      }}
      className="w-full h-10 rounded-xl bg-white border border-violet-300 text-violet-700 font-bold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
    >
      <Bike size={16} /> {o.needsCourier === false ? 'Kuryer chaqirish' : 'Kuryerni qayta chaqirish'}
    </button>
  );

  const deliveredBtn = (label: string, primary = true) => (
    <button
      type="button"
      disabled={busy}
      onClick={() => {
        if (confirm(`#${o.number} — “${label}” deb belgilansinmi? Buyurtma yakunlanadi.`)) onStep('delivered');
      }}
      className={
        'flex-1 h-12 rounded-xl font-extrabold text-base inline-flex items-center justify-center gap-2 disabled:opacity-50 ' +
        (primary ? 'bg-emerald-600 text-white' : 'bg-white text-emerald-700 border border-emerald-300')
      }
    >
      {busy ? <Loader2 size={18} className="animate-spin" /> : <PackageCheck size={18} />} {label}
    </button>
  );

  return (
    <div
      className={
        'rounded-xl bg-white border p-3 shadow-sm ' +
        (isNew ? 'border-blue-400 ring-2 ring-blue-400/40' : 'border-line') +
        (busy ? ' opacity-60' : '')
      }
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-2xl font-extrabold leading-none tabular-nums">#{o.number}</p>
          <p className="text-[11px] text-neutral-500 mt-1 flex items-center gap-1">
            <Clock size={11} /> {timeHM(o.createdAt)} ·{' '}
            <span className={isNew && waited >= 3 ? 'text-red-600 font-bold' : ''}>
              {waited} daq oldin
            </span>
          </p>
        </div>
        <p className="text-right">
          <span className="block text-base font-extrabold tabular-nums">{som(o.itemsTotal)}</span>
          <span className="block text-[10px] text-neutral-500">so‘m · taomlar</span>
        </p>
      </div>

      <FoodOrderTags o={o} view="kitchen" className="mt-2" />

      <ul className="mt-2 space-y-1 border-t border-line pt-2">
        {o.items.map((i, idx) => (
          <li key={`${i.itemId}-${idx}`} className="flex items-baseline justify-between gap-2 text-sm">
            <span className="min-w-0">
              <b className="text-base tabular-nums mr-1">{i.qty}×</b>
              {i.name}
            </span>
            <span className="text-[11px] text-neutral-500 tabular-nums whitespace-nowrap">
              {som(i.price * i.qty)}
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-2 text-[11px] text-neutral-500 flex justify-between gap-2 flex-wrap">
        <span>{pickup ? 'Yetkazishsiz' : `Yetkazish ${som(o.deliveryFee)}`}</span>
        <span>
          Naqd: <b className="text-ink">{som(cash)} so‘m</b>{' '}
          <span className="opacity-80">
            {pickup ? '(mijoz to‘laydi)' : own ? '(siz olasiz)' : '(kuryer oladi)'}
          </span>
        </span>
      </div>

      {o.comment && (
        <p className="mt-2 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs px-2.5 py-1.5 flex gap-1.5">
          <MessageSquare size={13} className="mt-0.5 shrink-0" /> {o.comment}
        </p>
      )}

      <div className="mt-2 space-y-1 text-xs">
        <p className="flex items-center gap-1.5">
          <span className="text-neutral-500">Mijoz:</span>
          <b>{o.clientName ?? '—'}</b>
          {o.phone && (
            <a href={`tel:${o.phone}`} className="ml-auto inline-flex items-center gap-1 font-mono text-blue-700">
              <Phone size={11} /> {o.phone}
            </a>
          )}
        </p>
        {!pickup && (
          <p className="flex items-start gap-1.5 text-neutral-600">
            <MapPin size={12} className="mt-0.5 shrink-0" />
            <span>
              {o.address || 'Manzil xaritada'}{' '}
              <a href={osmLink(o.lat, o.lng)} target="_blank" rel="noreferrer" className="text-blue-600">
                xarita
              </a>
              {o.distanceKm != null && Number(o.distanceKm) > 0 && (
                <span className="text-neutral-400"> · {o.distanceKm} km</span>
              )}
            </span>
          </p>
        )}
      </div>

      {o.courier && (
        <div className="mt-2 rounded-lg bg-violet-50 border border-violet-200 text-violet-800 px-2.5 py-1.5 text-xs">
          <p className="font-bold flex items-center gap-1.5">
            <Bike size={13} /> {o.courier.fullName}
            {o.courier.carPlate && <span className="font-mono font-normal">· {o.courier.carPlate}</span>}
          </p>
          <a href={`tel:${o.courier.phone}`} className="font-mono inline-flex items-center gap-1 mt-0.5">
            <Phone size={11} /> {o.courier.phone}
          </a>
          {o.status === 'PICKED_UP' && o.pickedUpAt && (
            <p className="mt-0.5">Olib ketdi: {timeHM(o.pickedUpAt)}</p>
          )}
        </div>
      )}

      {/* Actions */}
      {isNew && (
        <div className="mt-3 space-y-2">
          <div>
            <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1">
              Tayyorlash vaqti (daqiqa)
            </p>
            <div className="flex flex-wrap gap-1">
              {choices.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPrep(m)}
                  className={
                    'flex-1 min-w-[36px] h-9 rounded-lg text-sm font-bold border tabular-nums ' +
                    (prep === m ? 'bg-ink text-gold border-ink' : 'bg-white text-neutral-600 border-line')
                  }
                >
                  {m}
                </button>
              ))}
            </div>
          </div>
          {pickup ? (
            <p className="rounded-lg bg-sky-50 border border-sky-200 text-sky-800 text-xs font-semibold px-2.5 py-1.5 flex items-center gap-1.5">
              <Store size={13} /> Mijoz oshxonadan o‘zi olib ketadi — kuryer kerak emas
            </p>
          ) : (
            <div>
              <p className="text-[10px] uppercase tracking-wider font-bold text-neutral-500 mb-1">Yetkazish</p>
              <div className="grid grid-cols-2 gap-1">
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
                      'h-10 rounded-lg text-xs font-bold border inline-flex items-center justify-center gap-1.5 px-1 ' +
                      (wantCourier === value
                        ? value
                          ? 'bg-violet-600 text-white border-violet-600'
                          : 'bg-ink text-gold border-ink'
                        : 'bg-white text-neutral-600 border-line')
                    }
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="flex gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const reason = prompt(`#${o.number} buyurtmani rad etish sababi:`, 'Taom tugagan');
                if (reason === null) return;
                onReject(reason.trim() || 'Oshxona qabul qila olmadi');
              }}
              className="h-12 px-4 rounded-xl bg-red-50 text-red-700 border border-red-200 font-bold text-sm inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <XIcon size={16} /> Rad etish
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => onAccept(prep, pickup ? undefined : wantCourier)}
              className="flex-1 h-12 rounded-xl bg-emerald-600 text-white font-extrabold text-base inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : <Check size={18} />} Qabul qilish
            </button>
          </div>
        </div>
      )}

      {o.status === 'COOKING' && (
        <div className="mt-3 space-y-2">
          {readyInfo && (
            <p className={'text-xs font-semibold ' + (readyInfo.late ? 'text-red-600' : 'text-neutral-600')}>
              <ChefHat size={12} className="inline -mt-0.5 mr-1" />
              Tayyor bo‘lishi: {readyInfo.text}
            </p>
          )}
          {!o.courier && !pickup && o.needsCourier !== false && o.dispatchStage && (
            <p className="text-[11px] text-neutral-500 flex items-center gap-1.5">
              <Loader2 size={12} className="animate-spin" />
              {o.dispatchStage === 'own' ? 'O‘z kuryerlaringizga yuborildi…' : 'Kuryer qidirilmoqda…'}
            </p>
          )}
          <button
            type="button"
            disabled={busy}
            onClick={onReady}
            className="w-full h-12 rounded-xl bg-emerald-600 text-white font-extrabold text-base inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {busy ? <Loader2 size={18} className="animate-spin" /> : <PackageCheck size={18} />} Tayyor
          </button>
          {callCourierBtn}
        </div>
      )}

      {o.status === 'READY' && (
        <div className="mt-3 space-y-2">
          {pickup ? (
            <>
              <p className="text-xs font-semibold text-sky-700 flex items-center gap-1.5">
                <Store size={13} /> Mijoz kelib olib ketishini kutmoqda
              </p>
              <div className="flex">{deliveredBtn('Mijoz olib ketdi')}</div>
            </>
          ) : own ? (
            <>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => onStep('dispatched')}
                  className="flex-1 h-12 rounded-xl bg-violet-600 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <Send size={17} />} Yo‘lga chiqdi
                </button>
                {deliveredBtn('Yetkazildi', false)}
              </div>
              {callCourierBtn}
            </>
          ) : o.courier ? (
            <p className="text-xs font-semibold text-emerald-700 flex items-center gap-1.5">
              <Bike size={13} /> Kuryer yo‘lda — buyurtmani topshiring
            </p>
          ) : (
            <>
              <p className="h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-sm font-bold flex items-center justify-center gap-2">
                {o.dispatchStage ? <Loader2 size={15} className="animate-spin" /> : null}
                {o.dispatchStage === 'own'
                  ? 'O‘z kuryerlaringiz kutilmoqda'
                  : o.dispatchStage
                    ? 'Kuryer kutilmoqda'
                    : 'Kuryer topilmadi'}
              </p>
              {callCourierBtn}
            </>
          )}
          {o.readyAt && <p className="text-[11px] text-neutral-500">Tayyor bo‘ldi: {timeHM(o.readyAt)}</p>}
        </div>
      )}

      {o.status === 'PICKED_UP' && (own || pickup) && (
        <div className="mt-3 space-y-1">
          {o.pickedUpAt && (
            <p className="text-[11px] text-neutral-500">Yo‘lga chiqdi: {timeHM(o.pickedUpAt)}</p>
          )}
          <div className="flex">{deliveredBtn(pickup ? 'Mijoz olib ketdi' : 'Yetkazildi')}</div>
        </div>
      )}
    </div>
  );
}

function HistoryList({ orders, loading }: { orders: FoodOrder[]; loading: boolean }) {
  if (loading) return <p className="text-sm text-neutral-500">Yuklanmoqda…</p>;
  if (!orders.length)
    return (
      <div className="card p-8 text-center text-sm text-neutral-500">
        <History size={28} className="mx-auto mb-2 text-neutral-300" />
        Hali yakunlangan buyurtma yo‘q
      </div>
    );
  return (
    <div className="card overflow-hidden">
      <ul className="divide-y divide-line">
        {orders.map((o) => (
          <li key={o.id} className="px-4 py-3 flex items-start gap-3 flex-wrap">
            <div className="w-16 shrink-0">
              <p className="font-extrabold tabular-nums">#{o.number}</p>
              <p className="text-[10px] text-neutral-500">{timeHM(o.createdAt)}</p>
            </div>
            <div className="flex-1 min-w-[200px]">
              <div className="flex items-center gap-2 flex-wrap">
                <FoodStatusBadge status={o.status} />
                <span className="text-[11px] text-neutral-500">{fmtDateTime(o.createdAt)}</span>
              </div>
              <FoodOrderTags o={o} view="kitchen" className="mt-1" />
              <p className="text-xs text-neutral-700 mt-1">
                {o.items.map((i) => `${i.name} × ${i.qty}`).join(', ')}
              </p>
              <p className="text-[11px] text-neutral-500 mt-0.5">
                {o.clientName ?? 'Mijoz'}
                {o.courier ? ` · kuryer: ${o.courier.fullName}` : ''}
                {o.deliveredAt ? ` · yetkazildi ${timeHM(o.deliveredAt)}` : ''}
              </p>
              {o.rejectReason && (
                <p className="text-[11px] text-red-600 mt-0.5">Sabab: {o.rejectReason}</p>
              )}
              {o.status === 'CANCELLED' && o.cancelledBy && (
                <p className="text-[11px] text-red-600 mt-0.5">
                  Bekor qildi: {o.cancelledBy === 'client' ? 'mijoz' : o.cancelledBy === 'admin' ? 'admin' : o.cancelledBy}
                </p>
              )}
            </div>
            <div className="text-right">
              <p className="font-bold tabular-nums">
                {som(o.itemsTotal)} <span className="text-[10px] font-normal text-neutral-500">so‘m</span>
              </p>
              {o.status === 'DELIVERED' && Number(o.kitchenCommission ?? 0) > 0 && (
                <p className="text-[10px] text-neutral-500 tabular-nums">
                  komissiya {som(o.kitchenCommission)}
                </p>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
