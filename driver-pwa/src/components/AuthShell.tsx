import { ReactNode } from 'react';
import { BrandHeader } from './BrandHeader';

/**
 * Mobile-first auth layout.
 * - Mobile: full-bleed dark hero + form fills viewport.
 * - Desktop (sm+): card centered with comfortable max-width.
 */
export function AuthShell({
  subtitle,
  children,
}: {
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <main className="min-h-[100dvh] bg-paper flex sm:items-center sm:justify-center sm:p-6">
      <div className="w-full sm:max-w-md sm:rounded-3xl sm:border sm:border-line sm:overflow-hidden sm:shadow-xl sm:bg-paper">
        <div className="px-6 pb-8 flex flex-col min-h-[100dvh] sm:min-h-0">
          <BrandHeader subtitle={subtitle} />
          <div className="flex-1 flex flex-col">{children}</div>
        </div>
      </div>
    </main>
  );
}
