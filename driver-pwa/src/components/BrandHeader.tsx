import Image from 'next/image';

/**
 * Brand hero — used at the top of all auth screens.
 * Dark band that bleeds to viewport edges on mobile.
 */
export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <header className="relative -mx-6 mb-8 bg-ink text-white px-6 pt-12 pb-10 rounded-b-3xl overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 opacity-30 pointer-events-none"
        style={{
          background:
            'radial-gradient(circle at 50% 0%, rgba(250,204,21,0.35), transparent 60%)',
        }}
      />
      <div className="relative flex flex-col items-center">
        <div className="w-20 h-20 mb-4 rounded-2xl overflow-hidden ring-2 ring-gold/50 shadow-xl shadow-gold/20">
          <Image
            src="/logo.jpg"
            alt="OZIMIZNI TAXI"
            width={80}
            height={80}
            className="w-full h-full object-cover"
            priority
          />
        </div>
        <h1 className="text-lg font-extrabold tracking-[0.18em] text-gold">
          OZIMIZNI TAXI
        </h1>
        {subtitle && (
          <p className="text-sm text-neutral-300 mt-1">{subtitle}</p>
        )}
      </div>
    </header>
  );
}
