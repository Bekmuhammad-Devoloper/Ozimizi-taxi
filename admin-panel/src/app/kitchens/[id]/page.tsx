'use client';
import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, ChefHat, ListOrdered, MapPin, Phone, Clock, Bike, Truck, BookOpen } from 'lucide-react';
import { Shell } from '@/components/Shell';
import { MenuEditor, useKitchenMenu } from '@/components/MenuEditor';
import { KitchenWalletCard } from '@/components/KitchenWallet';
import { KitchenCouriersCard } from '@/components/KitchenCouriers';
import { resolveMediaUrl, som, type Kitchen } from '@/lib/food';

/** "Narx: 5 000 + 2 000/km (2 km bepul)" style summary of delivery pricing. */
function deliverySummary(k: Kitchen): string {
  if (k.deliveryPricing === 'taxi') return 'Yetkazish narxi: taksi tarifida';
  const parts: string[] = [];
  if (k.deliveryBaseFee != null) parts.push(`${som(k.deliveryBaseFee)} so‘m boshlang‘ich`);
  if (k.deliveryFreeKm != null) parts.push(`${Number(k.deliveryFreeKm)} km bepul`);
  if (k.deliveryPerKm != null) parts.push(`${som(k.deliveryPerKm)} so‘m/km`);
  return parts.length
    ? `Yetkazish narxi: ${parts.join(' · ')} (qolgani umumiy sozlamadan)`
    : 'Yetkazish narxi: umumiy sozlamalar bo‘yicha';
}

/**
 * Admin view of one kitchen: wallet, own couriers and the menu (the kitchen
 * itself uses /kitchen/menu, /kitchen/wallet, /kitchen/couriers).
 */
export default function KitchenMenuPage({ params }: { params: { id: string } }) {
  const base = `/admin/food/kitchens/${params.id}`;
  const { data } = useKitchenMenu(base);
  const k = data?.kitchen;
  const [broken, setBroken] = useState(false);

  return (
    <Shell
      title={k ? k.name : 'Oshxona'}
      subtitle="Hamyon, o‘z kuryerlari va menyu · “Mavjud / Tugagan” — mijoz ko‘rishi yoki ko‘rmasligi"
      actions={
        <div className="flex gap-2">
          <Link href="/kitchens" className="btn-secondary">
            <ArrowLeft size={16} /> Oshxonalar
          </Link>
          <Link href={`/food-orders?kitchen=${params.id}`} className="btn-secondary">
            <ListOrdered size={16} /> Buyurtmalar
          </Link>
        </div>
      }
    >
      {k && (
        <div className="card p-4 mb-4 flex items-center gap-3 flex-wrap">
          <span className="w-14 h-14 rounded-xl overflow-hidden bg-gold/15 text-gold-deep border border-line flex items-center justify-center shrink-0">
            {k.logoUrl && !broken ? (
              <img
                src={resolveMediaUrl(k.logoUrl)}
                alt=""
                onError={() => setBroken(true)}
                className="w-full h-full object-cover"
              />
            ) : (
              <ChefHat size={24} />
            )}
          </span>
          <div className="flex-1 min-w-[180px]">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold">{k.name}</p>
              <span
                className={
                  'inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ' +
                  (!k.isActive
                    ? 'bg-neutral-100 text-neutral-500'
                    : k.isOpen
                      ? 'bg-emerald-50 text-emerald-700'
                      : 'bg-red-50 text-red-700')
                }
              >
                {!k.isActive ? 'O‘chirilgan' : k.isOpen ? 'Ochiq' : 'Yopiq'}
              </span>
            </div>
            <div className="flex items-center gap-3 flex-wrap mt-1 text-xs text-neutral-500">
              {k.address && (
                <span className="inline-flex items-center gap-1">
                  <MapPin size={12} /> {k.address}
                </span>
              )}
              {k.phone && (
                <span className="inline-flex items-center gap-1">
                  <Phone size={12} /> {k.phone}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> {k.prepMinutes} daq
              </span>
              <span>
                Komissiya {Number(k.commissionPercent)}% · min. {som(k.minOrder)} so‘m
              </span>
            </div>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-1 text-xs text-neutral-500">
              <span className="inline-flex items-center gap-1">
                {k.needsCourier === false ? <Truck size={12} /> : <Bike size={12} />}
                {k.needsCourier === false ? 'Odatda o‘zlari yetkazadi' : 'Odatda kuryer chaqiriladi'}
              </span>
              <span>{deliverySummary(k)}</span>
              {k.courierMaxKm != null && (
                <span>· {Number(k.courierMaxKm)} km dan uzoq — taksi tarifida taksi</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 mb-6 items-start">
        <KitchenWalletCard base={base} canAdjust />
        <KitchenCouriersCard base={base} linkDrivers />
      </div>

      <h2 className="font-extrabold text-lg mb-3 flex items-center gap-2">
        <BookOpen size={18} className="text-gold-deep" /> Menyu
      </h2>
      <MenuEditor base={base} uploadPath="/admin/food/upload" />
    </Shell>
  );
}
