'use client';
import { ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * One line of big text (a sum) that shrinks to fit its place instead of being
 * cut off or wrapped: "1 250 000 so‘m" in a small card on a narrow phone.
 * Typography comes from `className`; it never goes below `min` of that size.
 */
export function FitText({
  children,
  className = '',
  align = 'left',
  min = 0.4,
}: {
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center';
  min?: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const inner = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ s: number; h: number }>({ s: 1, h: 0 });

  const measure = useCallback(() => {
    const b = box.current;
    const i = inner.current;
    if (!b || !i) return;
    // offsetWidth ignores the transform below, so this is always the natural size.
    const w = i.offsetWidth;
    const h = i.offsetHeight;
    const avail = b.clientWidth;
    const s = w > avail && w > 0 ? Math.max(min, avail / w) : 1;
    setFit((f) => (Math.abs(f.s - s) < 0.005 && f.h === h ? f : { s, h }));
  }, [min]);

  // After every render (the sum changes, e.g. the running meter), when the place
  // changes size, and when the text itself does (the web font arriving late).
  useLayoutEffect(measure);
  useEffect(() => {
    if (!box.current || !inner.current || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(measure);
    ro.observe(box.current);
    ro.observe(inner.current);
    return () => ro.disconnect();
  }, [measure]);

  const scaled = fit.s < 1;
  return (
    <div
      ref={box}
      className={'flex min-w-0 max-w-full overflow-hidden ' + (align === 'center' ? 'justify-center ' : '') + className}
      style={scaled ? { height: Math.ceil(fit.h * fit.s) } : undefined}
    >
      {/* self-start: keeps its natural height — stretched to the box it would
          shrink a little more on every measure until nothing was left. */}
      <div
        ref={inner}
        className="whitespace-nowrap shrink-0 self-start"
        style={
          scaled
            ? { transform: `scale(${fit.s})`, transformOrigin: align === 'center' ? 'center top' : 'left top' }
            : undefined
        }
      >
        {children}
      </div>
    </div>
  );
}
