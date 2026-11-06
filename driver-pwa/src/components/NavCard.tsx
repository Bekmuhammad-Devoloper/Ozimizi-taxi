'use client';
import {
  ArrowUp,
  ArrowUpLeft,
  ArrowUpRight,
  CornerUpLeft,
  CornerUpRight,
  Flag,
  LucideIcon,
  Navigation,
  RefreshCw,
  Undo2,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { VoiceNavView } from '@/hooks/useVoiceNav';
import { NavIcon, fmtDist } from '@/lib/voice-nav';

const ICONS: Record<NavIcon, LucideIcon> = {
  left: CornerUpLeft,
  right: CornerUpRight,
  slight_left: ArrowUpLeft,
  slight_right: ArrowUpRight,
  sharp_left: CornerUpLeft,
  sharp_right: CornerUpRight,
  uturn: Undo2,
  straight: ArrowUp,
  keep_left: ArrowUpLeft,
  keep_right: ArrowUpRight,
  roundabout: RefreshCw,
  arrive: Flag,
};

const WAITING: Record<string, string> = {
  'waiting-gps': 'GPS kutilmoqda…',
  routing: 'Yo‘l hisoblanmoqda…',
  failed: 'Yo‘lni hisoblab bo‘lmadi. Yandex tugmasidan foydalaning.',
};

/** The next turn: what to do, in how many metres, with the voice on/off switch. */
export function NavCard({ nav }: { nav: VoiceNavView }) {
  if (nav.state === 'off') return null;
  const m = nav.next;
  const Icon = m ? ICONS[m.icon] : Navigation;
  const street = m?.street?.trim();
  const minutes = Math.max(1, Math.round(nav.remainSec / 60));
  return (
    <section className="px-6 mt-4">
      <div className="bg-ink text-white rounded-2xl p-4 flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gold text-ink flex items-center justify-center shrink-0">
          <Icon size={26} strokeWidth={2.6} />
        </div>
        <div className="flex-1 min-w-0">
          {nav.state === 'ok' && m ? (
            <>
              <p className="text-xl font-extrabold tabular-nums leading-tight">{fmtDist(nav.distM)}</p>
              <p className="text-sm font-semibold leading-snug">{m.text}</p>
              <p className="text-xs text-neutral-400 truncate mt-0.5">
                {fmtDist(nav.remainM)} · ~{minutes} daq
                {street ? ` · ${street}` : ''}
              </p>
            </>
          ) : (
            <p className="text-sm text-neutral-300 leading-snug">{WAITING[nav.state]}</p>
          )}
        </div>
        <button
          type="button"
          onClick={nav.toggleMute}
          aria-label={nav.muted ? 'Ovozni yoqish' : 'Ovozni o‘chirish'}
          className={
            'w-11 h-11 rounded-full flex items-center justify-center shrink-0 active:scale-95 ' +
            (nav.muted ? 'bg-neutral-800 text-neutral-400' : 'bg-white/10 text-gold')
          }
        >
          {nav.muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
      </div>
    </section>
  );
}
