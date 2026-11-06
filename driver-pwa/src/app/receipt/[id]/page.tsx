'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Image from 'next/image';
import { api } from '@/lib/api';
import { FitText } from '@/components/FitText';

interface Receipt {
  shortId: string;
  receiptNo: string;
  date: string;
  driverName: string;
  car: string;
  plate: string;
  clientName: string;
  from: string;
  to: string;
  distanceKm: number;
  durationMin: number | null;
  waitingMinutes: number;
  waitingFee: number;
  fare: number;
  outsideKm?: number;
  outsideFee?: number;
  price: number;
  discount: number;
  bonusUsed: number;
  cashDue: number;
  imageUrl: string;
}

const money = (n: number) => Math.round(n).toLocaleString('ru-RU').replace(/ /g, ' ');

function fmtDate(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Public page the receipt's QR code points to. */
export default function ReceiptPage() {
  const { id } = useParams<{ id: string }>();
  const [r, setR] = useState<Receipt | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'missing'>('loading');

  useEffect(() => {
    api
      .get<Receipt>(`/public/receipts/${id}`)
      .then((res) => {
        setR(res.data);
        setState('ok');
      })
      .catch(() => setState('missing'));
  }, [id]);

  const apiBase = process.env.NEXT_PUBLIC_API_URL || '';

  return (
    <main className="min-h-[100dvh] bg-neutral-100 flex items-start justify-center px-4 py-6">
      <div className="w-full max-w-md bg-white rounded-3xl shadow-sm overflow-hidden">
        <div className="bg-ink text-white px-6 py-5 flex items-center gap-3">
          <Image src="/icon.jpg" alt="" width={44} height={44} className="rounded-xl" />
          <div>
            <p className="font-extrabold text-gold text-lg leading-tight">MOVIY TAXI</p>
            <p className="text-xs text-neutral-300">Yo‘lovchi tashish xizmati · elektron chek</p>
          </div>
        </div>

        {state === 'loading' && <p className="p-6 text-sm text-neutral-500">Yuklanmoqda…</p>}
        {state === 'missing' && (
          <p className="p-6 text-sm text-red-600">Bunday chek topilmadi yoki safar hali yakunlanmagan.</p>
        )}
        {state === 'ok' && r && (
          <div className="px-6 py-5">
            <p className="text-center font-extrabold tracking-wide">SAFAR CHEKI</p>
            <dl className="mt-4 text-sm divide-y divide-dashed divide-neutral-200">
              <Row k="Chek raqami" v={`№ ${r.receiptNo}`} />
              <Row k="Sana" v={fmtDate(r.date)} />
              <Row k="Haydovchi" v={r.driverName} />
              <Row k="Mashina" v={r.car} />
              <Row k="Davlat raqami" v={r.plate} mono />
              <Row k="Qayerdan" v={r.from} />
              <Row k="Qayerga" v={r.to} />
              <Row k="Masofa" v={`${r.distanceKm.toFixed(1)} km`} />
              {r.durationMin != null && <Row k="Davomiylik" v={`${r.durationMin} daqiqa`} />}
              <Row k="Yo‘l haqi" v={`${money(r.fare)} so‘m`} />
              {Number(r.outsideFee ?? 0) > 0 && (
                <Row
                  k={`Shu jumladan hududdan tashqari (${Number(r.outsideKm ?? 0).toFixed(1)} km)`}
                  v={`${money(r.outsideFee ?? 0)} so‘m`}
                />
              )}
              {(r.waitingMinutes > 0 || r.waitingFee > 0) && (
                <Row k={`Kutish (${r.waitingMinutes} daq)`} v={`${money(r.waitingFee)} so‘m`} />
              )}
              {r.discount > 0 && <Row k="Promo chegirma" v={`− ${money(r.discount)} so‘m`} />}
              {r.bonusUsed > 0 && <Row k="Bonusdan to‘landi" v={`− ${money(r.bonusUsed)} so‘m`} />}
            </dl>
            <div className="mt-4 rounded-2xl bg-blue-50 border border-blue-200 px-4 py-3 flex items-center justify-between gap-3">
              <span className="text-xs font-bold text-blue-900 uppercase tracking-wider shrink-0">Jami</span>
              <FitText className="text-2xl font-extrabold tabular-nums justify-end">{money(r.price)} so‘m</FitText>
            </div>
            {r.cashDue < r.price && (
              <p className="mt-2 text-xs text-neutral-600 text-right">
                Naqd / karta bilan to‘lanadi: <b>{money(r.cashDue)} so‘m</b>
              </p>
            )}
            <a
              href={`${apiBase}${r.imageUrl}`}
              target="_blank"
              rel="noreferrer"
              className="mt-5 block text-center text-sm font-semibold text-blue-700"
            >
              Chek rasmini ochish (PNG)
            </a>
            <p className="mt-4 text-center text-xs text-neutral-500">
              Chek ID: <span className="font-mono">{r.shortId}</span> · Moviy Taxi’dan foydalanganingiz uchun rahmat 💙
            </p>
          </div>
        )}
      </div>
    </main>
  );
}

function Row({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-neutral-500 shrink-0">{k}</dt>
      <dd className={'font-semibold text-right ' + (mono ? 'font-mono' : '')}>{v}</dd>
    </div>
  );
}
