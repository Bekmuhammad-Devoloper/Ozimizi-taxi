import Image from 'next/image';

// next/image does not add basePath to local srcs; the app lives under /client.
const BASE = process.env.NEXT_PUBLIC_BASE_PATH || '';

export function BrandHeader({ subtitle }: { subtitle?: string }) {
  return (
    <div className="-mx-6 px-6 pt-12 pb-8 bg-ink text-white rounded-b-[2rem] mb-6 relative overflow-hidden">
      <div aria-hidden className="absolute -right-10 -top-10 w-48 h-48 rounded-full bg-gold/20 blur-3xl" />
      <div className="relative flex flex-col items-center text-center">
        <span className="w-20 h-20 rounded-3xl overflow-hidden ring-2 ring-gold/60 shadow-lg">
          <Image src={`${BASE}/logo.jpg`} alt="" width={80} height={80} className="w-full h-full object-cover" priority unoptimized />
        </span>
        <p className="mt-4 text-lg font-extrabold tracking-[0.2em]">
          MOVIY <span className="text-gold">TAXI</span>
        </p>
        {subtitle && <p className="mt-1 text-sm text-neutral-300">{subtitle}</p>}
      </div>
    </div>
  );
}
