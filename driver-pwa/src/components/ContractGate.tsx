'use client';
import { useState } from 'react';
import { FileSignature } from 'lucide-react';
import { api } from '@/lib/api';
import { useAuthStore } from '@/stores/auth';
import { ContractText } from './ContractText';

/**
 * Blocks the app until the driver has accepted the agreement once. Drivers
 * who registered before the contract existed see it on their next login;
 * new registrations accept it on the sign-up form.
 */
export function ContractGate() {
  const driver = useAuthStore((s) => s.driver);
  const setDriver = useAuthStore((s) => s.setDriver);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (!driver || driver.contractAcceptedAt) return null;

  const accept = async () => {
    setBusy(true);
    setErr(null);
    try {
      const { data } = await api.post<{ contractAcceptedAt: string }>('/driver/contract/accept');
      setDriver({ contractAcceptedAt: data.contractAcceptedAt });
    } catch (e: any) {
      setErr(e?.response?.data?.message ?? 'Saqlab bo‘lmadi, qayta urinib ko‘ring');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] bg-white flex flex-col max-w-md mx-auto">
      <div className="bg-ink text-white px-6 pt-10 pb-6">
        <div className="w-12 h-12 rounded-2xl bg-gold/20 text-gold flex items-center justify-center mb-3">
          <FileSignature size={24} />
        </div>
        <h1 className="text-xl font-extrabold">Haydovchi shartnomasi</h1>
        <p className="text-sm text-neutral-300 mt-1">
          Ishni boshlashdan oldin shartnoma shartlarini o‘qib, rozilik bildiring.
        </p>
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-4">
        <ContractText />
      </div>
      <div className="px-6 pb-8 pt-3 border-t border-line bg-white space-y-3">
        <label className="flex items-start gap-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
            className="mt-0.5 w-5 h-5 accent-[#3b9bff]"
          />
          <span>Shartnoma shartlari bilan tanishdim va ularga roziman</span>
        </label>
        {err && <p className="text-sm text-red-600">{err}</p>}
        <button type="button" onClick={accept} disabled={!checked || busy} className="btn-primary disabled:opacity-50">
          {busy ? 'Saqlanmoqda…' : '✅ Tasdiqlayman'}
        </button>
      </div>
    </div>
  );
}
