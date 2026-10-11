import { useEffect, useRef, useState } from 'react';

const reduced = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * A number that runs to its new value instead of jumping (a quarter second, eased), and which way it
 * last went (for a brief flash). For those who prefer less motion it jumps.
 */
export function useTweened(value: number, ms = 260): { value: number; trend: 'up' | 'down' | null } {
  const [shown, setShown] = useState(value);
  const [trend, setTrend] = useState<'up' | 'down' | null>(null);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value) return;
    setTrend(value > start ? 'up' : 'down');
    const clear = setTimeout(() => setTrend(null), 600);
    if (reduced()) {
      from.current = value;
      setShown(value);
      return () => clearTimeout(clear);
    }
    const t0 = performance.now();
    let raf = 0;
    const step = (now: number) => {
      const k = Math.min(1, (now - t0) / ms);
      const v = start + (value - start) * (1 - Math.pow(1 - k, 3));
      from.current = v;
      setShown(v);
      if (k < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(clear);
    };
  }, [value, ms]);
  return { value: shown, trend };
}
