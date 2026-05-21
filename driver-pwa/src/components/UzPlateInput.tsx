'use client';
import { useEffect, useRef } from 'react';

interface Props {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
}

/**
 * Real O'zbekiston davlat raqami uslubidagi input.
 * Visual: ·HUDUD· │ HARF RAQAM HARF │ 🇺🇿 UZ
 */
export function UzPlateInput({ value, onChange, readOnly }: Props) {
  const region = (value || '').slice(0, 2);
  const rest = (value || '').slice(2);
  const restRef = useRef<HTMLInputElement>(null);
  const regionRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (region.length === 2 && document.activeElement === regionRef.current) {
      restRef.current?.focus();
    }
  }, [region]);

  if (readOnly) {
    return (
      <PlateFrame>
        <RegionBox>
          <span className="region-text">{region || '00'}</span>
        </RegionBox>
        <Divider />
        <MainBox>
          <span>{formatRest(rest)}</span>
        </MainBox>
        <UzSection />
      </PlateFrame>
    );
  }

  return (
    <PlateFrame>
      <RegionBox>
        <input
          ref={regionRef}
          value={region}
          onChange={(e) => {
            const r = e.target.value.replace(/\D/g, '').slice(0, 2);
            onChange(r + rest);
          }}
          className="region-text w-full h-full text-center bg-transparent outline-none caret-ink"
          placeholder="00"
          inputMode="numeric"
          maxLength={2}
          aria-label="Hudud kodi"
        />
      </RegionBox>
      <Divider />
      <MainBox>
        <input
          ref={restRef}
          value={rest}
          onChange={(e) => {
            const r = e.target.value
              .toUpperCase()
              .replace(/[^A-Z0-9]/g, '')
              .slice(0, 7);
            onChange(region + r);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Backspace' && !rest && region) {
              regionRef.current?.focus();
            }
          }}
          className="w-full h-full text-center bg-transparent outline-none tracking-[0.25em] caret-ink"
          placeholder="A123BC"
          maxLength={7}
          aria-label="Davlat raqami"
        />
      </MainBox>
      <UzSection />
      <style jsx>{`
        .region-text::before {
          content: '· ';
          color: black;
        }
        .region-text::after {
          content: ' ·';
          color: black;
        }
        .region-text::placeholder {
          color: rgba(0, 0, 0, 0.3);
        }
        .region-text::-webkit-input-placeholder {
          color: rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </PlateFrame>
  );
}

function formatRest(s: string) {
  // Pretty-print: A 123 BC etc.
  if (!s) return '';
  if (s.length <= 4) return s;
  return s.slice(0, 1) + ' ' + s.slice(1, 4) + ' ' + s.slice(4);
}

/* ───────────── parts ───────────── */

function PlateFrame({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="
        relative flex items-stretch
        h-[64px] w-full max-w-[340px] mx-auto
        bg-white border-[3px] border-black
        rounded-[10px] overflow-hidden
        text-black
        shadow-[0_2px_4px_rgba(0,0,0,0.1)]
      "
      style={{ fontFamily: '"Oswald", "Arial Narrow", "DIN Alternate", sans-serif' }}
    >
      {/* inner thin border line */}
      <div
        aria-hidden
        className="absolute inset-[3px] rounded-[6px] border border-black/15 pointer-events-none"
      />
      {/* plate content sized — only number/letter area uses big bold */}
      <div className="plate-text contents text-[28px] font-bold uppercase tracking-[0.04em]">
        {children}
      </div>
    </div>
  );
}

function RegionBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative w-[58px] flex items-center justify-center z-10">
      {children}
    </div>
  );
}

function Divider() {
  return (
    <div
      aria-hidden
      className="relative w-[3px] bg-black my-1 z-10"
    />
  );
}

function MainBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex-1 flex items-center justify-center z-10">
      {children}
    </div>
  );
}

function UzSection() {
  return (
    <div className="relative w-10 flex flex-col items-center justify-center border-l-[3px] border-black bg-white z-10 gap-0.5 py-1">
      <UzFlagSvg />
      <span
        className="text-[10px] font-bold leading-none tracking-[0.05em]"
        style={{ fontFamily: 'Arial, sans-serif' }}
      >
        UZ
      </span>
    </div>
  );
}

function UzFlagSvg() {
  // Uzbekistan flag, accurate proportions, simplified (no crescent/stars).
  return (
    <svg
      viewBox="0 0 24 12"
      width="24"
      height="12"
      className="rounded-[1px] ring-1 ring-black/30 block"
      shapeRendering="crispEdges"
      aria-hidden
    >
      {/* Top: blue */}
      <rect x="0" y="0" width="24" height="4" fill="#0099B5" />
      {/* Middle: white with two red bands */}
      <rect x="0" y="4" width="24" height="4" fill="#FFFFFF" />
      <rect x="0" y="4" width="24" height="0.4" fill="#CE1126" />
      <rect x="0" y="7.6" width="24" height="0.4" fill="#CE1126" />
      {/* Bottom: green */}
      <rect x="0" y="8" width="24" height="4" fill="#1EB53A" />
    </svg>
  );
}
