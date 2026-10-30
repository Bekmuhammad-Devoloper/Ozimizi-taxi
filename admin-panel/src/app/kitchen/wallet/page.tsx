'use client';
import { Shell } from '@/components/Shell';
import { KitchenWalletCard } from '@/components/KitchenWallet';

/** Kitchen wallet: balance + movements (read-only — the admin tops it up). */
export default function KitchenWalletPage() {
  return (
    <Shell
      title="Hamyon"
      subtitle="Balansni admin to‘ldiradi; har yetkazilgan buyurtmadan komissiya shu yerdan yechiladi"
    >
      <div className="max-w-2xl">
        <KitchenWalletCard base="/kitchen" />
      </div>
    </Shell>
  );
}
