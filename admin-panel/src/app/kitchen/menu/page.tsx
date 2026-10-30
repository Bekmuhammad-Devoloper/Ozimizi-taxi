'use client';
import { Shell } from '@/components/Shell';
import { MenuEditor } from '@/components/MenuEditor';

/** The kitchen edits its own menu. */
export default function KitchenMenuPage() {
  return (
    <Shell
      title="Menyu"
      subtitle="Taom tugasa “Tugagan” qiling — mijozga ko‘rinmaydi; qaytsa “Mavjud”"
    >
      <MenuEditor base="/kitchen" uploadPath="/kitchen/upload" />
    </Shell>
  );
}
